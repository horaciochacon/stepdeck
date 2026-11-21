// chart.bar's pure mode maths (components/chart.bar/modes.js): the waterfall's running totals over the bars on screen,
// its empty-value error, and the value domain over every waterfall step of a slide; the back-to-back pairs of group
// rows, their errors, their order by the sum of the two sides, and their domain over every back-to-back step. No DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { waterfall, waterfallDomain, waterfallSpan, waterfallSteps, backToBack, backToBackOrder, backToBackSpan } from "#engine/components/chart.bar/modes.js";

const ROWS = [
  { item: "Opening", change: 40, later: 40, low: 38, high: 42 },
  { item: "Growth", change: 12, later: 9, low: 10, high: 14 },
  { item: "Costs", change: -15, later: -12, low: -18, high: -11 },
  { item: "Other", change: 3, later: 2, low: 1, high: 5 },
];
const base = { data: "data/flow.csv", x: "item", y: "change", mode: "waterfall" };

test("waterfall: running totals over shown bars only", () => {
  const bars = [{ key: "a", value: 5, shown: true }, { key: "b", value: -2, shown: false }, { key: "c", value: 3, shown: true }];
  assert.deepEqual(waterfall(bars, { total: true }), {
    bars: [
      { key: "a", start: 0, end: 5, shown: true },
      { key: "b", start: 5, end: 5, shown: false },
      { key: "c", start: 5, end: 8, shown: true },
    ],
    total: { start: 0, end: 8 },
  });
  assert.equal(waterfall(bars, {}).total, null, "no total without `total`");
  assert.equal(waterfall(bars, { total: "Net" }).total.end, 8, "a label is a total too");
  assert.equal(waterfall(bars).total, null, "options are optional");
  assert.deepEqual(waterfall([], { total: true }), { bars: [], total: { start: 0, end: 0 } });
});

test("waterfall: a hidden bar sits at the running total of its slot, wherever it is", () => {
  const { bars } = waterfall([{ key: "a", value: -4, shown: false }, { key: "b", value: 6, shown: true }, { key: "c", value: 2, shown: false }]);
  assert.deepEqual(bars.map((b) => [b.key, b.start, b.end]), [["a", 0, 0], ["b", 0, 6], ["c", 6, 6]]);
});

test("waterfall: an earlier category appearing shifts later bases", () => {
  const before = waterfall([{ key: "a", value: 10, shown: true }, { key: "b", value: 4, shown: false }, { key: "c", value: -3, shown: true }, { key: "d", value: 2, shown: true }], { total: true });
  const after = waterfall([{ key: "a", value: 10, shown: true }, { key: "b", value: 4, shown: true }, { key: "c", value: -3, shown: true }, { key: "d", value: 2, shown: true }], { total: true });
  const at = (w, key) => w.bars.find((b) => b.key === key);
  assert.deepEqual([at(before, "b").start, at(before, "b").end], [10, 10], "hidden: no length, at the running total");
  assert.deepEqual([at(after, "b").start, at(after, "b").end], [10, 14], "shown: it grows from the running total before it");
  assert.deepEqual([at(before, "c").start, at(after, "c").start], [10, 14], "the later bases move up by its value");
  assert.deepEqual([at(before, "d").start, at(after, "d").start], [7, 11]);
  assert.deepEqual([before.total.end, after.total.end], [9, 13], "the total follows what is on screen");
  assert.deepEqual([at(after, "a").start, at(after, "a").end], [0, 10], "earlier bars do not move");
});

test("waterfall empty value errors", () => {
  for (const value of [null, undefined, Number.NaN, Infinity, ""]) {
    assert.throws(
      () => waterfall([{ key: "a", value: 1, shown: true }, { key: "Taxes", value, shown: true }]),
      { message: "waterfall needs a value for every category: 'Taxes' is empty" },
      `value ${String(value)}`,
    );
  }
  assert.throws(() => waterfall([{ key: "Hidden", value: null, shown: false }]), { message: "waterfall needs a value for every category: 'Hidden' is empty" }, "a hidden category needs one too");
});

