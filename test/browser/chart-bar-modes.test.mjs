// `chart.bar` re-sorts in Chrome: `sort` orders the bands, and on a played step every bar, with its band label, whisker
// and value label, slides to its new place. Hidden bars keep their place in the sorted order. Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test --test-concurrency=1 test/browser/chart-bar-modes.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { deckPages, goTo, expectJumpEqualsPlayed, expectBackwardEqualsJump, expectInterruptEqualsJump, elementHtml, htmlAfterJump, sampleFrames } from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const pages = deckPages("test/fixtures/decks/bar-modes/");
const broken = deckPages("test/fixtures/decks/bar-modes-broken/");
const STEPS = {
  resort: ["data", "desc", "list", "later"],
  "resort-shown": ["start", "both", "all", "flip", "less"],
  "resort-vertical": ["data", "desc", "list", "later"],
};
const INTERRUPTS = [
  ["resort", "data", "desc", "list"],
  ["resort", "list", "later", "desc"],
  ["resort-shown", "start", "both", "all"],
  ["resort-shown", "both", "all", "flip"],
  ["resort-shown", "flip", "less", "all"],
  ["resort-vertical", "data", "desc", "list"],
  ["resort-vertical", "list", "later", "data"],
];

// Where each bar's parts sit across the bands (y for horizontal bars, x for vertical ones), read from the markup
// inside the page. Self-contained, as sampleFrames sends its source to the page: it returns { at }.
const bands = (el) => {
  const horizontal = el.querySelector("svg").dataset.orient === "horizontal";
  const num = (node, a) => Number(node.getAttribute(a));
  const out = {};
  for (const g of el.querySelectorAll("g.sd-bar-group")) {
    const key = g.dataset.key;
    const rect = g.querySelector("rect.sd-bar");
    const line = g.querySelector("g.sd-whisker > line.sd-whisker-line");
    const label = [...el.querySelectorAll("text.sd-band-label")].find((t) => t.dataset.key === key);
    out[key] = {
      bar: horizontal ? num(rect, "y") + num(rect, "height") / 2 : num(rect, "x") + num(rect, "width") / 2,
      whisker: line ? num(line, horizontal ? "y1" : "x1") : null,
      label: horizontal ? num(label, "y") : num(label.querySelector("tspan"), "x"), // one line each: level with the bar
      value: num(g.querySelector("text.sd-bar-label"), horizontal ? "y" : "x"),
      visible: g.dataset.visible,
    };
  }
  return { at: out };
};

const read = (page) => page.evaluate(`(${bands})(document.querySelector('[data-el="bars"]')).at`);
const order = (page) => page.evaluate(() => [...document.querySelectorAll('[data-el="bars"] g.sd-bar-group')].map((g) => g.dataset.key));
const labelOrder = (page) => page.evaluate(() => [...document.querySelectorAll('[data-el="bars"] text.sd-band-label')].map((t) => t.dataset.key));
const errorsClean = async (page, ctx) => {
  assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
  assert.deepEqual(ctx.errors, []);
};

/** The bands, from the lowest centre to the highest: the categories in the order they sit on the page. */
const placed = (at) => Object.entries(at).sort((a, b) => a[1].bar - b[1].bar).map(([k]) => k);

// A bar passes through intermediate band positions on a played re-sort, and its label, whisker and value label with it.
for (const [slide, label] of [["resort", "horizontal"], ["resort-vertical", "vertical"]]) {
  test(`bar resort: bars pass through intermediate band positions (${label})`, async () => {
    await withPage({ root, url: pages.url(slide, "step=data&motion=full") }, async (page, ctx) => {
      const before = await read(page);
      assert.deepEqual(placed(before), ["North", "South", "East", "West", "Centre"], "data order first");
      assert.deepEqual(await order(page), ["North", "South", "East", "West", "Centre"]);
      const r = await sampleFrames(page, slide, "desc", "bars", bands);
      const end = r.end.at;
      assert.deepEqual(placed(end), ["Centre", "East", "North", "South", "West"], "highest first");
      // North 0 -> 2, East 2 -> 1, Centre 4 -> 0 (slots); South and West change too.
      for (const key of ["North", "East", "Centre"]) {
        const [a, b] = [before[key].bar, end[key].bar];
        assert.notEqual(a, b, `${key} changes rank`);
        const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
        const bars = r.frames.map((f) => f.at[key].bar);
        assert.ok(bars.some((v) => v > lo + 1 && v < hi - 1), `${key}: a frame strictly between ${a} and ${b}`);
        assert.ok(bars.every((v) => v >= lo - 0.01 && v <= hi + 0.01), `${key}: never past either end`);
        for (const part of ["label", "whisker", "value"]) {
          assert.ok(r.frames.some((f) => f.at[key][part] > lo + 1 && f.at[key][part] < hi - 1), `${key}: its ${part} slides too`);
        }
        // Every part stays level with the bar: the label's and the value label's offsets are fixed, the whisker's is the bar's.
        for (const f of r.frames) {
          assert.ok(Math.abs(f.at[key].whisker - f.at[key].bar) < 0.01, `${key}: the whisker stays level with its bar`);
          assert.ok(Math.abs(f.at[key].label - f.at[key].bar) < 0.01, `${key}: the band label stays level with its bar`);
          assert.ok(Math.abs(f.at[key].value - f.at[key].bar) < 0.01, `${key}: the value label stays level with its bar`);
        }
        assert.equal(end[key].label, end[key].bar, `${key}: the label ends at the bar's place`);
      }
      const moving = r.frames.filter((f) => f.at.Centre.bar !== before.Centre.bar && f.at.Centre.bar !== end.Centre.bar);
      assert.ok(moving.length >= 2, `seen part-way in several frames (${moving.length})`);
      assert.ok(moving.at(-1).ms - moving[0].ms < r.settledMs, "inside the morph");
      assert.deepEqual(await order(page), ["Centre", "East", "North", "South", "West"], "the markup follows the new order");
      assert.deepEqual(await labelOrder(page), ["Centre", "East", "North", "South", "West"], "and so do the band labels");
      await ctx.open(pages.url(slide, "step=desc"));
      assert.deepEqual(await order(page), ["Centre", "East", "North", "South", "West"], "as does a jump");
      await errorsClean(page, ctx);
    });
  });
}

