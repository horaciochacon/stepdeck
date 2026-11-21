// `chart.bar` re-sorts and modes in Chrome: `sort` orders the bands, and on a played step every bar, with its band label,
// whisker and value label, slides to its new place. Hidden bars keep their place in the sorted order. `mode: "waterfall"`
// stacks the shown bars into running totals, with dotted connectors and an optional total bar, and morphs from and to
// plain bars. Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test --test-concurrency=1 test/browser/chart-bar-modes.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { deckPages, goTo, expectJumpEqualsPlayed, expectBackwardEqualsJump, expectInterruptEqualsJump, elementHtml, htmlAfterJump, sampleFrames, tokenRgb, paletteRoleRgb, colorMove } from "./helpers.mjs";

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
      // The step plays its motion (2 x --sd-duration, 800 ms in modern) before it settles: half of it is a safe floor.
      assert.ok(r.settledMs >= 400, `the step settles after its motion has played (${Math.round(r.settledMs)} ms)`);
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

    // Played, Centre appears in the band it already had, and Centre and West end the step in the bands they had.
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
    // East (15.2) is new and ranks second: it grows at its final place while North and South slide down. Frames sampled
    // before the step's first paint (East still hidden) show the old state, so only the frames from that paint on count.
    const painted = r.frames.findIndex((f) => f.at.East.visible === "true");
    assert.ok(painted >= 0, "the step paints East shown");
    assert.ok(r.frames.slice(painted).every((f) => f.at.East.bar === end.East.bar), "East is at its final place from its first painted frame");
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

// --- Waterfall -------------------------------------------------------------------------------------------------------

const WATERFALL_STEPS = {
  waterfall: ["start", "appear", "total", "later", "ranked", "back"],
  "waterfall-sort": ["data", "desc", "asc", "list"],
  "waterfall-invert": ["plain", "invert", "focus", "back"],
  "waterfall-vertical": ["start", "appear", "less"],
  "waterfall-enter": ["start", "go", "later"],
  "waterfall-floor": ["only"],
  "waterfall-below": ["only"],
  "mode-switch": ["bars", "waterfall", "again"],
  "mode-switch-vertical": ["bars", "waterfall", "again"],
  "mode-switch-swing": ["bars", "waterfall", "again"],
};
const WATERFALL_INTERRUPTS = [
  ["waterfall", "start", "appear", "total"],
  ["waterfall", "total", "later", "appear"],
  ["waterfall", "later", "ranked", "back"],
  ["waterfall-sort", "data", "desc", "asc"],
  ["waterfall-invert", "plain", "invert", "focus"],
  ["waterfall-vertical", "start", "appear", "start"],
  ["waterfall-vertical", "appear", "less", "start"],
  ["waterfall-enter", "start", "go", "later"],
  ["mode-switch", "bars", "waterfall", "again"],
  ["mode-switch", "waterfall", "again", "bars"],
];
const CATEGORIES = ["Opening", "Growth", "Prices", "Costs", "Taxes", "Other"];

// Each bar's start and end along the value axis (pixels in plot coordinates), read from its rect and the sign of its
// value label (a decrease reads "−"), plus the connectors and the band labels. Self-contained: sampleFrames sends its
// source to the page.
const flow = (el) => {
  const svg = el.querySelector("svg");
  const horizontal = svg.dataset.orient === "horizontal";
  const num = (node, a) => Number(node.getAttribute(a));
  const axis = el.querySelector("line.sd-axis-line");
  const bars = {};
  for (const g of el.querySelectorAll("g.sd-bar-group")) {
    const rect = g.querySelector("rect.sd-bar");
    const lo = horizontal ? num(rect, "x") : num(rect, "y");
    const len = horizontal ? num(rect, "width") : num(rect, "height");
    const text = g.querySelector("text.sd-bar-label").textContent;
    const down = text.startsWith("\u2212");
    const fromLow = horizontal ? !down : down; // an increase runs right, or up (towards lower y)
    bars[g.dataset.key] = {
      start: fromLow ? lo : lo + len, end: fromLow ? lo + len : lo, len,
      center: horizontal ? num(rect, "y") + num(rect, "height") / 2 : num(rect, "x") + num(rect, "width") / 2,
      visible: g.dataset.visible, text, opacity: g.getAttribute("opacity"), fill: getComputedStyle(rect).fill,
    };
  }
  const links = [...el.querySelectorAll("line.sd-connector")].map((l) => ({
    key: l.dataset.key, opacity: l.getAttribute("opacity"),
    at: num(l, horizontal ? "x1" : "y1"), at2: num(l, horizontal ? "x2" : "y2"),
  }));
  const bands = Object.fromEntries([...el.querySelectorAll("text.sd-band-label")].map((t) => [t.dataset.key, t.textContent]));
  return { mode: svg.dataset.mode ?? null, zero: num(axis, horizontal ? "x1" : "y1"), bars, links, bands };
};
const readFlow = (page) => page.evaluate(`(${flow})(document.querySelector('[data-el="bars"]'))`);