test("waterfallDomain covers every step and includes zero", () => {
  const one = waterfall([{ key: "a", value: 5, shown: true }, { key: "b", value: 7, shown: true }], { total: true });
  const two = waterfall([{ key: "b", value: 7, shown: true }, { key: "a", value: -15, shown: true }]);
  assert.deepEqual(waterfallDomain([one]), [0, 12]);
  assert.deepEqual(waterfallDomain([one, two]), [-8, 12], "a running total below zero in another step");
  assert.deepEqual(waterfallDomain([one, null, two]), [-8, 12], "null steps are skipped");
  const high = waterfall([{ key: "a", value: 20, shown: false }, { key: "b", value: 5, shown: true }]);
  assert.deepEqual(waterfallDomain([high]), [0, 5], "zero is in, and a hidden bar adds nothing");
  assert.deepEqual(waterfallDomain([waterfall([{ key: "a", value: -3, shown: true }])]), [-3, 0]);
  assert.deepEqual(waterfallDomain([]), [0, 1], "no values: [0, 1]");
});

test("waterfallSpan: every waterfall step of the slide, in its own order and with its own bars shown", () => {
  const props = { ...base, shown: ["Opening", "Costs"] };
  assert.deepEqual(waterfallSpan(ROWS, props, null), [0, 40], "no stepProps: the current props only (40, then 25)");
  const steps = [
    props,
    { ...base }, // every bar: 40, 52, 37, 40
    { ...base, y: "later", sort: "value" }, // lowest first: Costs 0..-12, Other ..-10, Growth ..-1, Opening ..39
    { ...base, mode: "bars", y: "low" }, // a step in bars mode does not count
    { ...base, data: "data/other.csv", y: "high" }, // nor one that reads another file
    null, // nor a step that does not fold
  ];
  assert.deepEqual(waterfallSpan(ROWS, props, steps), [-12, 52]);
});

test("waterfallSpan: a total and whiskers widen it; a step that fails is skipped, the current one throws", () => {
  const withInterval = { ...base, interval: { lower: "low", upper: "high" } };
  // Opening 0..40 with a whisker 38..42; Growth 40..52, whisker 40+10..40+14; Costs 52..37, whisker 52-18..52-11.
  assert.deepEqual(waterfallSpan(ROWS, withInterval, null), [0, 54]);
  const hidden = { ...withInterval, shown: ["Opening"] };
  assert.deepEqual(waterfallSpan(ROWS, hidden, null), [0, 42], "a hidden bar's whisker is not drawn, so it does not count");
  const negative = [{ item: "a", v: -5 }, { item: "b", v: -3 }];
  assert.deepEqual(waterfallSpan(negative, { data: "d.csv", x: "item", y: "v", mode: "waterfall", total: true }, null), [-8, 0]);

  const gap = [...ROWS, { item: "Taxes", change: "", later: -4 }];
  const ok = { ...base, y: "later" };
  // `later` has a value for Taxes: 0..40, ..49, ..37, ..39, ..35.
  assert.deepEqual(waterfallSpan(gap, ok, [ok, { ...base }]), [0, 49], "a later step with an empty value is skipped (its own update errors)");
  assert.deepEqual(waterfallSpan(gap, ok, [ok, { ...base, sort: { by: "pace" } }]), [0, 49], "so is a step whose sort fails");
  assert.throws(() => waterfallSpan(gap, { ...base }, null), { message: "waterfall needs a value for every category: 'Taxes' is empty" });
});

test("waterfallSteps: the slide's waterfalls; a current step in plain bars is left out and never throws", () => {
  const gap = [...ROWS, { item: "Taxes", change: "", later: -4 }];
  const bars = { ...base, mode: "bars" };
  const later = { ...base, y: "later", total: true };
  const steps = waterfallSteps(gap, bars, [bars, later, { ...base }]);
  assert.equal(steps.length, 1, "the plain step is left out, the empty-value step skipped");
  assert.deepEqual(steps[0].total, { start: 0, end: 35 });
  assert.deepEqual(steps[0].whiskers, [], "no interval, no whiskers");
  assert.deepEqual(waterfallSpan(gap, bars, [bars, later]), [0, 49], "the span of a plain step is its slide's waterfalls");
  assert.deepEqual(waterfallSpan(gap, bars, [bars]), [0, 1], "none: [0, 1]");
  assert.throws(() => waterfallSteps(gap, { ...base }, null), { message: "waterfall needs a value for every category: 'Taxes' is empty" });
});

// --- Back-to-back ----------------------------------------------------------------------------------------------------

