// `diagram` in Chrome (slide kit 1). Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/diagram.test.mjs
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
  elementHtml,
  htmlAfterJump,
  sampleFrames,
  tokenRgb,
  paletteRgb,
  colorMove,
} from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const deck = fileURLToPath(new URL("../fixtures/decks/diagram/", import.meta.url));
const pages = deckPages("test/fixtures/decks/diagram/");
const motion = deckPages("test/fixtures/decks/motion/"); // modern theme: --sd-duration 400ms, --sd-stagger 80ms
const focus = deckPages("test/fixtures/decks/focus/"); // modern theme: --sd-duration-fast 200ms; steps all, a, b, end
const FLOW = ["start", "model", "result", "all", "focus"];
const CARDS = ["start", "more", "focus"];

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
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "cards", steps: CARDS, id: "cards" });
  });
});

test("backward equals jump", async () => {
  await withPage({ root, url: pages.url("flow", "step=start") }, async (page, ctx) => {
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "flow", steps: FLOW, id: "flow" });
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "cards", steps: CARDS, id: "cards" });
  });
});

test("interrupt mid-motion equals jump", async () => {
  await withPage({ root, url: pages.url("flow", "step=start") }, async (page, ctx) => {
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "flow", from: "start", via: "model", to: "all", id: "flow" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "flow", from: "model", via: "result", to: "start", id: "flow" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "flow", from: "all", via: "focus", to: "result", id: "flow" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "edges", from: "nodes", via: "edge", to: "nodes", id: "pair" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "cards", from: "start", via: "more", to: "focus", id: "cards", keep: ".sd-diagram-paint" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "cards", from: "more", via: "focus", to: "start", id: "cards", keep: ".sd-diagram-paint" });
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

test("highlight dims the rest to the theme's dim colour; labels turn muted, never faint", async () => {
  await withPage({ root, url: pages.url("flow", "step=focus") }, async (page) => {
    const dim = await tokenRgb(page, "--sd-color-dim");
    const [muted, background] = [await tokenRgb(page, "--sd-color-muted"), await tokenRgb(page, "--sd-color-background")];
    const flags = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-el="flow"] [data-part]')].map((g) => [g.dataset.id, g.dataset.dim])));
    assert.equal(flags.model, "false");
    assert.equal(flags.result, "false");
    assert.equal(flags["model->result"], "false");
    assert.equal(flags.data, "true");
    assert.equal(flags.check, "true");
    const at = await page.evaluate(() => {
      const q = (s) => document.querySelector(`[data-el="flow"] ${s}`);
      const paint = (n) => { const cs = getComputedStyle(n); return { stroke: cs.stroke, fill: cs.fill, opacity: cs.opacity }; };
      return {
        dataShape: paint(q('[data-id="data"] .sd-diagram-shape')),
        dataText: { ...paint(q('[data-id="data"] .sd-diagram-text')), color: getComputedStyle(q('[data-id="data"] .sd-diagram-text')).color },
        modelShape: paint(q('[data-id="model"] .sd-diagram-shape')),
        fit: paint(q('[data-id="fit"] .sd-diagram-shape')),
        dimmedEdge: paint(q('[data-id="data->model"] .sd-diagram-line')),
        focusedEdge: paint(q('[data-id="model->result"] .sd-diagram-line')),
      };
    });
    assert.deepEqual([at.dataShape.stroke, at.dataShape.fill, at.dataShape.opacity], [dim, background, "1"], "a dimmed node: dim outline, background fill, full opacity");
    assert.deepEqual([at.fit.stroke, at.fit.fill, at.fit.opacity], [dim, background, "1"], "a dimmed group likewise");
    assert.deepEqual([at.dimmedEdge.stroke, at.dimmedEdge.opacity], [dim, "1"], "a dimmed edge: dim line, full opacity");
    assert.equal(at.dataText.opacity, "1", "dimmed text keeps full opacity (contrast)");
    assert.equal(at.dataText.color, muted, "dimmed text is muted");
    assert.notEqual(at.modelShape.stroke, dim, "a focused node keeps its outline");
    assert.notEqual(at.modelShape.fill, background);
    assert.notEqual(at.focusedEdge.stroke, dim);
  });
});

test("a dimmed text-only node draws no shape", async () => {
  await withPage({ root, url: focus.url("flow", "step=b") }, async (page) => {
    const shape = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('[data-el="flow"] [data-id="check"] .sd-diagram-shape')); return [cs.stroke, cs.fill]; });
    assert.deepEqual(shape, ["none", "none"]);
  });
});