/** The shown bars whose value label overlaps their own rect (bounding boxes, in plot coordinates): none, in a waterfall. */
const labelsInside = (page) => page.evaluate(() => [...document.querySelectorAll('[data-el="bars"] g.sd-bar-group[data-visible="true"]')]
  .filter((g) => {
    const r = g.querySelector("rect.sd-bar").getBBox();
    const t = g.querySelector("text.sd-bar-label").getBBox();
    const across = Math.min(r.x + r.width, t.x + t.width) - Math.max(r.x, t.x);
    const down = Math.min(r.y + r.height, t.y + t.height) - Math.max(r.y, t.y);
    return across > 0.5 && down > 0.5;
  })
  .map((g) => `${g.dataset.key} "${g.querySelector("text.sd-bar-label").textContent}"`));

/** Where the plot sits and how big it is, and where the band labels are: what a mode change must not move. */
const frameOf = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-el="bars"]');
  const horizontal = el.querySelector("svg").dataset.orient === "horizontal";
  // The domain ends are ticks (the axis is rounded to them), so the farthest tick is the plot's length along the axis.
  const ticks = [...el.querySelectorAll("g.sd-axis-value g.tick")].map((t) => t.getAttribute("transform").match(/-?[\d.]+/g).map(Number));
  const grid = el.querySelector("g.sd-axis-value line.sd-grid-line");
  return {
    plot: el.querySelector("g.sd-plot").getAttribute("transform"),
    along: Math.max(...ticks.map(([x, y]) => (horizontal ? x : y))),
    across: Number(grid.getAttribute(horizontal ? "y2" : "x2")),
    bands: [...el.querySelectorAll("text.sd-band-label")].map((t) => [t.dataset.key, t.getAttribute("y"), t.querySelector("tspan").getAttribute("x")]),
  };
});
const near = (a, b, message) => assert.ok(Math.abs(a - b) < 0.01, `${message} (${a} vs ${b})`);
const between = (v, a, b) => v > Math.min(a, b) + 1 && v < Math.max(a, b) - 1;
const within = (v, a, b) => v >= Math.min(a, b) - 0.01 && v <= Math.max(a, b) + 0.01;

/**
 * The waterfall adds up what is on screen: in display order each bar starts where the shown bars before it end (zero
 * for the first), a hidden bar has no length there, the total bar runs from zero to the last shown end, and one
 * connector joins each shown bar's end to the next shown bar (the last one to the total), at that end.
 * -> { order, shown }.
 */