// Long data: one row per category and group. Men come first in the 15-29 rows, so the left group is the first one the
// data names (Women), not the first row of each category; 30+ has no interval for Women and no value for Men.
const PYRAMID = [
  { age: "0-14", sex: "Women", share: 8, low: 7, high: 9, later: 7 },
  { age: "0-14", sex: "Men", share: 8.5, low: 7.5, high: 9.5, later: 7.2 },
  { age: "15-29", sex: "Men", share: 10, low: 9, high: 11, later: 9 },
  { age: "15-29", sex: "Women", share: 9.5, low: 8.6, high: 10.4, later: 9.1 },
  { age: "", sex: "Women", share: 99, low: 98, high: 100, later: 99 }, // no category: skipped
  { age: "30+", sex: "Women", share: 30, low: "", high: "", later: 33 },
  { age: "30+", sex: "", share: 50, low: 49, high: 51, later: 50 }, // no group: skipped
  { age: "30+", sex: "Men", share: "", low: 27, high: 29, later: 31 },
];
const pyramid = { data: "data/pyramid.csv", x: "age", y: "share", mode: "back-to-back", group: "sex", interval: { lower: "low", upper: "high" } };
const side = (value, lo = null, hi = null) => ({ value, lo, hi });

test("backToBack: pairs each category's two group rows", () => {
  assert.deepEqual(backToBack(PYRAMID, pyramid), {
    categories: [
      { key: "0-14", left: side(8, 7, 9), right: side(8.5, 7.5, 9.5) },
      { key: "15-29", left: side(9.5, 8.6, 10.4), right: side(10, 9, 11) },
      // An empty bound draws no whisker; a side with no value has no interval either (nothing is drawn at zero).
      { key: "30+", left: side(30), right: side(null) },
    ],
    groups: ["Women", "Men"],
  });
  const swapped = backToBack(PYRAMID, { ...pyramid, groups: ["Men", "Women"] });
  assert.deepEqual(swapped.groups, ["Men", "Women"], "`groups` orders the sides");
  assert.deepEqual(swapped.categories[0], { key: "0-14", left: side(8.5, 7.5, 9.5), right: side(8, 7, 9) });
  const plain = backToBack(PYRAMID, { ...pyramid, y: "later", interval: undefined });
  assert.deepEqual(plain.categories.map((c) => [c.key, c.left, c.right]), [
    ["0-14", side(7), side(7.2)], ["15-29", side(9.1), side(9)], ["30+", side(33), side(31)],
  ], "no interval: no whiskers");
  const numeric = [{ year: 2000, g: 1, v: 3 }, { year: 2000, g: 2, v: 4 }];
  assert.deepEqual(backToBack(numeric, { x: "year", y: "v", group: "g" }), {
    categories: [{ key: "2000", left: side(3), right: side(4) }], groups: ["1", "2"],
  }, "numbers name categories and groups as text");
  assert.deepEqual(backToBack(PYRAMID, { ...pyramid, highlight: "Men" }).groups, ["Women", "Men"], "a group may be highlighted");
  assert.deepEqual(backToBack(PYRAMID, { ...pyramid, highlight: "15-29" }).groups, ["Women", "Men"], "and so may a category");
});

test("backToBack errors", () => {
  assert.throws(() => backToBack([...PYRAMID, { age: "0-14", sex: "Other", share: 1 }], pyramid),
    { message: "`group` column 'sex' has 3 values (back-to-back needs exactly two)" });
  assert.throws(() => backToBack(PYRAMID.filter((r) => r.sex === "Women"), pyramid),
    { message: "`group` column 'sex' has 1 values (back-to-back needs exactly two)" });
  assert.throws(() => backToBack(PYRAMID.filter((r) => !(r.age === "15-29" && r.sex === "Men")), pyramid),
    { message: "category '15-29' has no 'Men' row" });
  assert.throws(() => backToBack(PYRAMID, { ...pyramid, groups: ["Women", "Male"] }),
    { message: "category '0-14' has no 'Male' row" }, "a name in `groups` the data does not have");
  const both = [...PYRAMID, { age: "Men", sex: "Women", share: 1 }, { age: "Men", sex: "Men", share: 2 }];
  assert.throws(() => backToBack(both, { ...pyramid, highlight: "Men" }),
    { message: "'Men' in `highlight` is both a category and a group" });
});