test("the focused parts are drawn after (above) the dimmed ones, in every layer", async () => {
  const order = (page) =>
    page.evaluate(() => {
      const ids = (cls) => [...document.querySelectorAll(`[data-el="flow"] .${cls} > [data-id], [data-el="flow"] .${cls} > [data-for]`)].map((g) => g.dataset.id ?? g.dataset.for);
      return { nodes: ids("sd-diagram-nodes"), edges: ids("sd-diagram-edges"), tags: ids("sd-diagram-edge-labels") };
    });
  await withPage({ root, url: focus.url("flow", "step=all") }, async (page, ctx) => {
    assert.deepEqual(await order(page), { nodes: ["data", "model", "result", "check"], edges: ["data->model", "model->result", "check->model"], tags: ["model->result"] });
    await ctx.open(focus.url("flow", "step=a"));
    assert.deepEqual(await order(page), { nodes: ["result", "check", "data", "model"], edges: ["model->result", "check->model", "data->model"], tags: ["model->result"] }, "data, model and their edge are raised");
    await ctx.open(focus.url("flow", "step=b"));
    assert.deepEqual(await order(page), { nodes: ["data", "check", "model", "result"], edges: ["data->model", "check->model", "model->result"], tags: ["model->result"] });
  });
});

test("focus: jump equals played, backward and interrupted", async () => {
  const steps = ["all", "a", "b", "end"];
  await withPage({ root, url: focus.url("flow", "step=all") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages: focus, slide: "flow", steps, id: "flow" });
    await expectBackwardEqualsJump(ctx, page, { pages: focus, slide: "flow", steps, id: "flow" });
    await expectInterruptEqualsJump(ctx, page, { pages: focus, slide: "flow", from: "all", via: "a", to: "b", id: "flow" });
    await expectInterruptEqualsJump(ctx, page, { pages: focus, slide: "flow", from: "a", via: "b", to: "end", id: "flow" });
  });
});