function expectAddsUp(state, label) {
  const order = Object.keys(state.bars).filter((k) => k !== "__total").sort((a, b) => state.bars[a].center - state.bars[b].center);
  let run = state.zero;
  const shown = [];
  for (const key of order) {
    const bar = state.bars[key];
    near(bar.start, run, `${label}: ${key} starts where the shown bars before it end`);
    if (bar.visible === "true") {
      shown.push(key);
      run = bar.end;
    } else near(bar.len, 0, `${label}: hidden ${key} has no length`);
  }
  const total = state.bars.__total;
  const totalShown = total?.visible === "true";
  if (totalShown) {
    near(total.start, state.zero, `${label}: the total starts at zero`);
    near(total.end, run, `${label}: the total bar ends where the last shown bar ends`);
  }
  const joined = [...shown.slice(0, -1), ...(totalShown ? shown.slice(-1) : [])];
  assert.deepEqual(state.links.map((l) => l.key).sort(), joined.sort(), `${label}: one connector per pair of consecutive shown bars`);
  for (const l of state.links) {
    near(l.at, state.bars[l.key].end, `${label}: the connector from ${l.key} leaves at its end`);
    near(l.at2, l.at, `${label}: the connector from ${l.key} runs straight across the bands`);
  }
  return { order, shown };
}

const WATERFALL_CHECKS = {
  waterfall: {
    start: (s) => {
      assert.equal(s.bars.Growth.visible, "false");
      assert.equal(s.bars.__total.visible, "false", "the total's band is kept for the step that shows it");
    },
    total: (s) => {
      assert.equal(s.bars.__total.visible, "true");
      assert.equal(s.bands.__total, "Total", "labelled with the engine string");
      assert.equal(s.bars.__total.text, "39", "the total is a level, not signed");
      assert.deepEqual(["Growth", "Costs", "Other"].map((k) => s.bars[k].text), ["+12", "\u221215", "+3"], "contributions are signed");
    },
    later: (s) => assert.equal(s.bars.__total.text, "38"),
    ranked: (s, { order, shown }) => {
      assert.deepEqual(order, ["Opening", "Growth", "Prices", "Other", "Taxes", "Costs"], "highest first, Prices in its place");
      assert.ok(!shown.includes("Prices"));
    },
    back: (s, { order }) => assert.deepEqual(order, CATEGORIES),
  },
  "waterfall-sort": {
    data: (s, { order }) => assert.deepEqual(order, CATEGORIES),
    desc: (s, { order }) => assert.deepEqual(order, ["Opening", "Growth", "Prices", "Other", "Taxes", "Costs"]),
    asc: (s, { order }) => {
      assert.deepEqual(order, ["Costs", "Taxes", "Other", "Prices", "Growth", "Opening"]);
      assert.ok(s.bars.Taxes.end < s.zero - 1, "the running total dips below zero");
      assert.equal(s.bands.__total, "Net change", "labelled with `total`");
    },
    list: (s, { order }) => assert.deepEqual(order, ["Costs", "Taxes", "Opening", "Growth", "Prices", "Other"]),
  },
};

// Every step of every waterfall slide, jumped to: the bars add up what is on screen.
for (const [slide, steps] of Object.entries(WATERFALL_STEPS)) {
  test(`waterfall: totals add up what is on screen (${slide})`, async () => {
    await withPage({ root, url: pages.url(slide, `step=${steps[0]}`) }, async (page, ctx) => {
      for (const step of steps) {
        await ctx.open(pages.url(slide, `step=${step}`));
        if (slide === "waterfall-enter" && step === "start") continue; // the chart enters at `go`
        const state = await readFlow(page);
        if (slide.startsWith("mode-switch") && step !== "waterfall") {
          assert.equal(state.mode, null, `${step}: plain bars carry no data-mode`);
          assert.deepEqual(state.links, [], `${step}: no connectors`);
          assert.equal(await page.evaluate(() => document.querySelectorAll('[data-el="bars"] g.sd-connectors').length), 0);
          for (const key of Object.keys(state.bars).filter((k) => k !== "__total")) near(state.bars[key].start, state.zero, `${step}: ${key} starts at zero`);
          continue;
        }
        assert.equal(state.mode, "waterfall");
        const seen = expectAddsUp(state, `${slide}/${step}`);
        WATERFALL_CHECKS[slide]?.[step]?.(state, seen);
        assert.deepEqual(await labelsInside(page), [], `${slide}/${step}: every value label sits outside its bar`);
      }
      await errorsClean(page, ctx);
    });
  });
}