test("bar resort keeps hidden slot", async () => {
  await withPage({ root, url: pages.url("resort-shown", "step=both") }, async (page, ctx) => {
    // North, South and East are shown; Centre (the highest) and West (the lowest) are hidden but ranked.
    assert.deepEqual(await order(page), ["Centre", "East", "North", "South", "West"], "every category is ranked, shown or not");
    const hidden = await read(page);
    assert.deepEqual(placed(hidden), ["Centre", "East", "North", "South", "West"], "one band each, in the sorted order");
    assert.deepEqual(Object.entries(hidden).filter(([, b]) => b.visible === "true").map(([k]) => k).sort(), ["East", "North", "South"]);
    const centres = placed(hidden).map((k) => hidden[k].bar);
    const step = centres[1] - centres[0];
    assert.ok(step > 1, `a band is ${step}px`);
    centres.forEach((c, i) => assert.ok(Math.abs(c - centres[0] - step * i) < 0.01, `band ${i} is one step from the last`));

    // Played, Centre appears in the band it already had, and Centre and West never move.
    await ctx.open(pages.url("resort-shown", "step=both&motion=full"));
    await goTo(page, "resort-shown", "all");
    const all = await read(page);
    for (const k of ["Centre", "West"]) assert.equal(all[k].bar, hidden[k].bar, `${k} appears in the slot it already had`);
    assert.equal(all.Centre.visible, "true");
    assert.equal(await elementHtml(page, "bars"), await htmlAfterJump(ctx, page, pages, "resort-shown", "all", "bars"));
    await errorsClean(page, ctx);
  });
});

test("bar resort while a bar appears: the newcomer is in its place, the others slide", async () => {
  await withPage({ root, url: pages.url("resort-shown", "step=start&motion=full") }, async (page, ctx) => {
    const first = await read(page);
    assert.deepEqual(placed(first), ["North", "South", "East", "West", "Centre"], "data order");
    const r = await sampleFrames(page, "resort-shown", "both", "bars", bands);
    const end = r.end.at;
    // East (15.2) is new and ranks second: it grows at its final place while North and South slide down.
    assert.ok(r.frames.every((f) => f.at.East.bar === end.East.bar), "East is at its final place from its first frame");
    for (const key of ["North", "South"]) {
      assert.ok(end[key].bar > first[key].bar + 1, `${key} slides down (${first[key].bar} -> ${end[key].bar})`);
      assert.ok(r.frames.some((f) => f.at[key].bar > first[key].bar + 1 && f.at[key].bar < end[key].bar - 1), `${key} passes between`);
    }
    assert.equal(await elementHtml(page, "bars"), await htmlAfterJump(ctx, page, pages, "resort-shown", "both", "bars"));
    // `flip` re-sorts every bar, all shown now, the other way round.
    await ctx.open(pages.url("resort-shown", "step=all&motion=full"));
    await goTo(page, "resort-shown", "flip");
    assert.deepEqual(await order(page), ["West", "South", "North", "East", "Centre"], "lowest first");
    assert.equal(await elementHtml(page, "bars"), await htmlAfterJump(ctx, page, pages, "resort-shown", "flip", "bars"));
    await errorsClean(page, ctx);
  });
});

// Each slide, and each interrupted move, is a test of its own: a failure names the slide, and none runs long.
for (const [slide, steps] of Object.entries(STEPS)) {
  test(`bar resort: ${slide}: played, jumped and backward end the same`, async () => {
    await withPage({ root, url: pages.url(slide, `step=${steps[0]}`) }, async (page, ctx) => {
      await expectJumpEqualsPlayed(ctx, page, { pages, slide, steps, id: "bars" });
      await expectBackwardEqualsJump(ctx, page, { pages, slide, steps, id: "bars" });
    });
  });
}
for (const [slide, from, via, to] of INTERRUPTS) {
  test(`bar resort: ${slide}: '${from}' -> '${via}' interrupted by '${to}' ends as a jump`, async () => {
    await withPage({ root, url: pages.url(slide, `step=${from}`) }, async (page, ctx) => {
      await expectInterruptEqualsJump(ctx, page, { pages, slide, from, via, to, id: "bars" });
    });
  });
}

test("unknown sort column shows on the slide", async () => {
  await withPage({ root, url: broken.url("sort-error", "") }, async (page, ctx) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.deepEqual(errors, ["sort-error/bars: sort column 'pace' not found (columns: group, score, low, high, later, low2, high2)"]);
    assert.match(await page.evaluate(() => document.querySelector('[data-el="bars"] .sd-error')?.textContent) ?? "", /sort column 'pace' not found/);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-el="src"]')).visibility), "visible");
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});
