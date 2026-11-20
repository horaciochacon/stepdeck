// `diagram` in Chrome (slide kit 1, task 3). Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test --test-concurrency=1 test/browser/diagram.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { check } from "../../cli/check.js";
import { formatProblem } from "../../cli/problems.js";
import {
  deckPages,
  goTo,
  expectJumpEqualsPlayed,
  expectBackwardEqualsJump,
  expectInterruptEqualsJump,
  expectAnimatedStepMoves,
} from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const deck = fileURLToPath(new URL("../fixtures/decks/diagram/", import.meta.url));
const pages = deckPages("test/fixtures/decks/diagram/");
const FLOW = ["start", "model", "result", "all", "focus"];

// What a viewer sees of each part: { id: "visible" | "hidden" }, read from computed style.
const parts = (page, el = "flow") =>
  page.evaluate((el) => {
    const out = {};
    for (const g of document.querySelectorAll(`[data-el="${el}"] [data-part]`)) out[g.dataset.id] = getComputedStyle(g).visibility;
    return out;
  }, el);

test("jump equals played", async () => {
  await withPage({ root, url: pages.url("flow", "step=start") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "flow", steps: FLOW, id: "flow" });
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "edges", steps: ["nodes", "edge"], id: "pair" });
  });
});

test("backward equals jump", async () => {
  await withPage({ root, url: pages.url("flow", "step=start") }, async (page, ctx) => {
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "flow", steps: FLOW, id: "flow" });
  });
});

test("interrupt mid-motion equals jump", async () => {
  await withPage({ root, url: pages.url("flow", "step=start") }, async (page, ctx) => {
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "flow", from: "start", via: "model", to: "all", id: "flow" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "flow", from: "model", via: "result", to: "start", id: "flow" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "flow", from: "all", via: "focus", to: "result", id: "flow" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "edges", from: "nodes", via: "edge", to: "nodes", id: "pair" });
  });
});

test("animated step moves", async () => {
  await withPage({ root, url: pages.url("flow", "step=start") }, async (page, ctx) => {
    // A newly shown node fades in.
    const node = await expectAnimatedStepMoves(ctx, page, {
      pages, slide: "flow", from: "start", to: "model", id: "flow",
      probe: (p) => p.evaluate(() => getComputedStyle(document.querySelector('[data-el="flow"] [data-id="model"]')).opacity),
    });
    assert.ok(Number(node.mid) < 1, `the node is part-way through its fade (${node.mid})`);
    // A newly shown edge draws: its dash offset is mid-way.
    await expectAnimatedStepMoves(ctx, page, {
      pages, slide: "edges", from: "nodes", to: "edge", id: "pair",
      probe: (p) => p.evaluate(() => document.querySelector('[data-el="pair"] [data-id="link"] line')?.style.strokeDashoffset || "settled"),
    });
    // Highlight fades the others.
    await expectAnimatedStepMoves(ctx, page, { pages, slide: "flow", from: "all", to: "focus", id: "flow" });
  });
});