test("waterfall: an early category appears: it grows from the running total before it and the later bases move up", async () => {
  await withPage({ root, url: pages.url("waterfall", "step=start&motion=full") }, async (page, ctx) => {
    const first = await readFlow(page);
    const r = await sampleFrames(page, "waterfall", "appear", "bars", flow);
    const end = r.end;
    const opening = first.bars.Opening.end;
    near(end.bars.Growth.start, opening, "Growth sits on Opening's end");
    assert.ok(end.bars.Growth.end > opening + 1, "and runs on from there");
    // From the step's first paint (Growth shown) on, every frame adds up: Growth grows from Opening's end while the
    // bases after it move up by as much.
    const painted = r.frames.findIndex((f) => f.bars.Growth.visible === "true");
    assert.ok(painted >= 0, "the step paints Growth shown");
    const frames = r.frames.slice(painted);
    frames.forEach((f, i) => expectAddsUp(f, `frame ${i}`));
    assert.ok(frames.every((f) => Math.abs(f.bars.Growth.start - opening) < 0.01), "Growth's start stays at the running total before it");
    assert.ok(frames.some((f) => between(f.bars.Growth.end, opening, end.bars.Growth.end)), "Growth is seen part-grown");
    for (const key of ["Prices", "Costs", "Taxes", "Other"]) {
      const [a, b] = [first.bars[key].start, end.bars[key].start];
      assert.ok(b > a + 1, `${key}'s base moves up (${a} -> ${b})`);
      assert.ok(frames.some((f) => between(f.bars[key].start, a, b)), `${key}'s base is seen part-way`);
      assert.ok(frames.every((f) => within(f.bars[key].start, a, b)), `${key}'s base never passes either end`);
    }
    assert.equal(await elementHtml(page, "bars"), await htmlAfterJump(ctx, page, pages, "waterfall", "appear", "bars"));
    await errorsClean(page, ctx);
  });
});

test("waterfall: its own entrance grows the whole waterfall out of zero, joined at every frame", async () => {
  await withPage({ root, url: pages.url("waterfall-enter", "step=start&motion=full") }, async (page, ctx) => {
    const r = await sampleFrames(page, "waterfall-enter", "go", "bars", flow);
    const shown = r.frames.filter((f) => f.visible);
    assert.ok(shown.length > 0, "the chart is shown");
    const keys = [...CATEGORIES, "__total"];
    for (const key of keys) near(shown[0].bars[key].len, 0, `the first frame with the chart shown has ${key} at no length`);
    assert.deepEqual(shown.filter((f) => f.style !== null).map((f) => f.style), [], "the box stays still: the bars grow themselves");
    shown.forEach((f, i) => expectAddsUp(f, `frame ${i}`));
    assert.ok(shown.some((f) => keys.every((k) => f.bars[k].len > 1 && f.bars[k].len < r.end.bars[k].len - 1)), "seen part-grown, every bar at once");
    assert.equal(await elementHtml(page, "bars"), await htmlAfterJump(ctx, page, pages, "waterfall-enter", "go", "bars"));
    await errorsClean(page, ctx);
  });
});

test("waterfall: categories that leave shrink into the running total, joined at every frame (vertical)", async () => {
  await withPage({ root, url: pages.url("waterfall-vertical", "step=appear&motion=full") }, async (page, ctx) => {
    const first = await readFlow(page);
    const r = await sampleFrames(page, "waterfall-vertical", "less", "bars", flow);
    const end = r.end;
    // Every frame adds up, the leavers included until they are hidden: each shrinks to a point where the bars after it
    // now start, and those move down (up the page is down the value axis here: larger y).
    r.frames.forEach((f, i) => expectAddsUp(f, `frame ${i}`));
    for (const key of ["Growth", "Taxes"]) {
      assert.equal(end.bars[key].visible, "false", `${key} has left`);
      assert.ok(r.frames.some((f) => f.bars[key].visible === "true" && f.bars[key].len > 1 && f.bars[key].len < first.bars[key].len - 1), `${key} is seen part-shrunk`);
      assert.ok(r.frames.some((f) => f.links.some((l) => l.key === key && l.opacity !== null)), `${key}'s connector fades out`);
    }
    const [a, b] = [first.bars.Prices.start, end.bars.Prices.start];
    assert.ok(b > a + 1, `Prices' base moves down (${a} -> ${b})`);
    assert.ok(r.frames.some((f) => between(f.bars.Prices.start, a, b)), "Prices' base is seen part-way");
    assert.equal(await elementHtml(page, "bars"), await htmlAfterJump(ctx, page, pages, "waterfall-vertical", "less", "bars"));
    await errorsClean(page, ctx);
  });
});

