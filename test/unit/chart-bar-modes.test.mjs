// chart.bar's pure mode maths (components/chart.bar/modes.js): the waterfall's running totals over the bars on screen,
// its empty-value error, and the value domain over every waterfall step of a slide. No DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { waterfall, waterfallDomain, waterfallSpan, waterfallSteps } from "#engine/components/chart.bar/modes.js";

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

test("modes.js has no DOM and imports only the pure layout module", async () => {
  const source = await readFile(new URL("../../engine/components/chart.bar/modes.js", import.meta.url), "utf8");
  const imports = [...source.matchAll(/^\s*import\s.*from\s+"([^"]+)"/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ["../../core/chart-layout.js"]);
  assert.doesNotMatch(source, /document|window|querySelector/);
});
