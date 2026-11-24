// components/chart.line/fan.js: the draw fan's pure parts (opacity, width tiers, the model of a draws file, its limits).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fanAlpha, fanWidth, fanModel, loadDraws, FAN_MAX_DRAWS, FAN_MAX_X } from "#engine/components/chart.line/fan.js";

const cols = { x: "year", y: "rate", series: "series" };
const props = (shown, extra = {}) => ({ data: "data/trend.csv", x: "year", y: "rate", series: "series", draws: { data: "data/draws.csv", id: "draw", shown, ...extra } });
const row = (year, series, rate, draw) => ({ year, series, rate, draw });

test("fanAlpha: 1 -> 0.85, 100 -> 0.19, 10000 -> 0.06", () => {
  assert.equal(fanAlpha(1), 0.85, "one draw takes the cap");
  assert.ok(Math.abs(fanAlpha(100) - 0.19) < 1e-12, `100 draws: ${fanAlpha(100)}`);
  assert.equal(fanAlpha(10000), 0.06, "many draws take the floor");
  assert.ok(Math.abs(fanAlpha(20) - 1.9 / Math.sqrt(20)) < 1e-12, "in between: 1.9 / sqrt(n)");
  for (let n = 1; n < 3000; n += 7) assert.ok(fanAlpha(n + 7) <= fanAlpha(n), "never rises with n");
});

test("fanWidth: three tiers, fixed multiples of the line's width, decreasing", () => {
  const [a, b, c] = [fanWidth(1, 5), fanWidth(200, 5), fanWidth(201, 5)];
  assert.equal(fanWidth(20, 5), a, "n <= 20 is one tier");
  assert.equal(fanWidth(21, 5), b, "n <= 200 is the next");
  assert.equal(fanWidth(2000, 5), c, "more is the last");
  assert.ok(a > b && b > c && c > 0, `decreasing: ${a}, ${b}, ${c}`);
  assert.ok(a < 5, "a draw is thinner than the summary line");
  assert.equal(fanWidth(20, 10), 2 * a, "a multiple of the line's width");
});

test("fanModel: groups by series and id, sorted by x", () => {
  const rows = [
    row(2010, "north", 3, 1), row(2000, "north", 1, 1), row(2005, "north", 2, 1),
    row(2005, "south", 5, 2), row(2000, "south", 4, 2),
    row(2000, "north", 6, 2), row(2010, "north", 8, 2), row(2005, "north", 7, 2),
    row(2000, "south", 9, 1),
  ];
  const m = fanModel(rows, props(2), cols);
  assert.deepEqual(m.ids, ["1", "2"], "ids in first appearance, as strings");
  assert.equal(m.count, 2);
  assert.deepEqual([...m.bySeries.keys()], ["north", "south"]);
  assert.deepEqual(m.bySeries.get("north").get("1"), [[2000, 1], [2005, 2], [2010, 3]]);
  assert.deepEqual(m.bySeries.get("north").get("2"), [[2000, 6], [2005, 7], [2010, 8]]);
  assert.deepEqual(m.bySeries.get("south").get("2"), [[2000, 4], [2005, 5]]);
  assert.deepEqual(m.bySeries.get("south").get("1"), [[2000, 9]]);
  // Numeric strings (an undeclared column) are numbers; an id column of numbers is stringified.
  const text = fanModel([{ year: "2000", series: "a", rate: "1.5", draw: 3 }, { year: "2005", series: "a", rate: "2", draw: 3 }], props(1), cols);
  assert.deepEqual(text.bySeries.get("a").get("3"), [[2000, 1.5], [2005, 2]]);
});

test("fanModel without series: one key, 'all'", () => {
  const m = fanModel([row(1, null, 1, "a"), row(0, null, 2, "a"), row(0, null, 3, "b")], { x: "year", y: "rate", draws: { data: "d.csv", id: "draw", shown: 2 } }, { x: "year", y: "rate" });
  assert.deepEqual([...m.bySeries.keys()], ["all"]);
  assert.deepEqual(m.bySeries.get("all").get("a"), [[0, 2], [1, 1]]);
  assert.equal(m.count, 2);
});

test("draw with a gap: an empty y splits the line", () => {
  const rows = [row(2000, "a", 1, 1), row(2005, "a", "", 1), row(2010, "a", 3, 1), row(2015, "a", 4, 1), row(2020, "a", null, 1), row(2025, "a", "x", 1)];
  const line = fanModel(rows, props(1), cols).bySeries.get("a").get("1");
  assert.deepEqual(line.map((p) => p[0]), [2000, 2005, 2010, 2015, 2020, 2025], "the point stays, at its x");
  assert.deepEqual(line.map((p) => p[1]), [1, null, 3, 4, null, null], "a missing value is null, never zero");
  // A row with no x has no place on the line: it is left out.
  const noX = fanModel([row("", "a", 1, 1), row(2000, "a", 2, 1)], props(1), cols).bySeries.get("a").get("1");
  assert.deepEqual(noX, [[2000, 2]]);
});

