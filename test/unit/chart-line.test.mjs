// chart.line's pure parts (components/chart.line/parts.js): the y extent, the x ticks, the numeric-x check, the dots
// and the label spots. No DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { d3 } from "#engine/core/d3.js";
import { yExtent, xTickValues, checkX, dotData, labelSpots } from "#engine/components/chart.line/parts.js";

const niced = (ys) => d3.scaleLinear().domain(yExtent(ys)).nice(5).domain();

test("yExtent: includes zero, and all-negative data ends at zero (not at +1)", () => {
  assert.deepEqual(yExtent([-0.4, -0.35, -0.1]), [-0.4, 0]);
  assert.deepEqual(niced([-0.4, -0.35, -0.3, -0.22, -0.15, -0.1]), [-0.4, 0]);
  assert.deepEqual(yExtent([2, 5]), [0, 5], "positive data starts at zero, as before");
  assert.deepEqual(yExtent([-3, 5]), [-3, 5]);
  assert.deepEqual(yExtent([]), [0, 1], "no values: one unit");
  assert.deepEqual(yExtent([0, 0]), [0, 1], "all zero: one unit up");
});

test("xTickValues: integer x gets integer ticks only; fractional x keeps d3's", () => {
  assert.deepEqual(xTickValues([1, 3], [1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(xTickValues([2020, 2022], [2020, 2021, 2022]), [2020, 2021, 2022], "no half years to print twice under format 'd'");
  assert.deepEqual(xTickValues([2015, 2024], d3.range(2015, 2025)), [2016, 2018, 2020, 2022, 2024], "even steps as d3 gives them");
  assert.deepEqual(xTickValues([1, 3], [1, 2.5, 3]), [1, 1.5, 2, 2.5, 3], "a fractional x keeps the fractional ticks");
  assert.deepEqual(xTickValues([7, 8], [7]), [7, 8], "one x: the widened domain's ends");
  assert.deepEqual(xTickValues([0, 1], []), [0, 0.2, 0.4, 0.6, 0.8, 1], "no rows: unchanged");
});

test("checkX: a table whose x has no numbers is an error naming the column and the file", () => {
  const dates = [{ date: "2020-01-01", y: 2 }, { date: "2020-02-01", y: 4 }];
  assert.throws(() => checkX(dates, { data: "data/dates.csv", x: "date" }), /^Error: chart\.line needs a numeric `x`: column 'date' of data\/dates\.csv has no numbers/);
  assert.doesNotThrow(() => checkX([{ year: 2020, y: 1 }, { year: "", y: 2 }], { data: "d.csv", x: "year" }), "one number is enough: the other rows are left out");
  assert.doesNotThrow(() => checkX([{ year: "2020", y: 1 }], { data: "d.csv", x: "year" }), "a numeric string counts, as cellValue reads it");
  assert.doesNotThrow(() => checkX([], { data: "d.csv", x: "year" }), "no rows: nothing to check");
});

test("dotData: one dot per point up to the cut; labelSpots: one label per series", () => {
  const series = [{ name: "a", dimmed: false, paint: "red", points: [{ key: "a|1", px: 0, py: 10 }, { key: "a|2", px: 50, py: 20 }] }];
  assert.deepEqual(dotData({ showPoints: true, cut: null, series }).map((d) => d.key), ["a|1", "a|2"]);
  assert.deepEqual(dotData({ showPoints: true, cut: 10, series }).map((d) => d.key), ["a|1"]);
  assert.deepEqual(dotData({ showPoints: false, cut: null, series }), []);
  const spots = labelSpots([...series, { name: "b", points: [] }], { font: 28, pw: 100, ph: 200 });
  assert.equal(spots.get("a").y, 20);
  assert.deepEqual(spots.get("b"), { x: 100 + 28 * 0.4, y: 0 }, "a series with no points keeps its label at the top");
});