test("shown hides parts that keep their place; backward hides them again", async () => {
  await withPage({ root, url: pages.url("flow", "step=start&motion=full") }, async (page, ctx) => {
    const geometry = (p) => p.evaluate(() => [...document.querySelectorAll('[data-el="flow"] [data-part]')].map((g) => { const r = g.getBBox(); return [g.dataset.id, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(" "); }));
    const atStart = await geometry(page);
    const start = await parts(page);
    assert.equal(start.data, "visible");
    for (const id of ["model", "result", "check", "fit", "all", "data->model", "model->result", "check->model"]) assert.equal(start[id], "hidden", id);
    await goTo(page, "flow", "model");
    const model = await parts(page);
    for (const id of ["data", "model", "fit", "data->model"]) assert.equal(model[id], "visible", id);
    for (const id of ["result", "all", "model->result"]) assert.equal(model[id], "hidden", id);
    await goTo(page, "flow", "all");
    assert.ok(Object.values(await parts(page)).every((v) => v === "visible"), "everything is shown at 'all'");
    assert.deepEqual(await geometry(page), atStart, "group boxes and nodes do not move or resize between steps");
    await goTo(page, "flow", "start");
    assert.deepEqual(await parts(page), start, "going back hides them again");
    assert.deepEqual(ctx.errors, []);
  });
});

test("edge appears only when listed in shown", async () => {
  await withPage({ root, url: pages.url("edges", "step=nodes") }, async (page, ctx) => {
    let seen = await parts(page, "pair");
    assert.deepEqual([seen.a, seen.b, seen.link], ["visible", "visible", "hidden"]);
    const tag = () => page.evaluate(() => getComputedStyle(document.querySelector('[data-el="pair"] [data-for="link"] .sd-diagram-edge-label')).visibility);
    assert.equal(await tag(), "hidden", "the edge's label hides with it");
    await goTo(page, "edges", "edge");
    assert.equal(await tag(), "visible");
    seen = await parts(page, "pair");
    assert.deepEqual([seen.a, seen.b, seen.link], ["visible", "visible", "visible"]);
    // The arrow ends on the target's border, and its label sits off the line.
    const geo = await page.evaluate(() => {
      const el = document.querySelector('[data-el="pair"]');
      const line = el.querySelector('[data-id="link"] line');
      const b = el.querySelector('[data-id="b"] .sd-diagram-shape').getBBox();
      const label = el.querySelector('[data-for="link"] .sd-diagram-edge-label').getBoundingClientRect();
      const lineBox = line.getBoundingClientRect();
      return { marker: line.getAttribute("marker-end"), x2: Number(line.getAttribute("x2")), bx: b.x, labelBottom: label.bottom, lineTop: lineBox.top };
    });
    assert.match(geo.marker, /^url\(#.+\)$/);
    assert.ok(geo.x2 <= geo.bx && geo.x2 > geo.bx - 20, `the line ends just before the target border (${geo.x2} vs ${geo.bx})`);
    assert.ok(geo.labelBottom <= geo.lineTop + 1, "the edge label sits above a horizontal line");
    assert.deepEqual(ctx.errors, []);
  });
});

test("highlight dims the rest; labels turn muted, never faint", async () => {
  await withPage({ root, url: pages.url("flow", "step=focus") }, async (page) => {
    const dim = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-el="flow"] [data-part]')].map((g) => [g.dataset.id, g.dataset.dim])));
    assert.equal(dim.model, "false");
    assert.equal(dim.result, "false");
    assert.equal(dim["model->result"], "false");
    assert.equal(dim.data, "true");
    assert.equal(dim.check, "true");
    const [dataShape, dataText, modelShape] = await page.evaluate(() => {
      const q = (s) => document.querySelector(`[data-el="flow"] ${s}`);
      return [getComputedStyle(q('[data-id="data"] .sd-diagram-shape')).opacity, getComputedStyle(q('[data-id="data"] .sd-diagram-text')).opacity, getComputedStyle(q('[data-id="model"] .sd-diagram-shape')).opacity];
    });
    assert.ok(Number(dataShape) < 1, "a dimmed shape fades");
    assert.equal(Number(dataText), 1, "dimmed text keeps full opacity (contrast)");
    assert.equal(Number(modelShape), 1);
  });
});

test("text is at least 28px", async () => {
  await withPage({ root, url: pages.url("flow", "step=all") }, async (page) => {
    const sizes = await page.evaluate(() => {
      const min = parseFloat(getComputedStyle(document.querySelector(".sd-canvas")).getPropertyValue("--sd-min-audience-font"));
      const px = (sel) => [...document.querySelectorAll(`[data-el="flow"] ${sel}`)].map((n) => parseFloat(getComputedStyle(n).fontSize));
      return { min, text: px(".sd-diagram-text"), sub: px(".sd-diagram-sub"), edge: px(".sd-diagram-edge-label"), group: px(".sd-diagram-legend") };
    });
    assert.equal(sizes.min, 28);
    assert.equal(sizes.text.length, 4);
    for (const [k, v] of Object.entries(sizes)) if (k !== "min") assert.ok(v.length >= 1 && v.every((s) => s >= 28), `${k} ${v}`);
  });
  await withPage({ root, url: pages.url("edges", "step=edge") }, async (page) => {
    const edge = await page.evaluate(() => [...document.querySelectorAll('[data-el="pair"] .sd-diagram-edge-label')].map((n) => parseFloat(getComputedStyle(n).fontSize)));
    assert.ok(edge.length === 1 && edge[0] >= 28, `edge label ${edge}`);
  });
});

test("long label wraps inside its node box", async () => {
  await withPage({ root, url: pages.url("long", "") }, async (page, ctx) => {
    const r = await page.evaluate(() => {
      const g = document.querySelector('[data-el="flow"] [data-id="b"]');
      const box = g.querySelector(".sd-diagram-shape").getBoundingClientRect();
      const text = g.querySelector(".sd-diagram-text");
      const t = text.getBoundingClientRect();
      const lineH = parseFloat(getComputedStyle(text).lineHeight);
      const scale = document.querySelector(".sd-canvas").getBoundingClientRect().width / 1920;
      return { inside: t.left >= box.left - 0.5 && t.right <= box.right + 0.5 && t.top >= box.top - 0.5 && t.bottom <= box.bottom + 0.5, lines: t.height / scale / lineH };
    });
    assert.ok(r.inside, "the label stays inside the node");
    assert.ok(r.lines > 1.5, `the long label wraps (${r.lines} lines)`);
    assert.deepEqual(ctx.errors, []);
  });
});

test("unknown node id is an element error naming it; the sibling carries on", async () => {
  await withPage({ root, url: pages.url("badid", "") }, async (page) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.equal(errors.length, 1, JSON.stringify(errors));
    assert.match(errors[0], /^badid\/bad: .*ghost/);
    assert.match((await page.textContent('[data-el="bad"] .sd-error')) ?? "", /ghost/);
    assert.match(await page.textContent('[data-el="ok"]'), /carries on/);
  });
});

test("shapes are sized to their label, not to their cell", async () => {
  await withPage({ root, url: pages.url("edges", "step=edge") }, async (page) => {
    const r = await page.evaluate(() => {
      const el = document.querySelector('[data-el="pair"]');
      const svgW = Number(el.querySelector("svg").getAttribute("width"));
      const shape = el.querySelector('[data-id="a"] .sd-diagram-shape').getBBox();
      return { cellW: svgW / 2, w: shape.width };
    });
    assert.ok(r.w < r.cellW / 2, `the short label's box (${r.w}) is much smaller than its cell (${r.cellW})`);
  });
});

test("an edge to or from a text node ends at the text", async () => {
  await withPage({ root, url: pages.url("flow", "step=all") }, async (page) => {
    const d = await page.evaluate(() => {
      const el = document.querySelector('[data-el="flow"]');
      const svg = el.querySelector("svg");
      const line = el.querySelector('[data-id="check->model"] line');
      const m = svg.getScreenCTM().inverse();
      const r = el.querySelector('[data-id="check"] .sd-diagram-text').getBoundingClientRect();
      const p = (x, y) => new DOMPoint(x, y).matrixTransform(m);
      const a = p(r.left, r.top);
      const b = p(r.right, r.bottom);
      const x = Number(line.getAttribute("x1"));
      const y = Number(line.getAttribute("y1"));
      const dx = Math.max(a.x - x, 0, x - b.x);
      const dy = Math.max(a.y - y, 0, y - b.y);
      return Math.hypot(dx, dy);
    });
    assert.ok(d <= 6, `the edge starts ${d}px from the text`);
  });
});

test("edge labels sit above the nodes, readable", async () => {
  for (const [slide, step, el, id] of [["edges", "edge", "pair", "link"], ["flow", "focus", "flow", "model->result"]]) {
    await withPage({ root, url: pages.url(slide, `step=${step}`) }, async (page) => {
      const hit = await page.evaluate(([el, id]) => {
        const label = [...document.querySelectorAll(`[data-el="${el}"] .sd-diagram-edge-label`)].find((n) => n.closest(`[data-for="${id}"]`));
        const r = label.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { hit: label.contains(at), text: label.textContent, w: r.width };
      }, [el, id]);
      assert.ok(hit.hit, `${slide}: the label '${hit.text}' is the topmost element at its centre`);
    });
  }
});

test("nested labelled groups: legends clear of each other and of the pills; check clean", async () => {
  await withPage({ root, url: pages.url("nest", "") }, async (page, ctx) => {
    const rects = await page.evaluate(() => {
      const el = document.querySelector('[data-el="nest"]');
      const box = (n) => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
      return {
        legends: [...el.querySelectorAll(".sd-diagram-legend")].map(box),
        pills: [...el.querySelectorAll('[data-part="node"] .sd-diagram-shape')].map(box),
      };
    });
    const meet = (a, b) => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
    assert.equal(rects.legends.length, 3);
    assert.equal(rects.pills.length, 3);
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) assert.ok(!meet(rects.legends[i], rects.legends[j]), `legends ${i} and ${j} meet`);
      for (const p of rects.pills) assert.ok(!meet(rects.legends[i], p), `legend ${i} covers a pill`);
    }
    assert.deepEqual(ctx.errors, []);
  });
  const problems = await check(deck, { slide: "nest" });
  assert.deepEqual(problems.map(formatProblem), []);
});

test("check is clean on the diagram slides", async () => {
  for (const slide of ["flow", "edges", "long", "nest"]) {
    const problems = await check(deck, { slide });
    assert.deepEqual(problems.map(formatProblem), [], slide);
  }
});
