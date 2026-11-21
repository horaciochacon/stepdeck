// chart.points' pure model (components/chart.points/model.js): one row per category with its value, interval,
// label and value text, the fixed value domain over every step, the "no data" rows and the errors it throws.
import { test } from "node:test";
import assert from "node:assert/strict";
import { d3 } from "#engine/core/d3.js";
import { pointsModel } from "#engine/components/chart.points/model.js";

const format = (spec) => d3.format(spec);
const t = (key) => ({ noData: "no data" })[key] ?? key;
const env = (extra = {}) => ({ font: 28, charW: 16.8, w: 1200, h: 700, format, t, ...extra });

const ROWS = [
  { region: "North", rate: 12.4, low: 9.8, high: 15.1, later: 10.2, lo2: 8.1, hi2: 12.6 },
  { region: "South", rate: 8.6, low: 6.9, high: 10.4, later: 7.9, lo2: 6.2, hi2: 9.7 },
  { region: "East", rate: 15.2, low: 12.1, high: 18.4, later: 30.5, lo2: 26.0, hi2: 34.0 },
];
const BASE = { data: "data/estimates.csv", x: "region", y: "rate", interval: { lower: "low", upper: "high" } };

test("pointsModel: one row per category, labels and value texts", () => {
  const m = pointsModel(ROWS, { ...BASE, format: { y: ",.1f" } }, env());
  assert.deepEqual(m.rows.map((r) => r.key), ["North", "South", "East"]);
  assert.deepEqual(m.rows.map((r) => r.label), ["North", "South", "East"]);
  assert.deepEqual(m.rows.map((r) => r.slot), [0, 1, 2], "data order");
  assert.deepEqual(m.rows.map((r) => r.text), ["12.4", "8.6", "15.2"]);
  assert.deepEqual(m.rows[0].lines, ["North"]);
  const north = m.rows[0];
  assert.equal(north.value, 12.4);
  assert.equal(north.lo, 9.8);
  assert.equal(north.hi, 15.1);
  assert.equal(north.missing, false);
  assert.equal(north.title, "North: 12.4 (9.8 – 15.1)");
  assert.ok(m.rows.every((r) => r.shown && !r.dim), "every row shown, none dimmed, by default");
  assert.ok(m.pw > 0 && m.ph > 0 && m.margin.left > 0);
  assert.equal(m.margin.left + m.pw + m.margin.right, 1200);
  assert.equal(m.margin.top + m.ph + m.margin.bottom, 700);
  assert.ok(m.ticks.length >= 3 && m.ticks.every((k) => typeof k.label === "string"));

  const some = pointsModel(ROWS, { ...BASE, shown: ["South"], highlight: "North" }, env());
  assert.deepEqual(some.rows.map((r) => r.shown), [false, true, false]);
  assert.deepEqual(some.rows.map((r) => r.dim), [false, true, true]);

  // Without format.y the value text is the value as precise as the data; a numeric category takes format.x.
  const years = pointsModel([{ year: 2020, v: 1.25 }, { year: 2021, v: 2 }], { data: "d.csv", x: "year", y: "v", format: { x: "d" } }, env());
  assert.deepEqual(years.rows.map((r) => [r.key, r.label, r.text]), [["2020", "2020", "1.25"], ["2021", "2021", "2"]]);
  assert.equal(years.rows[0].title, "2020: 1.25");
  // Rows with an empty category are skipped.
  assert.deepEqual(pointsModel([...ROWS, { region: "", rate: 3 }], BASE, env()).rows.length, 3);
});

test("pointsModel: the domain covers every step's y and intervals", () => {
  const steps = [BASE, { ...BASE, y: "later", interval: { lower: "lo2", upper: "hi2" } }];
  const first = pointsModel(ROWS, steps[0], env({ stepProps: steps }));
  const second = pointsModel(ROWS, steps[1], env({ stepProps: steps }));
  assert.ok(first.domain[0] <= 6.2 && first.domain[1] >= 34, `covers both steps: ${first.domain}`);
  assert.deepEqual(first.domain, second.domain, "the same axis at both steps");
  assert.deepEqual(first.ticks, second.ticks);
  assert.deepEqual([first.margin, first.pw, first.ph], [second.margin, second.pw, second.ph], "and the same plot");
  // Zero is not forced, and the domain is rounded outward to ticks.
  assert.ok(first.domain[0] > 0, `zero is not forced: ${first.domain}`);
  assert.deepEqual(first.domain, d3.scaleLinear().domain([6.2, 34]).nice(5).domain());

  // Null entries are skipped; so is a step that reads another file (its columns name nothing in these rows).
  const other = { ...BASE, data: "data/other.csv", y: "later" };
  const skip = pointsModel(ROWS, BASE, env({ stepProps: [null, BASE, other] }));
  assert.deepEqual(skip.domain, d3.scaleLinear().domain([6.9, 18.4]).nice(5).domain());
  // Without stepProps (a child mounted with ctx.mount), only the current props count.
  assert.deepEqual(pointsModel(ROWS, BASE, env({ stepProps: null })).domain, skip.domain);

  // A given domain is used exactly as given.
  const given = pointsModel(ROWS, { ...BASE, domain: [0, 40] }, env({ stepProps: steps }));
  assert.deepEqual(given.domain, [0, 40]);
});

