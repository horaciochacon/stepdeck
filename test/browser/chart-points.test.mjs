// `chart.points` in Chrome: estimates with intervals by category, a reference line, `shown`, `highlight`, the
// "no data" mark, the domain error, the owned entrance, pairs, and beeswarm strips with a summary tick, an overflow
// box and a followed item. Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test --test-concurrency=1 test/browser/chart-points.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  colorMove,
} from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const deck = fileURLToPath(new URL("../fixtures/decks/points/", import.meta.url));
const pages = deckPages("test/fixtures/decks/points/");
const broken = deckPages("test/fixtures/decks/points-broken/");
const STEPS = {
  estimates: ["base", "later", "titled"],
  reference: ["none", "line", "moved"],
  shown: ["none", "one", "three", "all"],
  highlight: ["all", "focus", "after", "wide"],
  missing: ["first", "later"],
  entrance: ["start", "go", "more"],
  resort: ["data", "desc", "list", "later"],
  "resort-shown": ["start", "both", "all", "flip", "less"],
  pairs: ["before", "now", "shift", "fold"],
  "pairs-entrance": ["start", "go"],
  strips: ["start", "go", "mean", "later", "none"],
  focus: ["strips", "focus", "resort", "next"],
  overflow: ["cut", "wide", "auto"],
  "strip-edges": ["edges", "sorted", "less", "all"],
};

// Per row, in the svg's own pixels (attributes) and on screen (boxes, for overflow).
const rows = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-el="points"] g.sd-points-row')].map((g) => {
        const dot = g.querySelector(":scope > circle.sd-dot");
        const line = g.querySelector(":scope > g.sd-whisker > line.sd-whisker-line");
        const value = g.querySelector(":scope > text.sd-points-value");
        const blank = g.querySelector(":scope > text.sd-no-data");
        const n = (node, a) => (node ? Number(node.getAttribute(a)) : null);
        return [g.dataset.key, {
          transform: g.getAttribute("transform"),
          visible: getComputedStyle(g).visibility === "visible",
          dim: g.dataset.dim,
          cx: n(dot, "cx"),
          r: n(dot, "r"),
          fill: dot ? getComputedStyle(dot).fill : null,
          whisker: line ? [n(line, "x1"), n(line, "x2")] : null,
          whiskerStroke: line ? getComputedStyle(line).stroke : null,
          halo: line ? line.previousElementSibling?.classList.contains("sd-halo-under") && line.previousElementSibling.getAttribute("x1") === line.getAttribute("x1") && line.previousElementSibling.getAttribute("x2") === line.getAttribute("x2") : null,
          value: value ? { text: value.textContent, anchor: value.getAttribute("text-anchor"), fill: getComputedStyle(value).fill } : null,
          noData: blank ? { text: blank.textContent, fill: getComputedStyle(blank).fill } : null,
        }];
      }),
    ),
  );

const axis = (page) =>
  page.evaluate(() => ({
    plot: document.querySelector('[data-el="points"] g.sd-plot').getAttribute("transform"),
    ticks: [...document.querySelectorAll('[data-el="points"] .sd-axis-value g.tick')].map((t) => [t.querySelector("text").textContent, t.getAttribute("transform")]),
  }));

const errorsClean = async (page, ctx) => {
  assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
  assert.deepEqual(ctx.errors, []);
};

test("chart.points renders estimates with whiskers on halos and labels that fit", async () => {
  await withPage({ root, url: pages.url("estimates", "step=base") }, async (page, ctx) => {
    const at = await rows(page);
    assert.deepEqual(Object.keys(at), ["Norte", "Sur", "Este", "Oeste", "Centro"], "one row per category, in data order");
    for (const [key, r] of Object.entries(at)) {
      assert.ok(r.visible && r.cx > 0 && r.r > 0, `${key}: a dot`);
      assert.ok(r.whisker && r.whisker[0] < r.cx && r.cx < r.whisker[1], `${key}: a whisker around its dot`);
      assert.equal(r.halo, true, `${key}: the whisker sits on a halo`);
      assert.ok(r.value?.text, `${key}: a value label`);
    }
    assert.deepEqual(Object.values(at).map((r) => r.value.text), ["12,4", "8,6", "15,2", "6,1", "17,5"], "decimal comma");
    assert.equal(new Set(Object.values(at).map((r) => r.transform)).size, 5, "each row in its own band");
    const labels = await page.evaluate(() => [...document.querySelectorAll('[data-el="points"] g.sd-points-labels text.sd-points-label')].map((t) => t.textContent));
    assert.deepEqual(labels, ["Norte", "Sur", "Este", "Oeste", "Centro"]);

    // Every value label stays inside the svg; the one nearest the right edge does not fit past its whisker, so it
    // flips to the whisker's other side (anchored at its end), clear of the whisker.
    const fit = await page.evaluate(() => {
      const svg = document.querySelector('[data-el="points"] svg').getBoundingClientRect();
      return Object.fromEntries([...document.querySelectorAll('[data-el="points"] g.sd-points-row')].map((g) => {
        const t = g.querySelector("text.sd-points-value").getBoundingClientRect();
        const w = g.querySelector("line.sd-whisker-line").getBoundingClientRect();
        return [g.dataset.key, { left: t.left - svg.left, right: svg.right - t.right, clearLeft: w.left - t.right, clearRight: t.left - w.right }];
      }));
    });
    for (const [key, f] of Object.entries(fit)) assert.ok(f.left >= -0.5 && f.right >= -0.5, `${key}: the value label is inside the svg (${JSON.stringify(f)})`);
    const rightmost = Object.entries(at).sort((a, b) => b[1].whisker[1] - a[1].whisker[1])[0];
    assert.equal(rightmost[0], "Centro");
    assert.equal(rightmost[1].value.anchor, "end", "the rightmost label is flipped");
    assert.ok(fit.Centro.clearLeft > 0, `and sits left of its whisker, not on it (${JSON.stringify(fit.Centro)})`);
    assert.equal(at.Oeste.value.anchor, "start", "a label with room sits past its whisker");
    assert.ok(fit.Oeste.clearRight > 0, `right of its whisker (${JSON.stringify(fit.Oeste)})`);
    await errorsClean(page, ctx);
  });
});

// Each slide, and each interrupted move, is a test of its own: a failure names the slide, and none runs long.
const INTERRUPTS = [
  ["estimates", "base", "later", "titled"],
  ["estimates", "later", "titled", "base"],
  ["highlight", "all", "focus", "after"],
  ["highlight", "after", "wide", "focus"],
  ["shown", "none", "one", "all"],
  ["shown", "three", "all", "none"],
  ["reference", "none", "line", "moved"],
  ["missing", "first", "later", "first"],
  ["entrance", "start", "go", "more"],
  ["resort", "data", "desc", "list"],
  ["resort", "list", "later", "desc"],
  ["resort-shown", "start", "both", "all"],
  ["resort-shown", "both", "all", "flip"],
  ["resort-shown", "flip", "less", "all"],
  ["pairs", "before", "now", "before"],
  ["pairs", "now", "before", "now"],
  ["pairs", "now", "shift", "fold"],
  ["pairs", "shift", "fold", "now"],
  ["strips", "start", "go", "mean"],
  ["strips", "mean", "later", "none"],
  ["focus", "strips", "focus", "resort"],
  ["focus", "focus", "resort", "next"],
  ["overflow", "cut", "wide", "auto"],
  ["strip-edges", "sorted", "less", "all"],
];
for (const [slide, steps] of Object.entries(STEPS)) {
  test(`${slide}: played, jumped and backward end the same`, async () => {
    await withPage({ root, url: pages.url(slide, `step=${steps[0]}`) }, async (page, ctx) => {
      await expectJumpEqualsPlayed(ctx, page, { pages, slide, steps, id: "points" });
      await expectBackwardEqualsJump(ctx, page, { pages, slide, steps, id: "points" });
    });
  });
}
for (const [slide, from, via, to] of INTERRUPTS) {
  test(`${slide}: '${from}' -> '${via}' interrupted by '${to}' ends as a jump`, async () => {
    await withPage({ root, url: pages.url(slide, `step=${from}`) }, async (page, ctx) => {
      await expectInterruptEqualsJump(ctx, page, { pages, slide, from, via, to, id: "points" });
    });
  });
}