test("waterfall: the total fades in at its place, joined to the last bar", async () => {
  await withPage({ root, url: pages.url("waterfall", "step=appear&motion=full") }, async (page, ctx) => {
    const r = await sampleFrames(page, "waterfall", "total", "bars", flow);
    const fading = r.frames.filter((f) => f.bars.__total.visible === "true" && f.bars.__total.opacity !== null);
    assert.ok(fading.some((f) => Number(f.bars.__total.opacity) > 0.01 && Number(f.bars.__total.opacity) < 0.99), "the total is seen part-faded");
    for (const f of fading) near(f.bars.__total.end, r.end.bars.__total.end, "it fades in at its place");
    assert.ok(r.frames.some((f) => f.links.some((l) => l.key === "Other" && l.opacity !== null && Number(l.opacity) < 0.99)), "its connector fades in too");
    assert.equal(r.end.bars.__total.opacity, null, "at rest it has no opacity attribute");
    assert.deepEqual(r.end.links.map((l) => l.opacity), r.end.links.map(() => null), "nor do the connectors");
    assert.equal(await elementHtml(page, "bars"), await htmlAfterJump(ctx, page, pages, "waterfall", "total", "bars"));
    await errorsClean(page, ctx);
  });
});

test("waterfall: a y change re-tweens bars, bases and connectors, joined at every frame", async () => {
  await withPage({ root, url: pages.url("waterfall", "step=total&motion=full") }, async (page, ctx) => {
    const first = await readFlow(page);
    const r = await sampleFrames(page, "waterfall", "later", "bars", flow);
    r.frames.forEach((f, i) => expectAddsUp(f, `frame ${i}`));
    for (const key of ["Prices", "Costs", "Other", "__total"]) {
      const [a, b] = [first.bars[key].end, r.end.bars[key].end];
      assert.ok(Math.abs(b - a) > 1, `${key}'s end moves (${a} -> ${b})`);
      assert.ok(r.frames.some((f) => between(f.bars[key].end, a, b)), `${key}'s end is seen part-way`);
    }
    const link = (s) => s.links.find((l) => l.key === "Costs").at;
    assert.ok(r.frames.some((f) => between(link(f), link(first), link(r.end))), "the connector from Costs moves with it");
    assert.equal(await elementHtml(page, "bars"), await htmlAfterJump(ctx, page, pages, "waterfall", "later", "bars"));
    await errorsClean(page, ctx);
  });
});

test("waterfall: colours from the diverging palette, swapped by invert", async () => {
  await withPage({ root, url: pages.url("waterfall-invert", "step=plain") }, async (page, ctx) => {
    const [high, low] = [paletteRoleRgb("modern", "diverging", "high"), paletteRoleRgb("modern", "diverging", "low")];
    const ink = await tokenRgb(page, "--sd-color-ink");
    assert.notEqual(high, low);
    const ups = ["Opening", "Growth", "Prices", "Other"];
    const downs = ["Costs", "Taxes"];
    const fills = async () => Object.fromEntries(Object.entries((await readFlow(page)).bars).map(([k, b]) => [k, b.fill]));
    const expect = (got, up, down, label) => {
      for (const k of ups) assert.equal(got[k], up, `${label}: increase ${k}`);
      for (const k of downs) assert.equal(got[k], down, `${label}: decrease ${k}`);
      assert.equal(got.__total, ink, `${label}: the total is ink`);
    };
    expect(await fills(), high, low, "plain");
    await ctx.open(pages.url("waterfall-invert", "step=invert"));
    expect(await fills(), low, high, "invert");
    await ctx.open(pages.url("waterfall-invert", "step=back"));
    expect(await fills(), high, low, "invert: false");

    // Played, the swap is a colour tween, not a snap.
    await ctx.open(pages.url("waterfall-invert", "step=plain&motion=full"));
    const r = await sampleFrames(page, "waterfall-invert", "invert", "bars", (el) => ({ color: getComputedStyle(el.querySelector('g.sd-bar-group[data-key="Costs"] rect.sd-bar')).fill }));
    const move = colorMove(r.frames);
    assert.equal(move.from, low);
    assert.equal(move.to, high);
    assert.ok(move.moved >= 1, `Costs passes through a colour between the two (${move.moved} frames)`);
    await errorsClean(page, ctx);
  });
});