test("backToBack errors: a repeated row, `groups` twice the same, an unknown highlight, a negative value", () => {
  assert.throws(() => backToBack([...PYRAMID, { age: "0-14", sex: "Women", share: 2 }], pyramid),
    { message: "category '0-14' has more than one 'Women' row" });
  assert.throws(() => backToBack(PYRAMID, { ...pyramid, groups: ["Men", "Men"] }),
    { message: "`groups` must be two different values of the `group` column 'sex' (values: Women, Men)" });
  assert.throws(() => backToBack(PYRAMID, { ...pyramid, highlight: "Nobody" }),
    { message: "category or group 'Nobody' in `highlight` not found in data/pyramid.csv (categories: 0-14, 15-29, 30+; groups: Women, Men)" });
  const negative = PYRAMID.map((r) => (r.age === "15-29" && r.sex === "Men" ? { ...r, low: -1 } : r));
  assert.throws(() => backToBack(negative, pyramid),
    { message: "category '15-29' has -1 in 'low' for 'Men' (back-to-back needs values of zero or more)" });
  assert.doesNotThrow(() => backToBack(negative, { ...pyramid, interval: undefined }), "a column that is not drawn is not checked");
  const hidden = PYRAMID.map((r) => (r.age === "30+" && r.sex === "Men" ? { ...r, low: -5 } : r));
  assert.doesNotThrow(() => backToBack(hidden, pyramid), "nor are the bounds of a side with no value");
});

test("backToBackOrder: sort ranks by the sum of the two sides", () => {
  // Sums of `share`: 0-14 16.5, 15-29 19.5, 30+ none (Men has no value): a missing side leaves no sum, which ranks last.
  assert.deepEqual(backToBackOrder(PYRAMID, pyramid), ["0-14", "15-29", "30+"], "no sort: the data order");
  assert.deepEqual(backToBackOrder(PYRAMID, { ...pyramid, sort: "-value" }), ["15-29", "0-14", "30+"]);
  assert.deepEqual(backToBackOrder(PYRAMID, { ...pyramid, sort: "value" }), ["0-14", "15-29", "30+"]);
  // `later` sums to 14.2, 18.1 and 64.
  assert.deepEqual(backToBackOrder(PYRAMID, { ...pyramid, sort: { by: "later", order: "desc" } }), ["30+", "15-29", "0-14"], "{ by } sums that column");
  assert.deepEqual(backToBackOrder(PYRAMID, { ...pyramid, sort: { by: "age", order: "desc" } }), ["30+", "15-29", "0-14"], "the category text sorts as text");
  assert.deepEqual(backToBackOrder(PYRAMID, { ...pyramid, sort: ["30+"] }), ["30+", "0-14", "15-29"], "a list of categories");
  assert.throws(() => backToBackOrder(PYRAMID, { ...pyramid, sort: { by: "pace" } }),
    { message: "sort column 'pace' not found (columns: age, sex, share, low, high, later)" });
  assert.throws(() => backToBackOrder(PYRAMID, { ...pyramid, sort: ["Men"] }),
    { message: "category 'Men' in `sort` not found (categories: 0-14, 15-29, 30+)" });
});

test("backToBackSpan: [0, max] of every value and drawn interval over every back-to-back step of the slide", () => {
  // The 30+ Men bounds (27..29) have no value to bracket, so they draw nothing and do not count.
  assert.deepEqual(backToBackSpan(PYRAMID, pyramid, null), [0, 30], "no stepProps: the current props only");
  const steps = [
    pyramid,
    { ...pyramid, y: "later", interval: undefined }, // up to 33
    { ...pyramid, mode: "bars", y: "low" }, // not back-to-back: does not count
    { ...pyramid, data: "data/other.csv", y: "later" }, // another file: does not count
    null, // a step that does not fold
  ];
  assert.deepEqual(backToBackSpan(PYRAMID, pyramid, steps), [0, 33]);
  assert.deepEqual(backToBackSpan(PYRAMID, { ...pyramid, mode: "bars" }, [steps[1]]), [0, 33], "a plain step's span is its slide's back-to-back steps");
  assert.deepEqual(backToBackSpan([], pyramid, null), [0, 1], "no values: [0, 1]");
});

test("modes.js has no DOM and imports only the pure layout module", async () => {
  const source = await readFile(new URL("../../engine/components/chart.bar/modes.js", import.meta.url), "utf8");
  const imports = [...source.matchAll(/^\s*import\s.*from\s+"([^"]+)"/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ["../../core/chart-layout.js"]);
  assert.doesNotMatch(source, /document|window|querySelector/);
});