test("a played step really moves: y tweens, rows grow in, the reference and the titles fade", async () => {
  await withPage({ root, url: pages.url("estimates", "step=base") }, async (page, ctx) => {
    const cx = (key) => (p) => p.evaluate((key) => document.querySelector(`[data-el="points"] g.sd-points-row[data-key="${key}"] circle.sd-dot`).getAttribute("cx"), key);
    const moved = await expectAnimatedStepMoves(ctx, page, { pages, slide: "estimates", from: "base", to: "later", id: "points", probe: cx("Centro") });
    assert.ok(Number(moved.mid) > Number(moved.end), "Centro's dot is still on its way down 120 ms in");
    const grow = await expectAnimatedStepMoves(ctx, page, {
      pages, slide: "shown", from: "none", to: "one", id: "points",
      probe: (p) => p.evaluate(() => document.querySelector('[data-el="points"] g.sd-points-row[data-key="Norte"] circle.sd-dot').getAttribute("r")),
    });
    assert.ok(Number(grow.mid) < Number(grow.end), "the new row's dot is still growing");
    const opacity = (selector) => (p) => p.evaluate((s) => document.querySelector(s)?.getAttribute("opacity") ?? "none", selector);
    const ref = await expectAnimatedStepMoves(ctx, page, { pages, slide: "reference", from: "none", to: "line", id: "points", probe: opacity('[data-el="points"] g.sd-reference') });
    assert.ok(Number(ref.mid) > 0 && Number(ref.mid) < 1 && ref.end === "none", `the reference fades in (${ref.mid} -> ${ref.end})`);
    const title = await expectAnimatedStepMoves(ctx, page, { pages, slide: "estimates", from: "later", to: "titled", id: "points", probe: opacity('[data-el="points"] text.sd-axis-title-band') });
    assert.ok(Number(title.mid) > 0 && Number(title.mid) < 1 && title.end === "none", `the category axis title fades in (${title.mid} -> ${title.end})`);
    await errorsClean(page, ctx);
  });
});

test("the axis stays when y switches", async () => {
  await withPage({ root, url: pages.url("estimates", "step=base") }, async (page, ctx) => {
    const base = await axis(page);
    const before = await rows(page);
    assert.ok(base.ticks.length >= 3, `ticks ${JSON.stringify(base.ticks)}`);
    for (const step of ["later", "titled"]) {
      await ctx.open(pages.url("estimates", `step=${step}`));
      assert.deepEqual(await axis(page), base, `${step}: the same ticks, at the same places, and the same plot`);
    }
    // Played as well, and the values did move.
    await ctx.open(pages.url("estimates", "step=base&motion=full"));
    await goTo(page, "estimates", "later");
    assert.deepEqual(await axis(page), base);
    const after = await rows(page);
    assert.ok(after.Centro.cx < before.Centro.cx, "Centro's dot moved to its new value");
    assert.deepEqual(Object.values(after).map((r) => r.transform), Object.values(before).map((r) => r.transform), "the rows keep their bands");
    await errorsClean(page, ctx);
  });
});