// A slide with a waterfall step lays every step out for it, so a mode change moves the bars and never the frame.
for (const slide of ["mode-switch", "mode-switch-vertical", "mode-switch-swing"]) {
  test(`a mode switch keeps the frame (${slide})`, async () => {
    await withPage({ root, url: pages.url(slide, "step=bars") }, async (page, ctx) => {
      const frames = {};
      for (const step of WATERFALL_STEPS[slide]) {
        await ctx.open(pages.url(slide, `step=${step}`));
        frames[step] = await frameOf(page);
      }
      assert.deepEqual(frames.waterfall, frames.bars, "bars -> waterfall: same plot place and size, same band labels");
      assert.deepEqual(frames.again, frames.bars, "and back");
      await errorsClean(page, ctx);
    });
  });
}

test("waterfall: a re-sort while a category leaves, then while it comes back: the bars slide and still add up", async () => {
  // While bars change places their bases move from one order's running totals to the other's, so the stack is joined
  // only at rest. At every frame, though, the shown bars add up to the total, and a bar that stays keeps its length.
  const addsUpToTotal = (f, label) => {
    const lengths = Object.entries(f.bars).filter(([k, b]) => k !== "__total" && b.visible === "true").map(([, b]) => b.end - b.start);
    const sum = lengths.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - (f.bars.__total.end - f.bars.__total.start)) < 0.05, `${label}: the shown bars add up to the total (${sum})`);
  };
  await withPage({ root, url: pages.url("waterfall", "step=later&motion=full") }, async (page, ctx) => {
    for (const [from, to, mover] of [["later", "ranked", "Prices"], ["ranked", "back", "Prices"]]) {
      if (from !== "later") await ctx.open(pages.url("waterfall", `step=${from}&motion=full`));
      const first = await readFlow(page);
      const r = await sampleFrames(page, "waterfall", to, "bars", flow);
      r.frames.forEach((f, i) => addsUpToTotal(f, `${to} frame ${i}`));
      for (const key of ["Opening", "Growth", "Costs", "Taxes", "Other"]) {
        assert.ok(r.frames.every((f) => Math.abs(f.bars[key].len - first.bars[key].len) < 0.01), `${to}: ${key} keeps its length`);
      }
      const [a, b] = [first.bars.Costs.center, r.end.bars.Costs.center];
      assert.ok(Math.abs(b - a) > 1, `${to}: Costs changes band`);
      assert.ok(r.frames.some((f) => between(f.bars.Costs.center, a, b)), `${to}: Costs is seen part-way to its new band`);
      const [l0, l1] = [first.bars[mover].len, r.end.bars[mover].len];
      assert.ok(r.frames.some((f) => f.bars[mover].visible === "true" && between(f.bars[mover].len, l0, l1)), `${to}: ${mover} is seen part-way`);
      expectAddsUp(r.end, `${to} at rest`);
      assert.equal(await elementHtml(page, "bars"), await htmlAfterJump(ctx, page, pages, "waterfall", to, "bars"));
    }
    await errorsClean(page, ctx);
  });
});