test("pointsModel: the plot keeps its size when a step sets a wider domain", () => {
  const steps = [{ ...BASE, format: { y: ",.1f" } }, { ...BASE, format: { y: ",.1f" }, domain: [0, 120] }];
  const narrow = pointsModel(ROWS, steps[0], env({ stepProps: steps }));
  const wide = pointsModel(ROWS, steps[1], env({ stepProps: steps }));
  assert.notDeepEqual(narrow.domain, wide.domain);
  assert.ok(wide.ticks.some((k) => k.label === "120.0"), "the wide axis has longer tick labels");
  assert.deepEqual([narrow.margin, narrow.pw, narrow.ph], [wide.margin, wide.pw, wide.ph], "room for every step's tick labels");
});

test("estimate with empty value shows no data", () => {
  const rows = [...ROWS, { region: "West", rate: null, low: 4.2, high: 8.3 }, { region: "Centre", rate: "", low: null, high: null }];
  const m = pointsModel(rows, BASE, env());
  for (const key of ["West", "Centre"]) {
    const row = m.rows.find((r) => r.key === key);
    assert.equal(row.missing, true, key);
    assert.equal(row.value, null, `${key}: no value, never zero`);
    assert.equal(row.lo, null);
    assert.equal(row.hi, null);
    assert.equal(row.text, "");
    assert.equal(row.title, `${key}: no data`);
    assert.equal(row.shown, true, "still listed: its label shows");
  }
  assert.equal(m.noData, "no data");
  assert.equal(pointsModel(rows, BASE, env({ t: (k) => (k === "noData" ? "sin datos" : k) })).noData, "sin datos");
  // A missing value does not reach the domain as zero.
  const far = pointsModel([{ region: "A", rate: 50, low: 48, high: 52 }, { region: "B", rate: null, low: null, high: null }], BASE, env());
  assert.ok(far.domain[0] > 40, `${far.domain}`);
  // A row with a value but a missing bound has no interval.
  const half = pointsModel([{ region: "A", rate: 5, low: null, high: 7 }, { region: "B", rate: 6, low: 5, high: 8 }], BASE, env());
  assert.deepEqual([half.rows[0].lo, half.rows[0].hi], [null, null]);
  assert.equal(half.rows[0].missing, false);
});

test("pointsModel: errors", () => {
  assert.throws(
    () => pointsModel([...ROWS, { region: "South", rate: 1 }], BASE, env()),
    { message: "category 'South' appears more than once in data/estimates.csv (chart.points needs one row per category, or `id` for strips)" },
  );
  assert.throws(
    () => pointsModel(ROWS, { ...BASE, shown: ["North", "Nowhere"] }, env()),
    { message: "category 'Nowhere' in `shown` not found in data/estimates.csv (categories: North, South, East)" },
  );
  assert.throws(
    () => pointsModel(ROWS, { ...BASE, highlight: "Nope" }, env()),
    { message: "category 'Nope' in `highlight` not found in data/estimates.csv (categories: North, South, East)" },
  );
  assert.throws(
    () => pointsModel(ROWS, { ...BASE, domain: [0, 14] }, env()),
    { message: "estimate 'East' (15.2) is outside `domain` [0, 14]" },
  );
  assert.throws(() => pointsModel(ROWS, { ...BASE, domain: [5, 5] }, env()), { message: "`domain` must be [min, max] with min < max" });
  // An interval bound past a given domain is not an error (the whisker is cut at the axis end).
  assert.doesNotThrow(() => pointsModel(ROWS, { ...BASE, domain: [8, 16] }, env()));
  assert.doesNotThrow(() => pointsModel(ROWS, { ...BASE, shown: ["North"], highlight: "South" }, env()));
});

test("pointsModel: reference widens the domain", () => {
  const plain = pointsModel(ROWS, BASE, env());
  const ref = pointsModel(ROWS, { ...BASE, reference: 25 }, env());
  assert.ok(ref.domain[1] >= 25 && plain.domain[1] < 25, `${plain.domain} -> ${ref.domain}`);
  assert.deepEqual(ref.reference, { key: "25|", value: 25, label: "" });
  assert.equal(ref.origin, 25, "rows grow out from the reference");

  // A reference at any step counts, so the axis is the same before and after it appears.
  const steps = [BASE, { ...BASE, reference: { value: 2, label: "Target" } }];
  const before = pointsModel(ROWS, steps[0], env({ stepProps: steps }));
  const after = pointsModel(ROWS, steps[1], env({ stepProps: steps }));
  assert.ok(before.domain[0] <= 2, `${before.domain}`);
  assert.deepEqual(before.domain, after.domain);
  assert.equal(before.reference, null);
  assert.deepEqual(after.reference, { key: "2|Target", value: 2, label: "Target" });
  assert.deepEqual([before.margin, before.pw, before.ph], [after.margin, after.pw, after.ph], "room for its label at every step");

  // The origin: the reference inside the domain, else 0 inside the domain, else the domain's start.
  assert.equal(before.origin, 0);
  assert.equal(pointsModel(ROWS, { ...BASE, domain: [5, 20] }, env()).origin, 5);
  const past = pointsModel(ROWS, { ...BASE, domain: [5, 20], reference: 30 }, env());
  assert.equal(past.origin, 5);
  assert.equal(past.reference, null, "a reference past a given domain is not drawn");
  assert.equal(pointsModel(ROWS, { ...BASE, domain: [-5, 20], reference: 30 }, env()).origin, -5);
});