test("a played domain change tweens the axis; the plot keeps its size", async () => {
  await withPage({ root, url: pages.url("highlight", "step=all") }, async (page, ctx) => {
    const plotEnd = (p) => p.evaluate(() => Number(document.querySelector('[data-el="points"] line.sd-axis-line').getAttribute("x2")));
    const widths = [];
    for (const step of STEPS.highlight) {
      await ctx.open(pages.url("highlight", `step=${step}`));
      widths.push(await plotEnd(page));
    }
    assert.equal(new Set(widths).size, 1, `the same plot width at every step: ${widths}`);
    const ticks = await page.evaluate(() => [...document.querySelectorAll('[data-el="points"] .sd-axis-value g.tick text')].map((t) => t.textContent));
    assert.ok(ticks.includes("120,0"), `the wide axis: ${ticks}`);
    // The tick at 20 is on both axes: it slides from the right end to a sixth of the way.
    const tick20 = (p) => p.evaluate(() => {
      const t = [...document.querySelectorAll('[data-el="points"] .sd-axis-value g.tick')].find((g) => g.querySelector("text").textContent === "20,0");
      return Number(/translate\(([-\d.e]+),/.exec(t.getAttribute("transform"))[1]);
    });
    const moved = await expectAnimatedStepMoves(ctx, page, { pages, slide: "highlight", from: "after", to: "wide", id: "points", probe: tick20 });
    assert.ok(moved.mid > moved.end && moved.mid <= widths[0], `the tick at 20 slides left (${moved.mid} -> ${moved.end})`);
    await errorsClean(page, ctx);
  });
});

test("no data mark on missing, in Spanish", async () => {
  await withPage({ root, url: pages.url("missing", "step=first") }, async (page, ctx) => {
    const muted = await tokenRgb(page, "--sd-color-muted");
    const first = await rows(page);
    assert.deepEqual(first.Oeste.noData, { text: "sin datos", fill: muted }, "the mark, muted");
    assert.equal(first.Oeste.cx, null, "no dot");
    assert.equal(first.Oeste.whisker, null, "no whisker");
    assert.equal(first.Oeste.value, null, "no value label");
    assert.ok(first.Oeste.visible);
    assert.ok(first.Sur.cx !== null && first.Sur.noData === null);
    const labels = await page.evaluate(() => [...document.querySelectorAll('[data-el="points"] text.sd-points-label')].map((t) => t.textContent));
    assert.ok(labels.includes("Oeste"), "its label shows");
    const title = await page.evaluate(() => document.querySelector('[data-el="points"] g.sd-points-row[data-key="Oeste"] > title').textContent);
    assert.equal(title, "Oeste: sin datos");

    // At `later` the other row is empty; played, it ends as a jump does (no dot left at zero or anywhere).
    const jumped = await htmlAfterJump(ctx, page, pages, "missing", "later", "points");
    await ctx.open(pages.url("missing", "step=first&motion=full"));
    await goTo(page, "missing", "later");
    assert.equal(await elementHtml(page, "points"), jumped);
    const later = await rows(page);
    assert.equal(later.Sur.cx, null);
    assert.equal(later.Sur.noData.text, "sin datos");
    assert.ok(later.Oeste.cx > 0 && later.Oeste.noData === null, "Oeste has its dot back");
    await errorsClean(page, ctx);
  });
});

test("hidden rows keep their slot; highlight dims the other rows over --sd-duration-fast, never by opacity", async () => {
  await withPage({ root, url: pages.url("shown", "step=none") }, async (page, ctx) => {
    const none = await rows(page);
    assert.ok(Object.values(none).every((r) => !r.visible), "every row hidden");
    await ctx.open(pages.url("shown", "step=one"));
    const one = await rows(page);
    assert.deepEqual(Object.entries(one).filter(([, r]) => r.visible).map(([k]) => k), ["Norte"]);
    await ctx.open(pages.url("shown", "step=all"));
    const all = await rows(page);
    assert.deepEqual(Object.values(all).map((r) => r.transform), Object.values(none).map((r) => r.transform), "the same bands");
    assert.deepEqual(Object.values(all).map((r) => r.cx), Object.values(none).map((r) => r.cx), "hidden rows are laid out where they will be");

    await ctx.open(pages.url("highlight", "step=focus"));
    const dim = await tokenRgb(page, "--sd-color-dim");
    const muted = await tokenRgb(page, "--sd-color-muted");
    const focus = await rows(page);
    assert.deepEqual(Object.values(focus).map((r) => r.dim), ["true", "true", "false", "true", "true"]);
    assert.equal(focus.Norte.fill, dim, "a dimmed dot is the dim colour");
    assert.equal(focus.Norte.whiskerStroke, dim, "and so is its whisker");
    assert.equal(focus.Norte.value.fill, muted, "its value label turns muted");
    assert.notEqual(focus.Este.fill, dim, "the focused dot keeps its colour");
    assert.notEqual(focus.Este.whiskerStroke, dim);
    const opacities = await page.evaluate(() => [...document.querySelectorAll('[data-el="points"] svg *')].map((n) => getComputedStyle(n).opacity));
    assert.ok(opacities.every((o) => o === "1"), "nothing is faded");

    await ctx.open(pages.url("highlight", "step=all&motion=full"));
    const r = await sampleFrames(page, "highlight", "focus", "points", () => {
      const dot = document.querySelector('[data-el="points"] g.sd-points-row[data-key="Norte"] circle.sd-dot');
      return { color: getComputedStyle(dot).fill, opacity: getComputedStyle(dot).opacity };
    });
    const move = colorMove(r.frames);
    assert.equal(move.to, dim, "Norte's dot ends at the dim colour");
    assert.ok(move.moved >= 3, `the colour was seen part-way (${move.moved} frames)`);
    assert.ok(r.frames.every((f) => f.opacity === "1"), "opacity never changes");
    assert.ok(move.arrived >= 170, `200 ms, not a snap (arrived at ${move.arrived.toFixed(0)} ms)`);
    assert.ok(move.arrived < 0.4 * r.settledMs, `done in the fast duration, well before the morph settles (${move.arrived.toFixed(0)} of ${r.settledMs.toFixed(0)} ms)`);
    await errorsClean(page, ctx);
  });
});

test("domain error shows on the slide", async () => {
  await withPage({ root, url: broken.url("domain-error", "") }, async (page, ctx) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.deepEqual(errors, ["domain-error/points: estimate 'Norte' (12.4) is outside `domain` [0, 10]"]);
    const shown = await page.evaluate(() => document.querySelector('[data-el="points"] .sd-error')?.textContent);
    assert.match(shown ?? "", /estimate 'Norte' \(12\.4\) is outside `domain` \[0, 10\]/);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-el="src"]')).visibility), "visible");
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("unknown sort column shows on the slide", async () => {
  await withPage({ root, url: broken.url("sort-error", "") }, async (page, ctx) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.deepEqual(errors, ["sort-error/points: sort column 'ritmo' not found (columns: region, rate, low, high, rate2, low2, high2)"]);
    const shown = await page.evaluate(() => document.querySelector('[data-el="points"] .sd-error')?.textContent);
    assert.match(shown ?? "", /sort column 'ritmo' not found/);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-el="src"]')).visibility), "visible");
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

// The y a row (or its category label) is placed at, from its transform.
const slotY = (page, key, what = "row") =>
  page.evaluate(([key, what]) => {
    const node = what === "row"
      ? document.querySelector(`[data-el="points"] g.sd-points-row[data-key="${key}"]`)
      : document.querySelector(`[data-el="points"] text.sd-points-label[data-key="${key}"]`);
    return Number(/translate\([-\d.e]+,([-\d.e]+)\)/.exec(node.getAttribute("transform"))[1]);
  }, [key, what]);

const rowOrder = (page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-el="points"] g.sd-points-row')].map((g) => g.dataset.key));

test("resort: rows pass through intermediate positions", async () => {
  await withPage({ root, url: pages.url("resort", "step=data&motion=full") }, async (page, ctx) => {
    const before = {};
    for (const key of ["Norte", "Este", "Centro"]) before[key] = [await slotY(page, key), await slotY(page, key, "label")];
    assert.deepEqual(await rowOrder(page), ["Norte", "Sur", "Este", "Oeste", "Centro"], "data order first");
    const r = await sampleFrames(page, "resort", "desc", "points", (el) => {
      const y = (sel) => Number(/translate\([-\d.e]+,([-\d.e]+)\)/.exec(el.querySelector(sel).getAttribute("transform"))[1]);
      return Object.fromEntries(["Norte", "Este", "Centro"].map((k) => [k, {
        row: y(`g.sd-points-row[data-key="${k}"]`),
        label: y(`text.sd-points-label[data-key="${k}"]`),
        dot: Number(el.querySelector(`g.sd-points-row[data-key="${k}"] circle.sd-dot`).getAttribute("cx")),
      }]));
    });
    // Norte 0 -> 2, Este 2 -> 1, Centro 4 -> 0 (slots); the dots stay where they are on the axis.
    for (const key of ["Norte", "Este", "Centro"]) {
      const old = before[key][0];
      const now = r.end[key].row;
      assert.notEqual(old, now, `${key} changes rank`);
      const [lo, hi] = [Math.min(old, now), Math.max(old, now)];
      assert.ok(r.frames.some((f) => f[key].row > lo + 1 && f[key].row < hi - 1), `${key}: a frame strictly between ${old} and ${now}`);
      assert.ok(r.frames.every((f) => f[key].row >= lo - 0.01 && f[key].row <= hi + 0.01), `${key}: never past either end`);
      assert.ok(r.frames.some((f) => f[key].label > lo + 1 && f[key].label < hi - 1), `${key}: its label slides too`);
      assert.ok(r.frames.every((f) => Math.abs(f[key].label - f[key].row) < 0.01), `${key}: the label stays level with its row`);
      assert.equal(r.end[key].label, now, `${key}: the label ends at the row's place`);
      assert.ok(r.frames.every((f) => f[key].dot === r.end[key].dot), `${key}: the dot only moves along the rows`);
    }
    const moving = r.frames.filter((f) => f.Centro.row !== r.frames[0].Centro.row && f.Centro.row !== r.end.Centro.row);
    assert.ok(moving.length >= 3, `seen part-way in several frames (${moving.length})`);
    assert.ok(moving.at(-1).ms - moving[0].ms < r.settledMs, "inside the morph");
    assert.deepEqual(await rowOrder(page), ["Centro", "Este", "Norte", "Sur", "Oeste"], "the markup follows the new order");
    await ctx.open(pages.url("resort", "step=desc"));
    assert.deepEqual(await rowOrder(page), ["Centro", "Este", "Norte", "Sur", "Oeste"], "as does a jump");
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});

test("resort while a category appears", async () => {
  await withPage({ root, url: pages.url("resort-shown", "step=start&motion=full") }, async (page, ctx) => {
    const at = await rows(page);
    assert.deepEqual(Object.entries(at).filter(([, r]) => r.visible).map(([k]) => k), ["Norte", "Sur"]);
    const first = { Norte: await slotY(page, "Norte"), Sur: await slotY(page, "Sur") };
    const r = await sampleFrames(page, "resort-shown", "both", "points", (el) => {
      const y = (k) => Number(/translate\([-\d.e]+,([-\d.e]+)\)/.exec(el.querySelector(`g.sd-points-row[data-key="${k}"]`).getAttribute("transform"))[1]);
      const label = (k) => Number(/translate\([-\d.e]+,([-\d.e]+)\)/.exec(el.querySelector(`text.sd-points-label[data-key="${k}"]`).getAttribute("transform"))[1]);
      return {
        Este: y("Este"), EsteLabel: label("Este"), EsteR: Number(el.querySelector('g.sd-points-row[data-key="Este"] circle.sd-dot').getAttribute("r")),
        EsteVisible: getComputedStyle(el.querySelector('g.sd-points-row[data-key="Este"]')).visibility === "visible",
        Norte: y("Norte"), Sur: y("Sur"),
      };
    });
    // Este (15.2) ranks first: it grows in at its final place while Norte and Sur slide down to make room. Frames sampled
    // before the step's first paint (Este still hidden) show the old state, so only the frames from that paint on count.
    assert.ok(r.frames.some((f) => f.EsteR > 0 && f.EsteR < r.end.EsteR), "Este is seen growing");
    const painted = r.frames.findIndex((f) => f.EsteVisible);
    assert.ok(painted >= 0, "the step paints Este shown");
    assert.ok(r.frames.slice(painted).every((f) => f.Este === r.end.Este && f.EsteLabel === r.end.Este), "from its first painted frame, at its final place");
    for (const key of ["Norte", "Sur"]) {
      assert.ok(r.end[key] > first[key] + 1, `${key} slides down (${first[key]} -> ${r.end[key]})`);
      assert.ok(r.frames.some((f) => f[key] > first[key] + 1 && f[key] < r.end[key] - 1), `${key} passes between`);
    }
    assert.equal(await elementHtml(page, "points"), await htmlAfterJump(ctx, page, pages, "resort-shown", "both", "points"));

    // Oeste has no estimate and is hidden: it ranks last, keeps its place and shows "sin datos" when it appears.
    await ctx.open(pages.url("resort-shown", "step=both"));
    assert.deepEqual(await rowOrder(page), ["Este", "Norte", "Sur", "Oeste"]);
    const hidden = await rows(page);
    assert.equal(hidden.Oeste.visible, false);
    const oeste = hidden.Oeste.transform;
    await ctx.open(pages.url("resort-shown", "step=all&motion=full"));
    assert.equal((await rows(page)).Oeste.transform, oeste, "Oeste appears in the slot it already had");
    assert.equal((await rows(page)).Oeste.noData.text, "sin datos");
    await goTo(page, "resort-shown", "flip");
    assert.deepEqual(await rowOrder(page), ["Sur", "Norte", "Este", "Oeste"], "lowest first; the empty row still last");
    assert.equal(await elementHtml(page, "points"), await htmlAfterJump(ctx, page, pages, "resort-shown", "flip", "points"));
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});

// The side a value label takes comes from the row it ends at (the row it starts from, for one that leaves), so it
// never jumps from one side of its whisker to the other part-way through a motion.
const ANCHOR_STEPS = [
  ["entrance", "start", "go"],
  ["estimates", "base", "later"],
  ["highlight", "after", "wide"],
  ["shown", "one", "three"],
  ["resort", "list", "later"],
  ["resort-shown", "flip", "less"],
];
for (const [slide, from, to] of ANCHOR_STEPS) {
  test(`value labels keep their side through ${slide}: '${from}' -> '${to}'`, async () => {
    await withPage({ root, url: pages.url(slide, `step=${from}&motion=full`) }, async (page, ctx) => {
      const r = await sampleFrames(page, slide, to, "points", (el) => Object.fromEntries([...el.querySelectorAll("g.sd-points-row")].map((g) => {
        const line = g.querySelector("line.sd-whisker-line");
        const value = g.querySelector("text.sd-points-value");
        const at = (node, a) => (node ? Number(node.getAttribute(a)) : null);
        return [g.dataset.key, { anchor: value?.getAttribute("text-anchor") ?? null, cx: at(g.querySelector("circle.sd-dot"), "cx"), r: at(g.querySelector("circle.sd-dot"), "r"), x2: at(line, "x2") }];
      })));
      const same = (a, b) => a.cx === b.cx && a.r === b.r && a.x2 === b.x2;
      let mid = 0;
      for (const key of Object.keys(r.end).filter((k) => !["ms", "visible", "style"].includes(k))) {
        const frames = r.frames.map((f) => f[key]);
        const inside = frames.filter((f) => !same(f, frames[0]) && !same(f, r.end[key]));
        mid += inside.length;
        const anchors = new Set(inside.filter((f) => f.anchor !== null).map((f) => f.anchor));
        const want = new Set(r.end[key].anchor === null ? [] : [r.end[key].anchor]);
        // A leaver ends hidden; the side it kept is the one it had at the start.
        const kept = to === "less" ? new Set(frames[0].anchor === null ? [] : [frames[0].anchor]) : want;
        for (const a of anchors) assert.ok(kept.has(a), `${key}: '${a}' mid-motion, but the label sits '${[...kept]}' (${[...anchors]})`);
      }
      assert.ok(mid > 0, "the motion was seen part-way");
      assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
      assert.deepEqual(ctx.errors, []);
    });
  });
}

test("owned entrance grows from the reference", async () => {
  await withPage({ root, url: pages.url("entrance", "step=start&motion=full") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    const r = await sampleFrames(page, "entrance", "go", "points", (el) => {
      const dot = el.querySelector('g.sd-points-row[data-key="Centro"] circle.sd-dot');
      const line = el.querySelector('g.sd-points-row[data-key="Centro"] line.sd-whisker-line');
      return {
        cx: Number(dot.getAttribute("cx")),
        r: Number(dot.getAttribute("r")),
        span: Math.abs(Number(line.getAttribute("x2")) - Number(line.getAttribute("x1"))),
        ref: Number(el.querySelector("g.sd-reference line.sd-rule").getAttribute("x1")),
      };
    });
    const shown = r.frames.filter((f) => f.visible);
    assert.ok(shown.length > 0, "the chart is shown");
    const first = shown[0];
    const { end } = r;
    assert.ok(Math.abs(end.cx - end.ref) > 20, `Centro sits away from the reference at rest (${end.cx} vs ${end.ref})`);
    assert.ok(Math.abs(first.cx - first.ref) < 1, `the first frame shown has the dot on the reference (${first.cx} vs ${first.ref})`);
    assert.equal(first.r, 0, "and not grown yet");
    assert.equal(first.span, 0, "with no whisker");
    assert.ok(shown.some((f) => f.cx > end.ref + 1 && f.cx < end.cx - 1), "the dot passes between the reference and its value");
    const drawing = shown.findIndex((f) => f.span > 0);
    assert.ok(drawing > 0 && shown[drawing].cx === end.cx, "the whisker draws once the dot has arrived");
    assert.ok(shown.some((f) => f.span > 0 && f.span < end.span), "and draws outward");
    assert.deepEqual(r.frames.filter((f) => f.style !== null).map((f) => f.style), [], "the box stays still: the chart builds itself");
    const moving = shown.filter((f) => f.cx !== end.cx || f.span !== end.span);
    const spanMs = moving.at(-1).ms - first.ms;
    assert.ok(spanMs >= 300 && spanMs < 4000, `builds over most of 2 x --sd-duration (${spanMs.toFixed(0)} ms)`);
    assert.equal(await elementHtml(page, "points"), await htmlAfterJump(ctx, page, pages, "entrance", "go", "points"));
    await errorsClean(page, ctx);
  });
});

test("the start state is written before update awaits its data", async () => {
  await withPage({ root, url: pages.url("estimates", "step=base"), size: 960 }, async (page) => {
    const r = await page.evaluate(async () => {
      const { default: chart } = await import("../components/chart.points/index.js");
      const { animate } = await import("../core/animate.js");
      const { d3 } = await import("../core/d3.js");
      const host = document.createElement("div");
      host.style.cssText = "position:absolute;left:0;top:0;width:1000px;height:600px";
      document.querySelector(".sd-canvas").appendChild(host);
      const data = [{ g: "a", v: 10, lo: 6, hi: 14 }, { g: "b", v: 20, lo: 15, hi: 25 }];
      let gate = null; // while set, the data stays loading
      const ctx = {
        d3, animate,
        data: () => gate ?? Promise.resolve(data),
        format: (spec) => d3.format(spec),
        t: (key) => key,
        tokens: { "--sd-font-size-label": "28px", "--sd-color-ink": "#111111", "--sd-color-muted": "#555555", "--sd-color-rule": "#cccccc", "--sd-color-background": "#ffffff" },
        palette: () => ({ colors: ["#0072b2"] }),
        size: { w: 1000, h: 600 },
        stepProps: null,
      };
      const read = () => [...host.querySelectorAll("g.sd-points-row")].map((g) => {
        const line = g.querySelector("line.sd-whisker-line");
        return { cx: Number(g.querySelector("circle.sd-dot").getAttribute("cx")), r: Number(g.querySelector("circle.sd-dot").getAttribute("r")), span: Number(line.getAttribute("x2")) - Number(line.getAttribute("x1")) };
      });
      const props = { data: "d.csv", x: "g", y: "v", interval: { lower: "lo", upper: "hi" }, domain: [0, 30], reference: 5 };
      const inst = await chart.mount(host, props, ctx);
      const signal = new AbortController().signal;
      await inst.update(props, { prev: null, changed: Object.keys(props), animate: false, entered: false, entrance: null, signal });
      const before = read();
      const ref = Number(host.querySelector("g.sd-reference line.sd-rule").getAttribute("x1"));
      let release;
      gate = new Promise((resolve) => (release = () => resolve(data)));
      const t0 = performance.now();
      const updating = inst.update(props, { prev: props, changed: [], animate: true, entered: true, entrance: { motion: "draw", duration: 120 }, signal });
      const sync = read();
      release();
      await updating;
      const ms = performance.now() - t0;
      const end = read();
      host.remove();
      return { before, sync, ms, end, ref };
    });
    assert.ok(r.before.every((b) => b.r > 0 && b.span > 0), "drawn while hidden");
    assert.deepEqual(r.sync, r.before.map(() => ({ cx: r.ref, r: 0, span: 0 })), "dots on the reference, not grown, no whisker, before the data arrives");
    assert.ok(r.ms >= 100 && r.ms < 600, `entrance.duration (120 ms) wins over 2 x --sd-duration (took ${r.ms.toFixed(0)} ms)`);
    assert.deepEqual(r.end, r.before);
  });
});

// Pairs: a hollow dot at `from`, a connector, a filled dot at `y`. Read from the markup of one row.
const pairOf = (el, key) => {
  const g = el.querySelector(`g.sd-points-row[data-key="${key}"]`);
  const num = (node, a) => (node ? Number(node.getAttribute(a)) : null);
  const hollow = g.querySelector(":scope > circle.sd-dot-hollow");
  const filled = g.querySelector(":scope > circle.sd-dot:not(.sd-dot-hollow)");
  const link = g.querySelector(":scope > path.sd-pair-connector");
  return { from: num(hollow, "cx"), fromR: num(hollow, "r"), cx: num(filled, "cx"), r: num(filled, "r"), length: link ? link.getTotalLength() : 0, link: link !== null, hollow: hollow !== null };
};

// sampleFrames sends its probe to the page as source, so a probe over pairOf is built as source too.
const pairsProbe = (...keys) => ({ toString: () => `(el) => { const pairOf = ${pairOf}; return Object.fromEntries(${JSON.stringify(keys)}.map((k) => [k, pairOf(el, k)])); }` });

test("pairs: a hollow dot, a connector and a filled dot; an empty from shows only the end dot", async () => {
  await withPage({ root, url: pages.url("pairs", "step=before") }, async (page, ctx) => {
    const none = await page.evaluate(() => document.querySelectorAll('[data-el="points"] .sd-dot-hollow, [data-el="points"] .sd-pair-connector').length);
    assert.equal(none, 0, "no pair marks before `from` is set");
    await ctx.open(pages.url("pairs", "step=now"));
    const at = await page.evaluate(`(${(pairOf)})(document.querySelector('[data-el="points"]'), "Norte")`);
    assert.ok(at.hollow && at.link && at.from > at.cx, `Norte: hollow at 14.2 (${at.from}), filled at 10.1 (${at.cx})`);
    assert.ok(Math.abs(at.length - (at.from - at.cx)) < 0.5, `the connector spans the two dots (${at.length})`);
    const look = await page.evaluate(() => {
      const g = document.querySelector('[data-el="points"] g.sd-points-row[data-key="Norte"]');
      const hollow = g.querySelector("circle.sd-dot-hollow");
      const filled = g.querySelector("circle.sd-dot:not(.sd-dot-hollow)");
      const link = g.querySelector("path.sd-pair-connector");
      const cs = (n, p) => getComputedStyle(n)[p];
      return {
        order: [...g.children].map((n) => n.tagName + "." + [...n.classList].join(".")),
        hollow: { fill: cs(hollow, "fill"), stroke: cs(hollow, "stroke"), r: hollow.getAttribute("r") },
        filled: { fill: cs(filled, "fill"), r: filled.getAttribute("r") },
        link: { fill: cs(link, "fill"), stroke: cs(link, "stroke"), width: cs(link, "strokeWidth") },
        label: g.querySelector("text.sd-points-value").textContent,
        title: g.querySelector("title").textContent,
      };
    });
    const bg = await tokenRgb(page, "--sd-color-background");
    const muted = await tokenRgb(page, "--sd-color-muted");
    assert.equal(look.hollow.fill, bg, "the hollow dot is filled with the background");
    assert.equal(look.hollow.stroke, look.filled.fill, "and outlined in the colour of the filled dot");
    assert.equal(look.hollow.r, look.filled.r);
    assert.equal(look.link.fill, "none");
    assert.equal(look.link.stroke, muted, "the connector is quiet: the muted colour");
    assert.ok(parseFloat(look.link.width) <= 4, `and thin (${look.link.width})`);
    const parts = look.order.filter((o) => /circle|path/.test(o));
    assert.deepEqual(parts.map((o) => o.split(".")[0] + (o.includes("hollow") ? "h" : "")), ["path", "circleh", "circle"], `connector, hollow, filled: ${look.order}`);
    assert.equal(look.label, "10,1", "the value label is the end value");
    assert.equal(look.title, "Norte: 14,2 → 10,1");
    // Oeste has no `before`: only its end dot, no connector, no hollow dot (never one at zero).
    const oeste = await page.evaluate(`(${(pairOf)})(document.querySelector('[data-el="points"]'), "Oeste")`);
    assert.deepEqual([oeste.hollow, oeste.link, oeste.cx > 0], [false, false, true]);
    assert.equal(await page.evaluate(() => document.querySelectorAll('[data-el="points"] g.sd-points-row[data-key="Oeste"] circle').length), 1);
    // A pair that goes up reads the other way: hollow left of the filled dot.
    const up = await page.evaluate(`(${(pairOf)})(document.querySelector('[data-el="points"]'), "Centro")`);
    assert.ok(up.from < up.cx && Math.abs(up.length - (up.cx - up.from)) < 0.5);
    await errorsClean(page, ctx);
  });
});

test("pairs: the dot slides and the connector grows", async () => {
  await withPage({ root, url: pages.url("pairs", "step=before&motion=full") }, async (page, ctx) => {
    const r = await sampleFrames(page, "pairs", "now", "points", pairsProbe("Norte", "Centro", "Oeste"));
    const { end } = r;
    const start = r.frames[0];
    for (const key of ["Norte", "Centro"]) {
      const a = start[key].cx;
      const b = end[key].cx;
      const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
      assert.ok(Math.abs(a - b) > 20, `${key} really moves (${a} -> ${b})`);
      const mid = r.frames.filter((f) => f[key].cx > lo + 1 && f[key].cx < hi - 1);
      assert.ok(mid.length >= 3, `${key}: seen between the two values in several frames (${mid.length})`);
      assert.ok(r.frames.every((f) => f[key].cx >= lo - 0.01 && f[key].cx <= hi + 0.01), `${key}: never past either value`);
      assert.ok(end[key].length > 20 && Math.abs(end[key].length - Math.abs(a - b)) < 0.5, `${key}: the connector ends spanning both dots (${end[key].length})`);
      const grown = r.frames.filter((f) => f[key].link);
      assert.ok(grown.some((f) => f[key].length > 1 && f[key].length < end[key].length - 1), `${key}: the connector is seen growing`);
      assert.ok(grown.every((f) => Math.abs(f[key].length - Math.abs(f[key].cx - f[key].from)) < 0.5), `${key}: it trails the dot, from the hollow dot to the filled one`);
      const lengths = grown.map((f) => f[key].length);
      assert.ok(lengths.every((l, i) => i === 0 || l >= lengths[i - 1] - 0.01), `${key}: and only grows`);
      const holes = r.frames.filter((f) => f[key].hollow).map((f) => f[key].from);
      assert.ok(holes.length > 0 && holes.every((h) => h === holes[0]) && Math.abs(holes[0] - a) < 0.5, `${key}: the hollow dot stays at its value (${[...new Set(holes)]})`);
    }
    // Oeste has no `before`: its end dot grows where it is, with no connector and no hollow dot at any frame.
    assert.ok(r.frames.every((f) => !f.Oeste.link && !f.Oeste.hollow), "Oeste: never a connector or a hollow dot");
    assert.ok(r.frames.some((f) => f.Oeste.r > 0 && f.Oeste.r < end.Oeste.r), "Oeste: its dot is seen growing");
    const moving = r.frames.filter((f) => f.Norte.cx !== start.Norte.cx && f.Norte.cx !== end.Norte.cx);
    const spanMs = moving.at(-1).ms - moving[0].ms;
    assert.ok(spanMs >= 150 && spanMs < 4000, `a motion, not a snap (${spanMs.toFixed(0)} ms)`);
    assert.equal(await elementHtml(page, "points"), await htmlAfterJump(ctx, page, pages, "pairs", "now", "points"));
    await errorsClean(page, ctx);
  });
});

test("pairs: a changed `from` slides the hollow dot", async () => {
  await withPage({ root, url: pages.url("pairs", "step=now&motion=full") }, async (page, ctx) => {
    const r = await sampleFrames(page, "pairs", "shift", "points", pairsProbe("Norte", "Centro"));
    for (const key of ["Norte", "Centro"]) {
      const a = r.frames[0][key].from;
      const b = r.end[key].from;
      const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
      assert.ok(Math.abs(a - b) > 20, `${key}: the earlier value moves (${a} -> ${b})`);
      assert.ok(r.frames.some((f) => f[key].from > lo + 1 && f[key].from < hi - 1), `${key}: the hollow dot is seen between its two places`);
      assert.ok(r.frames.every((f) => f[key].from >= lo - 0.01 && f[key].from <= hi + 0.01), `${key}: never past either`);
      assert.ok(r.frames.every((f) => f[key].cx === r.end[key].cx), `${key}: the filled dot stays (y does not change)`);
      assert.ok(r.frames.every((f) => Math.abs(f[key].length - Math.abs(f[key].cx - f[key].from)) < 0.5), `${key}: the connector spans the two dots at every frame`);
    }
    assert.equal(await elementHtml(page, "points"), await htmlAfterJump(ctx, page, pages, "pairs", "shift", "points"));
    await errorsClean(page, ctx);
  });
});

test("pairs: removing `from` folds the pair into the dot", async () => {
  await withPage({ root, url: pages.url("pairs", "step=shift&motion=full") }, async (page, ctx) => {
    // Este was hidden at `shift` (with its own `from`) and comes back at `fold`, when `from` goes: it grows as a
    // plain dot, and no hollow dot or connector of its old pair shows on the way.
    const probe = { toString: () => `(el) => {
      const pairOf = ${pairOf};
      const g = el.querySelector('g.sd-points-row[data-key="Este"]');
      const seen = (n) => n.getAttribute("opacity") !== "0";
      return {
        Norte: pairOf(el, "Norte"),
        este: getComputedStyle(g).visibility === "visible",
        esteHollow: [...g.querySelectorAll("circle.sd-dot-hollow")].some((c) => Number(c.getAttribute("r")) > 0.5 && seen(c)),
        esteLink: [...g.querySelectorAll("path.sd-pair-connector")].some((p) => p.getTotalLength() > 0.5 && seen(p)),
      };
    }` };
    const r = await sampleFrames(page, "pairs", "fold", "points", probe);
    const start = r.frames[0].Norte;
    assert.ok(start.hollow && start.link && start.fromR > 0 && start.length > 20, `a pair before the fold (${JSON.stringify(start)})`);
    const folding = r.frames.filter((f) => f.Norte.hollow);
    assert.ok(folding.some((f) => f.Norte.fromR > 0.5 && f.Norte.fromR < start.fromR - 0.5), "the hollow dot is seen shrinking");
    assert.ok(folding.some((f) => f.Norte.length > 1 && f.Norte.length < start.length - 1), "the connector is seen retracting");
    const lengths = folding.map((f) => f.Norte.length);
    assert.ok(lengths.every((l, i) => i === 0 || l <= lengths[i - 1] + 0.01), "and only retracts");
    assert.ok(r.frames.every((f) => f.Norte.cx === r.end.Norte.cx), "the filled dot stays where it is");
    assert.deepEqual([r.end.Norte.hollow, r.end.Norte.link], [false, false], "no pair left at the end");
    assert.ok(r.frames.some((f) => f.este), "Este is on screen during the fold");
    assert.deepEqual(r.frames.filter((f) => f.este && (f.esteHollow || f.esteLink)).map((f) => f.ms), [], "Este never shows a hollow dot or a connector");
    assert.equal(await elementHtml(page, "points"), await htmlAfterJump(ctx, page, pages, "pairs", "fold", "points"));
    await errorsClean(page, ctx);
  });
});

test("pairs: the axis is the same at before and now", async () => {
  await withPage({ root, url: pages.url("pairs", "step=before") }, async (page, ctx) => {
    const base = await axis(page);
    const first = await rows(page);
    assert.ok(base.ticks.length >= 3, JSON.stringify(base.ticks));
    await ctx.open(pages.url("pairs", "step=now"));
    assert.deepEqual(await axis(page), base, "jumped: the same ticks at the same places, and the same plot");
    await ctx.open(pages.url("pairs", "step=before&motion=full"));
    await goTo(page, "pairs", "now");
    assert.deepEqual(await axis(page), base, "played: the same");
    // The domain covers both columns: the largest `before` (16.5) and the smallest `now` (8.3) are inside it.
    const ticks = base.ticks.map(([label]) => Number(label.replace(",", ".")));
    assert.ok(Math.min(...ticks) <= 8.3 && Math.max(...ticks) >= 16.5, `ticks ${ticks}`);
    const after = await rows(page);
    assert.deepEqual(Object.values(after).map((r) => r.transform), Object.values(first).map((r) => r.transform), "the rows keep their bands");
    await errorsClean(page, ctx);
  });
});

test("pairs: the entrance draws from the old value to the new one", async () => {
  await withPage({ root, url: pages.url("pairs-entrance", "step=start&motion=full") }, async (page, ctx) => {
    const r = await sampleFrames(page, "pairs-entrance", "go", "points", pairsProbe("Norte"));
    const shown = r.frames.filter((f) => f.visible).map((f) => ({ ...f.Norte, style: f.style }));
    const first = shown[0];
    const end = r.end.Norte;
    assert.ok(Math.abs(end.cx - end.from) > 20, `the pair has length at rest (${end.from} -> ${end.cx})`);
    assert.ok(Math.abs(first.cx - end.from) < 1, `the first frame shown has the filled dot on the old value (${first.cx} vs ${end.from})`);
    assert.equal(first.length, 0, "with no connector yet");
    assert.ok(shown.some((f) => f.cx < end.from - 1 && f.cx > end.cx + 1), "the dot passes between the two values");
    assert.ok(shown.some((f) => f.length > 1 && f.length < end.length - 1), "the connector grows behind it");
    assert.ok(shown.filter((f) => f.from !== null).every((f) => Math.abs(f.from - end.from) < 0.5), "the hollow dot stays at the old value");
    assert.deepEqual(r.frames.filter((f) => f.style !== null).map((f) => f.style), [], "the box stays still: the chart builds itself");
    assert.equal(await elementHtml(page, "points"), await htmlAfterJump(ctx, page, pages, "pairs-entrance", "go", "points"));
    await errorsClean(page, ctx);
  });
});

// Strips: with `id` each row is one dot in its category's strip (`g.sd-strip`), placed by `swarm` within the band.
const strips = (page) =>
  page.evaluate(() =>
    Object.fromEntries([...document.querySelectorAll('[data-el="points"] g.sd-points-row')].map((g) => {
      const n = (node, a) => Number(node.getAttribute(a));
      return [g.dataset.key, {
        y: Number(/translate\([-\d.e]+,([-\d.e]+)\)/.exec(g.getAttribute("transform"))[1]),
        dots: [...g.querySelectorAll(":scope > g.sd-strip > circle.sd-dot")].map((c) => ({
          id: c.dataset.id, cx: n(c, "cx"), cy: n(c, "cy"), r: n(c, "r"), focus: c.classList.contains("sd-focus"),
          fill: getComputedStyle(c).fill, stroke: getComputedStyle(c).stroke, last: c === c.parentNode.lastElementChild,
        })),
        summary: [...g.querySelectorAll(":scope > g.sd-strip > line.sd-summary")].map((l) => ({ x1: n(l, "x1"), x2: n(l, "x2"), y1: n(l, "y1"), y2: n(l, "y2") })),
        boxes: [...g.querySelectorAll(":scope > g.sd-overflow")].map((o) => o.dataset.side),
        noData: g.querySelector(":scope > text.sd-no-data")?.textContent ?? null,
      }];
    })),
  );

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const bandOf = (at) => {
  const ys = Object.values(at).map((s) => s.y).sort((a, b) => a - b);
  return ys[1] - ys[0];
};

test("strips: no two dots overlap beyond tolerance", async () => {
  await withPage({ root, url: pages.url("strips", "step=go") }, async (page, ctx) => {
    for (const step of ["go", "mean", "later", "none"]) {
      if (step !== "go") await ctx.open(pages.url("strips", `step=${step}`));
      const at = await strips(page);
      assert.deepEqual(Object.keys(at), ["Norte", "Sur", "Este", "Oeste"], step);
      const band = bandOf(at);
      for (const [key, s] of Object.entries(at)) {
        assert.equal(s.dots.length, 40, `${step}/${key}: one dot per point`);
        assert.equal(new Set(s.dots.map((d) => d.id)).size, 40, `${step}/${key}: each with its own id`);
        for (const d of s.dots) {
          assert.ok([d.cx, d.cy, d.r].every(Number.isFinite) && d.r > 0, `${step}/${key}/${d.id}: a placed dot`);
          assert.ok(Math.abs(d.cy) + d.r <= band / 2 + 0.5, `${step}/${key}/${d.id}: inside its band (${d.cy}, band ${band})`);
        }
        for (let i = 0; i < s.dots.length; i++) {
          for (let j = i + 1; j < s.dots.length; j++) {
            const [a, b] = [s.dots[i], s.dots[j]];
            const gap = Math.hypot(a.cx - b.cx, a.cy - b.cy) - (a.r + b.r);
            assert.ok(gap >= -0.5, `${step}/${key}: ${a.id} and ${b.id} overlap by ${(-gap).toFixed(2)} px`);
          }
        }
        // The summary tick: at the median of the strip's points (the scale is linear), then at their mean, then none.
        const xs = s.dots.map((d) => d.cx);
        const want = { go: median(xs), mean: xs.reduce((a, b) => a + b, 0) / xs.length, later: xs.reduce((a, b) => a + b, 0) / xs.length }[step];
        if (step === "none") assert.deepEqual(s.summary, [], `${key}: no tick`);
        else {
          assert.equal(s.summary.length, 1, `${step}/${key}: one tick`);
          assert.ok(Math.abs(s.summary[0].x1 - want) < 0.5 && s.summary[0].x1 === s.summary[0].x2, `${step}/${key}: the tick at ${want} (${JSON.stringify(s.summary[0])})`);
          assert.ok(s.summary[0].y1 < 0 && s.summary[0].y2 > 0, "across the strip");
        }
      }
    }
    await errorsClean(page, ctx);
  });
});

test("strips: the entrance fades the points in from left to right", async () => {
  await withPage({ root, url: pages.url("strips", "step=start&motion=full") }, async (page, ctx) => {
    const r = await sampleFrames(page, "strips", "go", "points", (el) => {
      const dots = [...el.querySelectorAll('g.sd-points-row[data-key="Este"] g.sd-strip circle.sd-dot')]
        .map((c) => [Number(c.getAttribute("cx")), Number(c.getAttribute("opacity") ?? 1)])
        .sort((a, b) => a[0] - b[0]);
      return { left: dots[0][1], right: dots.at(-1)[1] };
    });
    const shown = r.frames.filter((f) => f.visible);
    assert.ok(shown.length > 0, "the chart is shown");
    assert.deepEqual([shown[0].left, shown[0].right], [0, 0], "nothing drawn at the first frame shown");
    assert.ok(shown.some((f) => f.left > f.right + 0.2), "the left end of a strip fades in before its right end");
    assert.deepEqual(r.frames.filter((f) => f.style !== null).map((f) => f.style), [], "the box stays still: the chart builds itself");
    const building = shown.filter((f) => f.right < 1);
    const spanMs = building.at(-1).ms - shown[0].ms;
    assert.ok(spanMs >= 300 && spanMs < 4000, `one build over most of 2 x --sd-duration (${spanMs.toFixed(0)} ms)`);
    assert.equal(await elementHtml(page, "points"), await htmlAfterJump(ctx, page, pages, "strips", "go", "points"));
    await errorsClean(page, ctx);
  });
});

// The focus line: `M x,y L x,y` segments between the followed item's dots, trimmed at their rings.
const joinOf = (page) =>
  page.evaluate(() => {
    const paths = [...document.querySelectorAll('[data-el="points"] path.sd-focus-join')];
    const p = paths[0];
    if (!p) return { count: 0 };
    const segments = [...(p.getAttribute("d") ?? "").matchAll(/M([-\d.e]+),([-\d.e]+)L([-\d.e]+),([-\d.e]+)/g)].map((m) => m.slice(1).map(Number));
    return { count: paths.length, segments, stroke: getComputedStyle(p).stroke, fill: getComputedStyle(p).fill, halo: p.parentNode.querySelectorAll(".sd-halo-under").length > 0 };
  });

/** Asserts that the join's segments run between consecutive centres (row order), each on the line between them. */
function assertJoins(join, centres, r, label) {
  assert.equal(join.segments.length, centres.length - 1, `${label}: one segment between each pair of strips (${JSON.stringify(join.segments)})`);
  join.segments.forEach(([x1, y1, x2, y2], i) => {
    const [a, b] = [centres[i], centres[i + 1]];
    assert.ok(Math.hypot(x1 - a[0], y1 - a[1]) <= r + 6 && Math.hypot(x2 - b[0], y2 - b[1]) <= r + 6, `${label}: segment ${i} runs from ${a} to ${b} (${[x1, y1, x2, y2]})`);
    const cross = (b[0] - a[0]) * (y1 - a[1]) - (b[1] - a[1]) * (x1 - a[0]);
    assert.ok(Math.abs(cross) / Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5, `${label}: segment ${i} lies on the line between the dots`);
  });
}

test("focus: ring, raise and join line; others dim", async () => {
  await withPage({ root, url: pages.url("focus", "step=focus") }, async (page, ctx) => {
    const ink = await tokenRgb(page, "--sd-color-ink");
    const dim = await tokenRgb(page, "--sd-color-dim");
    // The followed item's dot centres, in row order (strips without it are skipped).
    const centresOf = (at) => Object.values(at).sort((a, b) => a.y - b.y).flatMap((s) => {
      const d = s.dots.find((q) => q.focus);
      return d ? [[d.cx, s.y + d.cy]] : [];
    });
    const at = await strips(page);
    for (const [key, s] of Object.entries(at)) {
      const ringed = s.dots.filter((d) => d.focus);
      assert.deepEqual(ringed.map((d) => d.id), ["p07"], `${key}: the followed item is ringed`);
      assert.equal(ringed[0].stroke, ink, `${key}: an ink ring`);
      assert.notEqual(ringed[0].fill, dim, `${key}: the followed dot keeps its colour`);
      assert.ok(ringed[0].last, `${key}: raised to the end of its strip`);
      assert.deepEqual(s.dots.filter((d) => !d.focus && d.fill !== dim).map((d) => d.id), [], `${key}: every other dot is the dim colour`);
    }
    const r = at.Norte.dots[0].r;
    const join = await joinOf(page);
    assert.equal(join.count, 1, "one join line");
    // No halo: it would cut background channels through the dim dots and bite into the rings it ends at.
    assert.deepEqual([join.stroke, join.fill, join.halo], [ink, "none", false], "a plain ink line");
    assertJoins(join, centresOf(at), r, "focus");
    const opacities = await page.evaluate(() => [...document.querySelectorAll('[data-el="points"] svg *')].map((n) => getComputedStyle(n).opacity));
    assert.ok(opacities.every((o) => o === "1"), "nothing is faded");

    // Re-sorted by the median, highest first: the line follows the new row order.
    await ctx.open(pages.url("focus", "step=resort"));
    const sorted = await strips(page);
    assert.deepEqual(Object.entries(sorted).sort((a, b) => a[1].y - b[1].y).map(([k]) => k), ["Este", "Norte", "Oeste", "Sur"]);
    assertJoins(await joinOf(page), centresOf(sorted), r, "resort");

    // Played: the other dots turn dim over --sd-duration-fast, never by opacity.
    await ctx.open(pages.url("focus", "step=strips&motion=full"));
    const played = await sampleFrames(page, "focus", "focus", "points", () => {
      const dot = document.querySelector('[data-el="points"] g.sd-points-row[data-key="Norte"] circle.sd-dot[data-id="p01"]');
      return { color: getComputedStyle(dot).fill, opacity: getComputedStyle(dot).opacity };
    });
    const move = colorMove(played.frames);
    assert.equal(move.to, dim, "p01 ends at the dim colour");
    assert.ok(move.moved >= 2, `the colour was seen part-way (${move.moved} frames)`);
    assert.ok(move.arrived >= 150, `200 ms, not a snap (arrived at ${move.arrived.toFixed(0)} ms)`);
    assert.ok(played.frames.every((f) => f.opacity === "1"), "opacity never changes");
    await errorsClean(page, ctx);
  });
});

test("focus: the join follows the rows down the plot while they re-sort", async () => {
  await withPage({ root, url: pages.url("focus", "step=focus&motion=full") }, async (page, ctx) => {
    const r = await sampleFrames(page, "focus", "resort", "points", (el) => {
      const p = el.querySelector("path.sd-focus-join");
      const ys = [...(p?.getAttribute("d") ?? "").matchAll(/M([-\d.e]+),([-\d.e]+)L([-\d.e]+),([-\d.e]+)/g)].flatMap((m) => [Number(m[2]), Number(m[4])]);
      const norte = el.querySelector('g.sd-points-row[data-key="Norte"]').getAttribute("transform");
      return { ys, norte };
    });
    const moving = r.frames.filter((f) => f.norte !== r.frames[0].norte && f.norte !== r.end.norte);
    assert.ok(moving.length > 0, "the rows are seen sliding");
    // Down the plot at every frame: each segment runs downward and starts below the end of the one before.
    const crossed = r.frames.filter((f) => f.ys.some((y, i) => i > 0 && y < f.ys[i - 1]));
    assert.deepEqual(crossed.map((f) => [Math.round(f.ms), f.ys.map(Math.round)]), [], "the join never doubles back up the plot");
    assert.equal(r.end.ys.length, 6, "three segments at the end");
    assert.equal(await elementHtml(page, "points"), await htmlAfterJump(ctx, page, pages, "focus", "resort", "points"));
    await errorsClean(page, ctx);
  });
});

test("strip edges: a single row, equal values, and a join that skips a strip without the item", async () => {
  await withPage({ root, url: pages.url("strip-edges", "step=edges") }, async (page, ctx) => {
    const at = await strips(page);
    assert.deepEqual(Object.keys(at), ["Uno", "Varios", "Igual", "Vacío"]);
    const band = bandOf(at);
    assert.equal(at.Uno.dots.length, 1);
    assert.equal(at.Uno.dots[0].cy, 0, "a single point sits on the row's centre line");
    assert.ok(at.Uno.summary.length === 1 && Math.abs(at.Uno.summary[0].x1 - at.Uno.dots[0].cx) < 0.01, "its tick is at its value");
    assert.equal(at.Igual.dots.length, 20);
    for (const d of at.Igual.dots) assert.ok(Number.isFinite(d.cy) && Math.abs(d.cy) + d.r <= band / 2 + 0.5, `${d.id}: inside the band (${d.cy})`);
    assert.ok(Math.abs(at.Igual.summary[0].x1 - at.Igual.dots[0].cx) < 0.01, "equal values: the tick on them");
    assert.equal(at.Varios.dots.length, 3, "an empty cell is not drawn");
    assert.deepEqual(at.Varios.dots.filter((d) => d.focus), [], "Varios has no a01");
    assert.deepEqual([at.Vacío.dots.length, at.Vacío.summary.length, at.Vacío.noData], [0, 0, "sin datos"]);
    const ends = ["Uno", "Igual"].map((k) => { const d = at[k].dots.find((q) => q.focus); return [d.cx, at[k].y + d.cy]; });
    assertJoins(await joinOf(page), ends, at.Uno.dots[0].r, "edges");
    await errorsClean(page, ctx);
  });
});

test("overflow box shows the count", async () => {
  const csv = readFileSync(new URL("../fixtures/decks/points/data/strips.csv", import.meta.url), "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
  const counts = ([lo, hi]) => Object.fromEntries(["Norte", "Sur", "Este", "Oeste"].map((k) => {
    const vs = csv.filter((c) => c[0] === k).map((c) => Number(c[2]));
    return [k, { low: vs.filter((v) => v < lo).length, high: vs.filter((v) => v > hi).length }];
  }));
  const boxes = (page) => page.evaluate(() => {
    const el = document.querySelector('[data-el="points"]');
    const box = (n) => n.getBoundingClientRect();
    const axis = box(el.querySelector("line.sd-axis-line"));
    const svg = box(el.querySelector("svg"));
    return {
      plot: [axis.left, axis.right],
      svg: [svg.left, svg.right],
      transform: el.querySelector("g.sd-plot").getAttribute("transform"),
      rows: Object.fromEntries([...el.querySelectorAll("g.sd-points-row")].map((g) => [g.dataset.key, {
        dots: g.querySelectorAll("g.sd-strip circle.sd-dot").length,
        label: box(el.querySelector(`text.sd-points-label[data-key="${g.dataset.key}"]`)),
        boxes: Object.fromEntries([...g.querySelectorAll(":scope > g.sd-overflow")].map((o) => {
          const t = o.querySelector("text.sd-overflow-count");
          return [o.dataset.side, { text: t.textContent, size: parseFloat(getComputedStyle(t).fontSize), fill: getComputedStyle(t).fill, rect: box(o.querySelector("rect.sd-overflow-box")) }];
        })),
      }])),
    };
  });
  await withPage({ root, url: pages.url("overflow", "step=cut") }, async (page, ctx) => {
    const muted = await tokenRgb(page, "--sd-color-muted");
    let sides = new Set();
    let plot = null;
    for (const [step, domain] of [["cut", [12, 30]], ["wide", [10, 34]]]) {
      if (step !== "cut") await ctx.open(pages.url("overflow", `step=${step}`));
      const at = await boxes(page);
      plot ??= at.transform;
      const want = counts(domain);
      for (const [key, row] of Object.entries(at.rows)) {
        const { low, high } = want[key];
        assert.equal(row.dots, 40 - low - high, `${step}/${key}: the points outside [${domain}] are not drawn`);
        assert.deepEqual(Object.keys(row.boxes).sort(), [...(high ? ["high"] : []), ...(low ? ["low"] : [])], `${step}/${key}: a box at each end with points past it`);
        for (const [side, b] of Object.entries(row.boxes)) {
          sides.add(side);
          assert.equal(b.text, side === "low" ? `‹ ${low}` : `${high} ›`, `${step}/${key}: the count`);
          assert.ok(b.size >= 28, `${step}/${key}: audience text (${b.size}px)`);
          assert.equal(b.fill, muted, "muted");
          if (side === "low") assert.ok(b.rect.right <= at.plot[0] + 0.5 && b.rect.left >= row.label.right - 0.5, `${step}/${key}: between the label and the plot (${JSON.stringify([row.label.right, b.rect.left, b.rect.right, at.plot[0]])})`);
          else assert.ok(b.rect.left >= at.plot[1] - 0.5 && b.rect.right <= at.svg[1] + 0.5, `${step}/${key}: past the plot's end, inside the chart`);
        }
      }
    }
    assert.deepEqual([...sides].sort(), ["high", "low"], "both ends are cut somewhere");
    await ctx.open(pages.url("overflow", "step=auto"));
    const auto = await boxes(page);
    assert.deepEqual(Object.values(auto.rows).map((r) => [r.dots, Object.keys(r.boxes).length]), [[40, 0], [40, 0], [40, 0], [40, 0]], "without `domain` every point is drawn");
    assert.equal(auto.transform, plot, "the plot keeps its place and size");
    await errorsClean(page, ctx);
  });
});

test("unknown focus id shows on the slide", async () => {
  await withPage({ root, url: broken.url("focus-error", "") }, async (page, ctx) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.deepEqual(errors, ["focus-error/points: `focus` id 'p99' not found in data/strips.csv"]);
    const shown = await page.evaluate(() => document.querySelector('[data-el="points"] .sd-error')?.textContent);
    assert.match(shown ?? "", /`focus` id 'p99' not found in data\/strips\.csv/);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-el="src"]')).visibility), "visible");
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

for (const theme of ["academic-light", "modern"]) {
  test(`check --played is clean on the points deck under ${theme}`, async () => {
    const problems = await check(deck, { played: true, theme });
    assert.deepEqual(problems.map(formatProblem), []);
  });
}