test("mode switch bars ↔ waterfall morphs and equals the jump", async () => {
  await withPage({ root, url: pages.url("mode-switch", "step=bars&motion=full") }, async (page, ctx) => {
    const first = await readFlow(page);
    const r = await sampleFrames(page, "mode-switch", "waterfall", "bars", flow);
    const end = r.end;
    assert.equal(end.mode, "waterfall");
    // Each bar after the first rises from zero to float on the running total before it: its start moves part-way.
    for (const key of ["Growth", "Prices", "Costs"]) {
      const [a, b] = [first.bars[key].start, end.bars[key].start];
      assert.ok(Math.abs(b - a) > 1, `${key} floats (${a} -> ${b})`);
      assert.ok(r.frames.some((f) => between(f.bars[key].start, a, b)), `${key}'s start is seen part-way`);
    }
    // The whisker comes along: at rest it brackets the bar's end in both modes.
    const whisker = (key) => page.evaluate((key) => {
      const g = document.querySelector(`[data-el="bars"] g.sd-bar-group[data-key="${key}"]`);
      const line = g.querySelector("line.sd-whisker-line");
      return [Number(line.getAttribute("x1")), Number(line.getAttribute("x2"))].sort((a, b) => a - b);
    }, key);
    const [lo, hi] = await whisker("Growth");
    assert.ok(lo < end.bars.Growth.end && end.bars.Growth.end < hi, "the whisker brackets the floating bar's end");
    assert.equal(await elementHtml(page, "bars"), await htmlAfterJump(ctx, page, pages, "mode-switch", "waterfall", "bars"));

    // And back: the bars sink to zero again, and the markup is the same as on the first step.
    await ctx.open(pages.url("mode-switch", "step=waterfall&motion=full"));
    const back = await sampleFrames(page, "mode-switch", "again", "bars", flow);
    const [a, b] = [end.bars.Costs.start, back.end.bars.Costs.start];
    assert.ok(back.frames.some((f) => between(f.bars.Costs.start, a, b)), "Costs sinks part-way");
    const played = await elementHtml(page, "bars");
    assert.equal(played, await htmlAfterJump(ctx, page, pages, "mode-switch", "again", "bars"));
    assert.equal(played, await htmlAfterJump(ctx, page, pages, "mode-switch", "bars", "bars"), "plain bars again, as on the first step");
    await errorsClean(page, ctx);
  });
});

for (const [slide, steps] of Object.entries(WATERFALL_STEPS)) {
  test(`waterfall: ${slide}: played, jumped and backward end the same`, async () => {
    await withPage({ root, url: pages.url(slide, `step=${steps[0]}`) }, async (page, ctx) => {
      await expectJumpEqualsPlayed(ctx, page, { pages, slide, steps, id: "bars" });
      await expectBackwardEqualsJump(ctx, page, { pages, slide, steps, id: "bars" });
    });
  });
}
for (const [slide, from, via, to] of WATERFALL_INTERRUPTS) {
  test(`waterfall: ${slide}: '${from}' -> '${via}' interrupted by '${to}' ends as a jump`, async () => {
    await withPage({ root, url: pages.url(slide, `step=${from}`) }, async (page, ctx) => {
      await expectInterruptEqualsJump(ctx, page, { pages, slide, from, via, to, id: "bars" });
    });
  });
}

test("a category named like the total bar is an element error", async () => {
  await withPage({ root, url: broken.url("waterfall-reserved", "") }, async (page, ctx) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.deepEqual(errors, ["waterfall-reserved/bars: category '__total' in data/reserved.csv is the name the total bar uses: rename it"]);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-el="src"]')).visibility), "visible");
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("waterfall error shows on the slide", async () => {
  await withPage({ root, url: broken.url("waterfall-empty", "") }, async (page, ctx) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.deepEqual(errors, ["waterfall-empty/bars: waterfall needs a value for every category: 'Growth' is empty"]);
    assert.match(await page.evaluate(() => document.querySelector('[data-el="bars"] .sd-error')?.textContent) ?? "", /'Growth' is empty/);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-el="src"]')).visibility), "visible");
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});