test("a highlight change tweens the outline colour over --sd-duration-fast, never the opacity", async () => {
  // The step also pops a node in and then draws an edge (about 800 ms), a long reference that stretches with load.
  await withPage({ root, url: focus.url("grow", "step=base&motion=full") }, async (page, ctx) => {
    const dim = await tokenRgb(page, "--sd-color-dim");
    const r = await sampleFrames(page, "grow", "grow", "flow", () => {
      const q = (s) => getComputedStyle(document.querySelector(`[data-el="flow"] ${s}`));
      const shape = q('[data-id="b"] .sd-diagram-shape');
      const line = q('[data-id="b->c"] .sd-diagram-line');
      return { color: shape.stroke, opacity: shape.opacity, lineColor: line.stroke, lineOpacity: line.opacity, textColor: q('[data-id="b"] .sd-diagram-text').color };
    });
    // b, c and the edge b->c leave focus: their outline and line go to the dim colour.
    const node = colorMove(r.frames);
    const edge = colorMove(r.frames.map((f) => ({ ms: f.ms, color: f.lineColor })));
    const text = colorMove(r.frames.map((f) => ({ ms: f.ms, color: f.textColor })));
    assert.equal(node.to, dim);
    assert.equal(edge.to, dim);
    for (const [name, m] of [["node", node], ["edge", edge], ["text", text]]) {
      assert.ok(m.moved >= 3, `${name}: the colour was seen part-way (${m.moved} frames)`);
      assert.ok(m.arrived >= 170, `${name}: 200 ms, not a snap (arrived at ${m.arrived.toFixed(0)} ms)`);
      // 200 ms against a build of node pop (400 ms) then edge draw (400 ms): a colour tween at --sd-duration would be half.
      assert.ok(m.arrived < 0.4 * r.settledMs, `${name}: done in the fast duration, well before the build settles (${m.arrived.toFixed(0)} of ${r.settledMs.toFixed(0)} ms)`);
    }
    assert.ok(r.settledMs >= 700, `the reference build runs about 800 ms (${r.settledMs.toFixed(0)} ms)`);
    assert.ok(r.frames.every((f) => f.opacity === "1" && f.lineOpacity === "1"), "the dimmed outline never changes opacity");
    assert.equal(r.end.style, null);
    assert.deepEqual(ctx.errors, []);
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
  await withPage({ root, url: pages.url("cards", "step=more") }, async (page) => {
    const sizes = await page.evaluate(() => {
      const px = (sel) => [...document.querySelectorAll(`[data-el="cards"] ${sel}`)].map((n) => parseFloat(getComputedStyle(n).fontSize));
      return { text: px(".sd-diagram-text"), sub: px(".sd-diagram-sub") };
    });
    assert.equal(sizes.text.length, 8);
    assert.equal(sizes.sub.length, 4);
    for (const [k, v] of Object.entries(sizes)) assert.ok(v.every((s) => s >= 28), `${k} ${v}`);
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
  for (const slide of ["flow", "edges", "long", "nest", "cards"]) {
    const problems = await check(deck, { slide });
    assert.deepEqual(problems.map(formatProblem), [], slide);
  }
});

// Owned entrance. Per frame, in the diagram-enters slide (group "pair" around a and b; edges a->b, b->c; node d
// and edge c->d come one step later): each part's opacity as seen (0 while hidden), the scale of the nodes, how
// much of each edge's line is drawn, and whether any inline style is left inside the element.
const buildProbe = (el) => {
  const seen = (n) => (getComputedStyle(n).visibility === "visible" ? Number(getComputedStyle(n).opacity) : 0);
  const part = (id) => el.querySelector(`[data-part][data-id="${id}"]`);
  const drawn = (id) => {
    const g = part(id);
    if (seen(g) === 0) return 0;
    const line = g.querySelector("line");
    const { strokeDasharray: dash, strokeDashoffset: off } = line.style;
    return dash !== "" && off !== "" ? 1 - Number(off) / line.getTotalLength() : 1;
  };
  const scale = (id) => new DOMMatrix(getComputedStyle(part(id)).transform).a;
  return {
    group: seen(part("pair")),
    nodes: ["a", "b", "c", "d"].map((id) => seen(part(id))),
    scales: ["a", "b", "c", "d"].map(scale),
    edges: ["a->b", "b->c", "c->d"].map(drawn),
    inline: el.querySelectorAll("[style]").length > 0,
  };
};

test("diagram entering builds from empty: group, then nodes pop in, then edges draw", async () => {
  await withPage({ root, url: motion.url("diagram-enters", "step=start&motion=full") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    const r = await sampleFrames(page, "diagram-enters", "go", "diagram", buildProbe);
    const shown = r.frames.filter((f) => f.visible);
    assert.ok(shown.length > 0, "the diagram is shown");
    const first = shown[0];
    assert.ok(first.ms >= 150, `held for the third slot, 2 x 80 ms (first shown at ${first.ms.toFixed(0)} ms)`);
    assert.ok(first.group < 0.5 && first.nodes.every((o) => o < 0.5) && first.edges.every((d) => d === 0), `nothing shows built at the first shown frame (${JSON.stringify(first)})`);
    assert.deepEqual(r.frames.filter((f) => f.style !== null).map((f) => f.style), [], "the box stays still: the parts enter themselves");

    // The group fades first; the nodes begin once it is in, and the edges once every node is in.
    const at = (test) => shown.find(test)?.ms ?? Infinity;
    const groupStart = at((f) => f.group > 0);
    const nodeStart = at((f) => f.nodes[0] > 0);
    const edgeStart = at((f) => f.edges[1] > 0);
    assert.ok(groupStart < nodeStart && nodeStart < edgeStart, `group ${groupStart.toFixed(0)} < nodes ${nodeStart.toFixed(0)} < edges ${edgeStart.toFixed(0)} ms`);
    assert.ok(shown.every((f) => f.nodes[0] === 0 || f.group >= 0.99), "no node shows before the group is fully in");
    assert.ok(shown.every((f) => f.edges.every((d) => d === 0) || f.nodes.slice(0, 3).every((o) => o >= 0.99)), "no edge draws before every node is fully in");
    assert.ok(shown.some((f) => f.nodes[0] > 0 && f.edges[1] === 0), "the first node is visible before the last edge has any drawn length");
    assert.ok(shown.every((f) => f.nodes[3] === 0 && f.edges[2] === 0), "node d and its edge stay hidden: shown does not list them");
    // Nodes come in one after another, each starting one --sd-stagger (80 ms) after the previous.
    const nodeAt = (i) => at((f) => f.nodes[i] > 0);
    const lag = nodeAt(2) - nodeAt(0);
    assert.ok(lag >= 140 && lag < 600, `the third node starts ~160 ms after the first (${lag.toFixed(0)} ms)`);
    assert.ok(shown.every((f) => f.nodes[0] >= f.nodes[1] && f.nodes[1] >= f.nodes[2]), "nodes come in in order");
    const drawing = shown.filter((f) => f.edges[0] > 0 && f.edges[0] < 1);
    assert.ok(drawing.length >= 3, `an edge was seen part-drawn (${drawing.length} frames)`);
    // `pop` overshoots its end size; the old fade-and-scale never went past it.
    assert.ok(shown.some((f) => f.nodes[0] > 0 && f.nodes[0] < 1 && f.scales[0] < 0.99), "a node starts smaller than its end size");
    assert.ok(shown.some((f) => f.scales[0] > 1.001), "a node overshoots its end size: the named pop");
    assert.equal(r.end.inline, false, "no inline style left inside the diagram");
    assert.ok(r.end.nodes.slice(0, 3).every((o) => o === 1) && r.end.group === 1 && r.end.edges.slice(0, 2).every((d) => d === 1), "the end state is complete");
    assert.ok(r.settledMs < 6000, `the build settles (${r.settledMs.toFixed(0)} ms)`);
    assert.equal(await elementHtml(page, "diagram"), await htmlAfterJump(ctx, page, motion, "diagram-enters", "go", "diagram"));

    // Played and backward equal a jump.
    const steps = ["start", "go", "more"];
    await expectJumpEqualsPlayed(ctx, page, { pages: motion, slide: "diagram-enters", steps, id: "diagram" });
    await expectBackwardEqualsJump(ctx, page, { pages: motion, slide: "diagram-enters", steps, id: "diagram" });
    await expectInterruptEqualsJump(ctx, page, { pages: motion, slide: "diagram-enters", from: "start", via: "go", to: "more", id: "diagram" });
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});

// Interrupted in each phase of the build: the page watches every frame until the phase holds, then asks for the
// next step; the phase must have been reached, or the test fails.
const phases = {
  held: "document.querySelector('[data-el=\"diagram\"]') && getComputedStyle(document.querySelector('[data-el=\"diagram\"]')).visibility === 'hidden' && performance.now() - t0 > 60",
  group: "p.group > 0.2 && p.group < 0.8 && p.nodes[0] === 0",
  nodes: "p.nodes[0] > 0.2 && p.nodes[0] < 0.8 && p.edges.every((d) => d === 0)",
  edges: "p.edges[0] > 0.2 && p.edges[0] < 0.8 && p.nodes.slice(0, 3).every((o) => o >= 0.99)",
};
for (const [phase, until] of Object.entries(phases)) {
  test(`diagram interrupted while ${phase === "held" ? "held" : `its ${phase} ${phase === "edges" ? "draw" : "build"}`} snaps to the jumped state`, async () => {
    await withPage({ root, url: motion.url("diagram-enters", "step=more") }, async (page, ctx) => {
      const jumped = await elementHtml(page, "diagram");
      await ctx.open(motion.url("diagram-enters", "step=start&motion=full"));
      const reached = await page.evaluate(
        async ([until, probe]) => {
          const el = () => document.querySelector('[data-el="diagram"]');
          const read = new Function("el", `return (${probe})(el)`);
          const t0 = performance.now();
          window.STEPDECK.goTo("diagram-enters", "go");
          let hit = false;
          for (let i = 0; i < 400 && !hit; i++) {
            await new Promise((r) => requestAnimationFrame(r));
            const p = read(el());
            hit = new Function("p", "t0", `return ${until}`)(p, t0);
          }
          window.STEPDECK.goTo("diagram-enters", "more");
          await window.STEPDECK.settled();
          return hit;
        },
        [until, String(buildProbe)],
      );
      assert.ok(reached, `the ${phase} phase was reached before the next step came`);
      assert.equal(await elementHtml(page, "diagram"), jumped, `interrupted in the ${phase} phase equals a jump`);
      assert.equal(await page.evaluate(() => document.querySelectorAll('[data-el="diagram"] [style]').length), 0, "no inline styles remain");
      assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
      assert.deepEqual(ctx.errors, []);
    });
  });
}

test("a later step pops the new node in with the theme's timing", async () => {
  await withPage({ root, url: motion.url("diagram-enters", "step=go&motion=full") }, async (page, ctx) => {
    const r = await sampleFrames(page, "diagram-enters", "more", "diagram", buildProbe);
    const d = r.frames.filter((f) => f.nodes[3] > 0 && f.nodes[3] < 1);
    assert.ok(d.length >= 3, `node d was seen part-in (${d.length} frames)`);
    assert.ok(r.frames.some((f) => f.scales[3] > 1.001), "node d overshoots its end size: the named pop");
    assert.ok(r.frames.every((f) => f.edges[2] === 0 || f.nodes[3] >= 0.99), "the new edge draws after the new node is in");
    assert.ok(r.settledMs >= 750, `pop 400 ms then draw 400 ms (settled at ${r.settledMs.toFixed(0)} ms)`);
    assert.equal(r.end.inline, false);
    assert.deepEqual(ctx.errors, []);
  });
});

test("the parts' start state is written before update awaits; a shown element without an entrance snaps", async () => {
  await withPage({ root, url: pages.url("flow", "step=start") }, async (page) => {
    const r = await page.evaluate(async () => {
      const { default: diagram } = await import("../components/diagram/index.js");
      const { animate } = await import("../core/animate.js");
      const { makeMotion } = await import("../core/motion.js");
      const make = async (tokens = {}) => {
        const host = document.createElement("div");
        host.style.cssText = "width:1200px;height:400px";
        document.querySelector(".sd-canvas").appendChild(host);
        const ctx = { animate, motion: makeMotion(tokens), tokens: {}, size: { w: 1200, h: 400 } };
        const base = {
          cols: 2, rows: 1,
          nodes: [{ id: "a", label: "A", shape: "box", col: 0, row: 0 }, { id: "b", label: "B", shape: "box", col: 1, row: 0 }],
          edges: [{ from: "a", to: "b" }],
          groups: [{ id: "g", contains: ["a", "b"] }],
        };
        const props = { ...base, shown: ["a", "b", "g", "a->b"] };
        const hidden = { ...base, shown: [] };
        return { host, props, hidden, inst: await diagram.mount(host, hidden, ctx) };
      };
      const signal = new AbortController().signal;
      const info = (hidden, extra) => ({ prev: hidden, changed: ["shown"], animate: true, entered: true, entrance: null, signal, ...extra });
      const ops = (host) => [...host.querySelectorAll("[data-part]")].map((g) => g.style.opacity);
      const styled = (host) => host.querySelectorAll("[style]").length;

      const out = {};
      {
        const { host, props, hidden, inst } = await make();
        const building = inst.update(props, info(hidden, { entrance: { motion: "draw", duration: 120 } }));
        out.sync = ops(host);
        await building;
        out.afterDraw = styled(host);
      }
      for (const [name, extra] of [["none", { entrance: { motion: "none", duration: 0 } }], ["moved", { entrance: null }], ["entered", { entrance: null, animate: true }], ["aborted", { entrance: { motion: "draw", duration: 120 }, signal: AbortSignal.abort() }]]) {
        const { host, props, hidden, inst } = await make();
        const p = inst.update(props, info(hidden, extra));
        out[name] = ops(host);
        await p;
      }
      // Theme timing: two nodes pop in over --sd-duration 600 ms, the second 300 ms (--sd-stagger) after the first.
      const { host, props, hidden, inst } = await make({ "--sd-duration": "600ms", "--sd-stagger": "300ms" });
      const t0 = performance.now();
      await inst.update({ ...props, shown: ["a", "b"] }, info(hidden, { entered: false }));
      out.elapsed = performance.now() - t0;
      return out;
    });
    assert.ok(r.sync.length === 4 && r.sync.every((o) => o === "0"), `every visible part starts at opacity 0 (${r.sync})`);
    assert.equal(r.afterDraw, 0, "no inline style after the build");
    for (const name of ["none", "moved", "entered", "aborted"]) assert.ok(r[name].every((o) => o === ""), `${name}: nothing is held back (${r[name]})`);
    assert.ok(r.elapsed >= 870 && r.elapsed < 3000, `two pops: 600 ms each, 300 ms apart (${r.elapsed.toFixed(0)} ms)`);
  });
});

// Cards and kinds. The fixture's kinds are source, step, model (first appearance order); the text node's kind
// takes no colour.
const KIND_NODES = { ingest: 0, clean: 1, model: 2 }; // the cards, by kind index
const KIND_OUTLINES = { box: 0, pill: 1, dot: 2 };

for (const theme of ["academic-light", "modern"]) {
  test(`cards (${theme}): stripe in the kind's palette colour, label left-aligned, card fills its cell`, async () => {
    await withPage({ root, url: pages.url("cards", `step=more&theme=${theme}`) }, async (page, ctx) => {
      const ink = await tokenRgb(page, "--sd-color-ink");
      const r = await page.evaluate(() => {
        const el = document.querySelector('[data-el="cards"]');
        const canvas = document.querySelector(".sd-canvas");
        const tokens = getComputedStyle(canvas);
        const px = (name) => parseFloat(tokens.getPropertyValue(name));
        const scale = canvas.getBoundingClientRect().width / 1920;
        const svg = el.querySelector("svg");
        const out = { gap: px("--sd-diagram-gap"), pad: px("--sd-diagram-pad"), stripeToken: px("--sd-diagram-stripe"), strong: tokens.getPropertyValue("--sd-font-weight-strong").trim(), w: Number(svg.getAttribute("width")), h: Number(svg.getAttribute("height")), cards: {} };
        for (const id of ["ingest", "clean", "model", "plain"]) {
          const g = el.querySelector(`[data-id="${id}"]`);
          const shape = g.querySelector(".sd-diagram-shape");
          const stripe = g.querySelector(".sd-diagram-stripe");
          const box = shape.getBBox();
          const stripeBox = stripe.getBBox();
          const text = g.querySelector(".sd-diagram-text").getBoundingClientRect();
          const sub = g.querySelector(".sd-diagram-sub").getBoundingClientRect();
          const card = shape.getBoundingClientRect();
          out.cards[id] = {
            box: [box.x, box.y, box.width, box.height],
            stripe: { fill: getComputedStyle(stripe).fill, x: stripeBox.x, w: stripeBox.width, h: stripeBox.height },
            textLeft: (text.left - card.left) / scale,
            subLeft: (sub.left - card.left) / scale,
            textTop: (text.top - card.top) / scale,
            textAlign: getComputedStyle(g.querySelector(".sd-diagram-label")).textAlign,
            textWeight: getComputedStyle(g.querySelector(".sd-diagram-text")).fontWeight,
            subWeight: g.querySelector(".sd-diagram-sub") ? getComputedStyle(g.querySelector(".sd-diagram-sub")).fontWeight : null,
            kind: g.dataset.kind ?? null,
            paint: g.querySelector(".sd-diagram-paint")?.getAttribute("style") ?? null,
          };
        }
        out.noteHasPaint = el.querySelector('[data-id="note"] .sd-diagram-paint') !== null;
        out.noteKind = el.querySelector('[data-id="note"]').dataset.kind ?? null;
        return out;
      });
      assert.equal(r.stripeToken, 8, "the theme's stripe is one grid unit");
      const cellW = (r.w - 3 * r.gap) / 4;
      const cellH = (r.h - r.gap) / 2;
      const cols = { ingest: 0, clean: 1, model: 2, plain: 3 };
      for (const [id, c] of Object.entries(r.cards)) {
        const want = [cols[id] * (cellW + r.gap), 0, cellW, cellH];
        c.box.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 0.5, `${id}: the card is its cell (${c.box} vs ${want})`));
        assert.ok(Math.abs(c.stripe.x - c.box[0]) < 0.5 && Math.abs(c.stripe.w - r.stripeToken) < 0.5 && Math.abs(c.stripe.h - c.box[3]) < 0.5, `${id}: the stripe is on the left edge, full height`);
        const inset = r.pad + r.stripeToken;
        assert.ok(c.textLeft <= inset + 1 && c.textLeft >= inset - 1, `${id}: the label starts at the pad plus the stripe (${c.textLeft})`);
        if (id !== "plain") assert.ok(Math.abs(c.subLeft - c.textLeft) < 1, `${id}: the sub is left-aligned with the label`);
        assert.ok(c.textTop <= r.pad + 1, `${id}: the label is top-aligned (${c.textTop})`);
        assert.equal(c.textAlign, "left");
        assert.equal(c.textWeight, r.strong, `${id}: the label is in the strong weight`);
        if (c.subWeight !== null) assert.notEqual(c.subWeight, r.strong, `${id}: the sub is not`);
      }
      for (const [id, i] of Object.entries(KIND_NODES)) {
        assert.equal(r.cards[id].stripe.fill, paletteRgb(theme, i), `${id}: kind ${i} takes palette colour ${i}`);
        assert.match(r.cards[id].paint, /--sd-kind:/);
      }
      assert.equal(r.cards.plain.stripe.fill, ink, "a card without a kind has an ink stripe");
      assert.equal(r.cards.plain.kind, null);
      assert.equal(r.cards.plain.paint, null);
      assert.equal(r.noteHasPaint, false, "a text node ignores its kind");
      assert.equal(r.noteKind, null);
      assert.deepEqual(ctx.errors, []);
    });
  });
}

test("kinds colour the outline of boxes, pills and circles; a dimmed node goes to the dim colour, stripe included", async () => {
  const paint = (page) =>
    page.evaluate(() => {
      const q = (id, sel) => getComputedStyle(document.querySelector(`[data-el="cards"] [data-id="${id}"] ${sel}`));
      return {
        outline: Object.fromEntries(["box", "pill", "dot", "note", "ingest", "clean"].map((id) => [id, q(id, ".sd-diagram-shape").stroke])),
        stripe: Object.fromEntries(["ingest", "clean", "model", "plain"].map((id) => [id, q(id, ".sd-diagram-stripe").fill])),
      };
    });
  await withPage({ root, url: pages.url("cards", "step=more") }, async (page, ctx) => {
    const ink = await tokenRgb(page, "--sd-color-ink");
    const now = await paint(page);
    for (const [id, i] of Object.entries(KIND_OUTLINES)) assert.equal(now.outline[id], paletteRgb("academic-light", i), `${id}: outline in its kind's colour`);
    assert.equal(now.outline.note, "none", "a text node still has no outline");
    assert.equal(now.outline.ingest, ink, "a card keeps its ink outline: its kind colours the stripe");
    assert.deepEqual(ctx.errors, []);
  });
  await withPage({ root, url: pages.url("cards", "step=focus") }, async (page, ctx) => {
    const dim = await tokenRgb(page, "--sd-color-dim");
    const now = await paint(page);
    // Lit: clean (a card) and box.
    assert.equal(now.stripe.clean, paletteRgb("academic-light", 1), "a lit card keeps its kind's stripe");
    assert.equal(now.outline.box, paletteRgb("academic-light", 0), "a lit box keeps its kind's outline");
    // Dimmed: the stripe and the outline all go to the dim colour.
    for (const id of ["ingest", "model", "plain"]) assert.equal(now.stripe[id], dim, `${id}: the dimmed stripe is the dim colour`);
    for (const id of ["pill", "dot", "ingest"]) assert.equal(now.outline[id], dim, `${id}: the dimmed outline is the dim colour`);
    assert.deepEqual(ctx.errors, []);
  });
});

test("a card's stripe tweens to the dim colour over --sd-duration-fast, like its outline", async () => {
  await withPage({ root, url: pages.url("cards", "step=more&motion=full") }, async (page, ctx) => {
    const dim = await tokenRgb(page, "--sd-color-dim");
    const r = await sampleFrames(page, "cards", "focus", "cards", () => {
      const q = (s) => getComputedStyle(document.querySelector(`[data-el="cards"] ${s}`));
      return { color: q('[data-id="ingest"] .sd-diagram-stripe').fill, outline: q('[data-id="ingest"] .sd-diagram-shape').stroke };
    });
    const stripe = colorMove(r.frames);
    assert.equal(stripe.to, dim);
    assert.ok(stripe.moved >= 2, `the stripe was seen part-way (${stripe.moved} frames)`);
    assert.ok(stripe.arrived >= 120 && stripe.arrived < 1500, `not a snap, not slow (arrived at ${stripe.arrived.toFixed(0)} ms)`);
    assert.equal(r.end.style, null);
    assert.deepEqual(ctx.errors, []);
  });
});

test("a kind's colour is written once, on the paint group, and motion leaves it alone", async () => {
  await withPage({ root, url: pages.url("cards", "step=start&motion=full") }, async (page, ctx) => {
    // Style attributes inside the element, by the node they belong to (the focus step reorders the nodes).
    const kindStyles = () =>
      page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-el="cards"] [style]')].map((n) => [`${n.closest("[data-id]")?.dataset.id}: ${n.getAttribute("class")}`, n.getAttribute("style")])));
    const before = await kindStyles();
    assert.equal(Object.keys(before).length, 6, `the six kinded nodes carry a style, and nothing else does (${Object.keys(before)})`);
    assert.ok(Object.entries(before).every(([k, v]) => k.endsWith(": sd-diagram-paint") && v.startsWith("--sd-kind:")), JSON.stringify(before));
    await goTo(page, "cards", "more");
    await goTo(page, "cards", "focus");
    assert.deepEqual(await kindStyles(), before, "the same paint groups with the same colours after played steps");
    assert.deepEqual(ctx.errors, []);
  });
});

for (const theme of ["academic-light", "modern"]) {
  test(`kinds beyond the palette are an element error (${theme})`, async () => {
    await withPage({ root, url: pages.url("toomany", `theme=${theme}`) }, async (page) => {
      const errors = await page.evaluate(() => window.STEPDECK.errors);
      assert.equal(errors.length, 1, JSON.stringify(errors));
      assert.match(errors[0], /^toomany\/over: .*has \d+ kinds; the categorical palette has \d+ colours/);
      const [, kinds, colours] = /has (\d+) kinds; the categorical palette has (\d+) colours/.exec(errors[0]);
      assert.equal(Number(kinds), Number(colours) + 1, "one kind more than the palette has colours");
      assert.match((await page.textContent('[data-el="over"] .sd-error')) ?? "", /kinds/);
      assert.match(await page.textContent('[data-el="ok"]'), /carries on/);
    });
  });
}