test("draw with a blank-looking cell: missing, never zero", () => {
  const rows = [row(2000, "a", 1, 1), row(2005, "a", " ", 1), row(2010, "a", "\t3 ", 1), row(" ", "a", 5, 1), row(2015, "a", true, 1)];
  const line = fanModel(rows, props(1), cols).bySeries.get("a").get("1");
  assert.deepEqual(line, [[2000, 1], [2005, null], [2010, 3], [2015, null]], "a blank y breaks the line; a blank x has no place on it");
});

test("fanModel: errors over the limits and for shown beyond the draws", () => {
  const rows = [row(2000, "a", 1, 1), row(2000, "a", 2, 2), row(2000, "b", 3, 3)];
  assert.throws(() => fanModel(rows, props(4), cols), { message: "`draws.shown` is 4 but data/draws.csv has only 3 draws" });
  assert.doesNotThrow(() => fanModel(rows, props(3), cols));
  assert.doesNotThrow(() => fanModel(rows, props(0), cols));
  assert.equal(FAN_MAX_DRAWS, 2000);
  assert.equal(FAN_MAX_X, 500);
  const many = Array.from({ length: 2001 }, (_, i) => row(2000, "a", 1, i));
  assert.throws(() => fanModel(many, props(1), cols), { message: "data/draws.csv has 2001 draws (at most 2000)" });
  assert.doesNotThrow(() => fanModel(many.slice(1), props(1), cols), "2000 draws is allowed");
  const wide = Array.from({ length: 501 }, (_, i) => row(i, i % 2 ? "b" : "a", 1, i % 3)).concat(Array.from({ length: 501 }, (_, i) => row(i, "c", 1, 1)));
  assert.throws(() => fanModel(wide, props(1), cols), { message: "data/draws.csv has 501 x values for series 'c' (at most 500)" });
  // The x values of a series are counted over all its draws, once each.
  const shared = Array.from({ length: 500 }, (_, i) => [row(i, "a", 1, 1), row(i, "a", 2, 2)]).flat();
  assert.doesNotThrow(() => fanModel(shared, props(2), cols));
  // The limits come first: a file over them fails on them, whatever `shown` is.
  assert.throws(() => fanModel(many, props(5000), cols), { message: /2001 draws \(at most 2000\)/ });
});

test("fan series with fewer draws", () => {
  const rows = [row(2000, "a", 1, 1), row(2005, "a", 2, 1), row(2000, "a", 1, 2), row(2000, "a", 1, 3), row(2000, "b", 5, 2), row(2005, "b", 6, 2)];
  const m = fanModel(rows, props(3), cols);
  assert.equal(m.count, 3, "the count is of every draw in the file");
  assert.equal(m.bySeries.get("a").size, 3);
  assert.equal(m.bySeries.get("b").size, 1, "b has what it has");
  assert.deepEqual([...m.bySeries.get("b").keys()], ["2"]);
});

test("loadDraws: the column checks of loadTable, on the draws file", async () => {
  const files = { "data/draws.csv": [row(2000, "a", 1, 1)] };
  const ctx = { data: async (path) => files[path] };
  assert.deepEqual(await loadDraws(props(1), ctx), files["data/draws.csv"]);
  await assert.rejects(loadDraws({ ...props(1), y: "alt" }, ctx), { message: "column 'alt' not found in data/draws.csv (columns: year, series, rate, draw)" });
  await assert.rejects(loadDraws({ ...props(1), draws: { data: "data/draws.csv", id: "sample", shown: 1 } }, ctx), { message: /column 'sample' not found in data\/draws\.csv/ });
  // Without series the draws file needs no series column.
  const plain = { "d.csv": [{ year: 2000, rate: 1, draw: 1 }] };
  assert.equal((await loadDraws({ x: "year", y: "rate", draws: { data: "d.csv", id: "draw", shown: 1 } }, { data: async (p) => plain[p] })).length, 1);
});

test("fanModel: a file's draws are read once per columns; `draws.shown` is checked on every call", () => {
  const rows = [row(2000, "north", 1, 1), row(2005, "north", 2, 1), row(2000, "north", 3, 2), row(2005, "north", 4, 2)];
  const first = fanModel(rows, props(1), cols);
  assert.equal(fanModel(rows, props(2), cols), first, "the same rows and columns: the kept model, whatever `shown`");
  assert.throws(() => fanModel(rows, props(3), cols), /`draws\.shown` is 3 but data\/draws\.csv has only 2 draws/);
  assert.equal(fanModel(rows, props(2), cols), first, "a failed `shown` does not drop it");
  const other = fanModel(rows, props(1), { ...cols, y: "year" });
  assert.notEqual(other, first, "another column is another model");
  assert.deepEqual(other.bySeries.get("north").get("1"), [[2000, 2000], [2005, 2005]]);
  assert.deepEqual(first.bySeries.get("north").get("1"), [[2000, 1], [2005, 2]], "and leaves the first as it was");
  const copy = rows.map((r) => ({ ...r }));
  assert.notEqual(fanModel(copy, props(1), cols), first, "other rows are read again");
  assert.deepEqual(fanModel(copy, props(1), cols), first, "to the same model");
});
