// chart.points' pure model (components/chart.points/model.js): one row per category with its value, interval,
// label and value text, the fixed value domain over every step, the "no data" rows and the errors it throws; pairs;
// and strips (with `id`): points per category, their summary, beeswarm offsets, overflow counts and the followed item.
import { test } from "node:test";
import assert from "node:assert/strict";
import { d3 } from "#engine/core/d3.js";
import { pointsModel, sizesOf } from "#engine/components/chart.points/model.js";

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

test("pointsModel: rows in sort order, hidden keep their slot", () => {
  // Data order is the default; "value" runs lowest first and "-value" highest first.
  assert.deepEqual(pointsModel(ROWS, BASE, env()).rows.map((r) => r.key), ["North", "South", "East"]);
  assert.deepEqual(pointsModel(ROWS, { ...BASE, sort: "none" }, env()).rows.map((r) => r.key), ["North", "South", "East"]);
  const asc = pointsModel(ROWS, { ...BASE, sort: "value" }, env());
  assert.deepEqual(asc.rows.map((r) => [r.key, r.slot]), [["South", 0], ["North", 1], ["East", 2]]);
  const desc = pointsModel(ROWS, { ...BASE, sort: "-value" }, env());
  assert.deepEqual(desc.rows.map((r) => [r.key, r.slot]), [["East", 0], ["North", 1], ["South", 2]]);

  // A hidden category keeps the slot it has in the sorted order: all are ranked, then some are hidden.
  const hidden = pointsModel(ROWS, { ...BASE, sort: "-value", shown: ["South"] }, env());
  assert.deepEqual(hidden.rows.map((r) => [r.key, r.slot, r.shown]), [["East", 0, false], ["North", 1, false], ["South", 2, true]]);

  // Missing values come last whichever way it runs, hidden or not, and a ranked-last row still has its slot.
  const more = [...ROWS, { region: "West", rate: null, low: null, high: null }];
  for (const sort of ["value", "-value"]) {
    const m = pointsModel(more, { ...BASE, sort, shown: ["North", "South", "East"] }, env());
    assert.equal(m.rows.at(-1).key, "West", sort);
    assert.deepEqual([m.rows.at(-1).slot, m.rows.at(-1).missing, m.rows.at(-1).shown], [3, true, false]);
  }

  // Sorting changes the order only: the domain, ticks and plot are the same, and so is each row's data.
  const plain = pointsModel(ROWS, BASE, env());
  assert.deepEqual([desc.domain, desc.ticks, desc.margin, desc.pw, desc.ph], [plain.domain, plain.ticks, plain.margin, plain.pw, plain.ph]);
  assert.deepEqual(desc.rows.find((r) => r.key === "North"), { ...plain.rows.find((r) => r.key === "North"), slot: 1 });
});

test("pointsModel: sort by a column and by a list", () => {
  const by = (sort) => pointsModel(ROWS, { ...BASE, sort }, env()).rows.map((r) => r.key);
  // `later` runs East 30.5, North 10.2, South 7.9.
  assert.deepEqual(by({ by: "later" }), ["South", "North", "East"], "ascending by default");
  assert.deepEqual(by({ by: "later", order: "desc" }), ["East", "North", "South"]);
  // A list puts its categories first, in its order, and the rest after in data order.
  assert.deepEqual(by(["East"]), ["East", "North", "South"]);
  assert.deepEqual(by(["South", "East"]), ["South", "East", "North"]);

  // Ties keep data order; a text column sorts by code point.
  const tied = [{ region: "A", rate: 5, group: "b" }, { region: "B", rate: 5, group: "a" }, { region: "C", rate: 1, group: "b" }];
  const keys = (sort) => pointsModel(tied, { data: "d.csv", x: "region", y: "rate", sort }, env()).rows.map((r) => r.key);
  assert.deepEqual(keys("-value"), ["A", "B", "C"]);
  assert.deepEqual(keys({ by: "group" }), ["B", "A", "C"]);

  // Errors are rank's, as they are.
  assert.throws(() => by({ by: "nope" }), { message: "sort column 'nope' not found (columns: region, rate, low, high, later, lo2, hi2)" });
  assert.throws(() => by(["North", "Nowhere"]), { message: "category 'Nowhere' in `sort` not found (categories: North, South, East)" });
  assert.throws(() => by("sideways"), { message: '`sort` must be "none", "value", "-value", { by, order } or a list of categories' });
});

test("pointsModel: the left margin keeps half of a wide tick label inside the svg", () => {
  // One-letter categories leave little room on the left; the tick labels are centred on the plot's ends, so half of the widest one (here "120.0") must fit left of the plot.
  const rows = [{ g: "A", v: 10 }, { g: "B", v: 20 }];
  const props = { data: "d.csv", x: "g", y: "v", format: { y: ",.1f" }, domain: [0, 120] };
  const m = pointsModel(rows, props, env());
  assert.equal(m.ticks[0].label, "0.0");
  const widest = Math.max(...m.ticks.map((k) => k.label.length));
  assert.ok(m.margin.left >= (widest * 16.8) / 2 + 28 * 0.2, `half the widest tick fits left of the plot (${m.margin.left})`);
  assert.equal(m.margin.left + m.pw + m.margin.right, 1200);
  // The widest tick of any step counts, so the plot keeps its size.
  const steps = [{ ...props, domain: undefined }, props];
  const first = pointsModel(rows, steps[0], env({ stepProps: steps }));
  const second = pointsModel(rows, steps[1], env({ stepProps: steps }));
  assert.deepEqual([first.margin, first.pw], [second.margin, second.pw]);
  // Long category labels still decide it when they are wider.
  const long = pointsModel([{ g: "Northern district", v: 10 }, { g: "B", v: 20 }], props, env());
  assert.ok(long.margin.left > m.margin.left);
});

// Pairs: `from` is the "before" of each row. The hollow dot sits at `from`, the filled one at `y`.
const PAIRS = [
  { region: "North", before: 14.2, now: 10.1, lo: 8, hi: 12.5 },
  { region: "South", before: 11.8, now: 9.6, lo: 7, hi: 11 },
  { region: "East", before: 16.5, now: 21.0, lo: 19, hi: 24 },
];
const PAIR_STEPS = [{ data: "d.csv", x: "region", y: "before", format: { y: ",.1f" } }, { data: "d.csv", x: "region", y: "now", from: "before", format: { y: ",.1f" } }];

test("pointsModel: pairs carry from and the domain covers both columns at every step", () => {
  const [first, second] = PAIR_STEPS.map((p) => pointsModel(PAIRS, p, env({ stepProps: PAIR_STEPS })));
  assert.deepEqual(first.rows.map((r) => r.from), [null, null, null], "no `from` at the first step");
  assert.deepEqual(second.rows.map((r) => [r.key, r.from, r.value]), [["North", 14.2, 10.1], ["South", 11.8, 9.6], ["East", 16.5, 21]]);
  assert.equal(second.rows[0].title, "North: 14.2 → 10.1");
  // The axis covers `before` and `now` at both steps (14.2 and 21 are in different columns), so it never moves.
  assert.ok(first.domain[0] <= 9.6 && first.domain[1] >= 21, `${first.domain}`);
  assert.deepEqual(first.domain, second.domain);
  assert.deepEqual(first.ticks, second.ticks);
  assert.deepEqual([first.margin, first.pw, first.ph], [second.margin, second.pw, second.ph]);
  assert.deepEqual(first.domain, d3.scaleLinear().domain([9.6, 21]).nice(5).domain());
  // Without the other step the `from` column still counts at its own step, and a given domain wins.
  const alone = pointsModel(PAIRS, PAIR_STEPS[1], env({ stepProps: null }));
  assert.deepEqual(alone.domain, first.domain);
  assert.deepEqual(pointsModel(PAIRS, { ...PAIR_STEPS[1], domain: [0, 30] }, env({ stepProps: PAIR_STEPS })).domain, [0, 30]);
  // A `from` in a later step counts at the current one.
  const later = [{ data: "d.csv", x: "region", y: "now" }, { data: "d.csv", x: "region", y: "now", from: "far" }];
  const wide = pointsModel([...PAIRS.map((r) => ({ ...r, far: 40 }))], later[0], env({ stepProps: later }));
  assert.ok(wide.domain[1] >= 40, `${wide.domain}`);
  // A `from` outside a given domain is an error, as an estimate is.
  const low = [{ region: "North", before: 5, now: 12 }];
  assert.throws(() => pointsModel(low, { ...PAIR_STEPS[1], domain: [10, 30] }, env()), { message: "`from` of 'North' (5) is outside `domain` [10, 30]" });
  assert.doesNotThrow(() => pointsModel([{ region: "North", before: null, now: 12 }], { ...PAIR_STEPS[1], domain: [10, 30] }, env()));
});

test("pair without from value", () => {
  const rows = [...PAIRS, { region: "West", before: null, now: 8.3, lo: 6, hi: 10 }, { region: "Centre", before: "", now: 9, lo: 7, hi: 11 }];
  const m = pointsModel(rows, PAIR_STEPS[1], env({ stepProps: PAIR_STEPS }));
  for (const key of ["West", "Centre"]) {
    const row = m.rows.find((r) => r.key === key);
    assert.equal(row.from, null, `${key}: no hollow dot, never one at zero`);
    assert.equal(row.missing, false, `${key}: its end dot shows`);
    assert.ok(row.value > 0 && !row.title.includes("→"), `${key}: ${row.title}`);
  }
  assert.equal(m.rows.find((r) => r.key === "West").title, "West: 8.3");
  // An empty value hides the pair: the row says "no data" and carries no `from` either.
  const blank = pointsModel([{ region: "A", before: 5, now: null }, { region: "B", before: 6, now: 7 }], PAIR_STEPS[1], env());
  assert.deepEqual([blank.rows[0].missing, blank.rows[0].from, blank.rows[0].value], [true, null, null]);
  assert.equal(blank.rows[0].title, "A: no data");
  // A missing `from` does not reach the domain as zero.
  const far = pointsModel([{ region: "A", before: null, now: 50 }, { region: "B", before: "", now: 52 }], { data: "d.csv", x: "region", y: "now", from: "before" }, env());
  assert.ok(far.domain[0] > 40, `${far.domain}`);
  // A `from` column that is not set draws no pair.
  assert.ok(pointsModel(PAIRS, PAIR_STEPS[0], env()).rows.every((r) => r.from === null));
});

test("pointsModel: the domain counts displayed categories and the bounds of rows with an estimate", () => {
  const steps = [BASE, { ...BASE, y: "later", interval: { lower: "lo2", upper: "hi2" } }];
  const reach = (rows, p = BASE, stepProps = [p]) => pointsModel(rows, p, env({ stepProps })).domain;
  const plain = reach(ROWS);
  // A row with no category is not shown, so its values do not widen the axis.
  assert.deepEqual(reach([...ROWS, { region: "", rate: 90, low: 80, high: 99 }]), plain);
  assert.deepEqual(reach([...ROWS, { region: null, rate: 90, low: 80, high: 99 }]), plain);
  // A row with no estimate shows "no data": its bounds are not drawn, so they do not count.
  assert.deepEqual(reach([...ROWS, { region: "West", rate: null, low: 80, high: 99 }]), plain);
  assert.deepEqual(reach([...ROWS, { region: "West", rate: "", low: 80, high: 99 }]), plain);
  // The same at every step: a bound counts only at a step where its row has an estimate.
  const rows = [...ROWS, { region: "West", rate: 5, low: 4, high: 6, later: null, lo2: 70, hi2: 99 }];
  assert.ok(reach(rows, steps[0], steps)[1] < 40, "West's bounds at `later` do not count: it has no estimate there");
  assert.deepEqual(reach(rows, steps[0], steps), reach(rows, steps[1], steps));
  // A bound counts when the whisker can be drawn: with a value and both bounds.
  assert.deepEqual(reach([...ROWS, { region: "West", rate: 10, low: null, high: 99 }]), plain);
  // A row that is shown or hidden counts alike (the axis does not move when `shown` changes).
  assert.deepEqual(reach(ROWS, { ...BASE, shown: ["North"] }), plain);
});

// Strips: with `id`, a category has many rows, one point each, packed as a beeswarm with a summary tick.
const STRIPS = [
  { g: "A", id: "x1", v: 1, w: 10 }, { g: "A", id: "x2", v: 2, w: 30 }, { g: "A", id: "x3", v: 9, w: 20 },
  { g: "B", id: "x1", v: 4, w: 5 }, { g: "B", id: "x2", v: 8, w: 7 },
  { g: "C", id: "x1", v: 3, w: 1 }, { g: "C", id: "x3", v: "", w: 2 }, { g: "C", id: "x4", v: 4, w: 3 },
];
const SBASE = { data: "s.csv", x: "g", y: "v", id: "id" };
const keysOf = (m) => m.rows.map((r) => r.key);

test("pointsModel: strips group by category, summary median and mean", () => {
  const m = pointsModel(STRIPS, SBASE, env());
  assert.equal(m.strips, true);
  assert.equal(m.summary, "median", "the median by default");
  assert.equal(m.focus, null);
  assert.deepEqual(keysOf(m), ["A", "B", "C"], "one strip per category, in data order");
  assert.deepEqual(m.rows.map((r) => r.points.map((q) => [q.id, q.value])), [
    [["x1", 1], ["x2", 2], ["x3", 9]],
    [["x1", 4], ["x2", 8]],
    [["x1", 3], ["x4", 4]],
  ], "a point per row with a value, in data order; an empty cell is never drawn");
  assert.deepEqual(m.rows.map((r) => r.summary), [2, 6, 3.5]);
  assert.ok(m.rows.every((r) => r.points.every((q) => Number.isFinite(q.dy) && !q.focus && !q.dim)));
  assert.deepEqual(m.rows.map((r) => r.overflow), [{ low: 0, high: 0 }, { low: 0, high: 0 }, { low: 0, high: 0 }], "no overflow without `domain`");
  assert.deepEqual(m.rows.map((r) => [r.from, r.lo, r.hi, r.missing]), [[null, null, null, false], [null, null, null, false], [null, null, null, false]]);
  assert.equal(m.rows[0].title, "A: 2 (n = 3)");
  assert.equal(m.rows[2].title, "C: 3.5 (n = 2)");

  const mean = pointsModel(STRIPS, { ...SBASE, summary: "mean" }, env());
  assert.deepEqual(mean.rows.map((r) => r.summary), [4, 6, 3.5]);
  assert.equal(mean.rows[0].title, "A: 4 (n = 3)");
  const none = pointsModel(STRIPS, { ...SBASE, summary: "none" }, env());
  assert.deepEqual(none.rows.map((r) => r.summary), [null, null, null], "no tick");
  assert.equal(none.rows[0].title, "A (n = 3)");

  // `sort` ranks strips by their summary (the median when there is none); `{ by }` reduces that column the same way.
  const order = (props) => keysOf(pointsModel(STRIPS, { ...SBASE, ...props }, env()));
  assert.deepEqual(order({ sort: "value" }), ["A", "C", "B"], "medians 2, 6, 3.5");
  assert.deepEqual(order({ sort: "-value" }), ["B", "C", "A"]);
  assert.deepEqual(order({ sort: "value", summary: "mean" }), ["C", "A", "B"], "means 4, 6, 3.5");
  assert.deepEqual(order({ sort: "value", summary: "none" }), ["A", "C", "B"], "still the median");
  assert.deepEqual(order({ sort: { by: "w" } }), ["C", "B", "A"], "medians of w: 20, 6, 2");
  assert.deepEqual(order({ sort: { by: "w", order: "desc" }, summary: "mean" }), ["A", "B", "C"], "means of w: 20, 6, 2");
  assert.deepEqual(order({ sort: ["C"] }), ["C", "A", "B"]);
  assert.throws(() => order({ sort: { by: "nope" } }), { message: "sort column 'nope' not found (columns: g, id, v, w)" });

  // The domain covers every point of every step; `from` and `interval` are not drawn in strips, so they do not count.
  assert.deepEqual(m.domain, d3.scaleLinear().domain([1, 9]).nice(5).domain());
  const wide = STRIPS.map((r) => ({ ...r, far: 99, lo: -50, hi: 80 }));
  assert.deepEqual(pointsModel(wide, { ...SBASE, from: "far", interval: { lower: "lo", upper: "hi" } }, env()).domain, m.domain);
  // A row with an empty id is not a point.
  assert.deepEqual(pointsModel([...STRIPS, { g: "A", id: "", v: 50, w: 1 }], SBASE, env()).rows[0].points.length, 3);
  // shown and highlight name categories; highlight dims every point of the other strips.
  const lit = pointsModel(STRIPS, { ...SBASE, shown: ["A", "C"], highlight: "C" }, env());
  assert.deepEqual(lit.rows.map((r) => [r.shown, r.dim, r.points.every((q) => q.dim === r.dim)]), [[true, true, true], [false, true, true], [true, false, true]]);
  // Without `id` a repeated category is still an error.
  assert.throws(() => pointsModel(STRIPS, { data: "s.csv", x: "g", y: "v" }, env()), { message: "category 'A' appears more than once in s.csv (chart.points needs one row per category, or `id` for strips)" });
});

test("strip edge cases", () => {
  const rows = [
    { g: "One", id: "a01", v: 12 },
    { g: "Some", id: "b01", v: 8.5 }, { g: "Some", id: "b02", v: 14 }, { g: "Some", id: "b03", v: "" }, { g: "Some", id: "b04", v: 19.5 },
    ...Array.from({ length: 20 }, (_, i) => ({ g: "Equal", id: `a${String(i + 1).padStart(2, "0")}`, v: 15 })),
    { g: "Empty", id: "c01", v: "" }, { g: "Empty", id: "c02", v: null },
  ];
  const m = pointsModel(rows, { data: "e.csv", x: "g", y: "v", id: "id", focus: "a01" }, env());
  const [one, some, equal, empty] = m.rows;
  const { band, r } = sizesOf(m);
  const maxDy = band / 2 - r;
  // A single row: its summary is its value, its point sits on the row's centre line.
  assert.deepEqual([one.summary, one.points.length, one.points[0].dy, one.missing], [12, 1, 0, false]);
  // All values equal: the swarm stays inside the band and has no NaN.
  assert.equal(equal.summary, 15);
  assert.equal(equal.points.length, 20);
  for (const q of equal.points) assert.ok(Number.isFinite(q.dy) && Math.abs(q.dy) <= maxDy + 1e-9, `${q.id}: ${q.dy} within ${maxDy}`);
  assert.ok(new Set(equal.points.map((q) => q.dy)).size > 1, "spread over several slots");
  // A strip without the followed item has no focused point; the item's dots in the others are focused, not dimmed.
  assert.deepEqual(m.rows.map((s) => s.points.filter((q) => q.focus).map((q) => q.id)), [["a01"], [], ["a01"], []]);
  assert.ok(m.rows.every((s) => s.points.every((q) => q.dim === !q.focus)), "every other point is dimmed");
  assert.equal(m.focus, "a01");
  // A strip with no value reads "no data": no points, no summary, never a dot at zero.
  assert.deepEqual([empty.missing, empty.points.length, empty.summary, empty.value], [true, 0, null, null]);
  assert.equal(empty.title, "Empty: no data");
  assert.equal(some.points.length, 3, "an empty cell is not a point");
  // Ranked last whichever way it runs.
  assert.equal(keysOf(pointsModel(rows, { data: "e.csv", x: "g", y: "v", id: "id", sort: "-value" }, env())).at(-1), "Empty");
  // Every value equal across the whole chart still gives a usable axis (extentOf's [v, v + 1]).
  const flat = pointsModel(rows.filter((x) => x.g === "Equal"), { data: "e.csv", x: "g", y: "v", id: "id" }, env());
  assert.ok(flat.domain.every(Number.isFinite) && flat.domain[0] <= 15 && flat.domain[1] > 15, `${flat.domain}`);
  assert.ok(flat.rows[0].points.every((q) => Number.isFinite(q.dy)));
  // An id twice in one strip is an error: its dots are keyed by id.
  assert.throws(
    () => pointsModel([...rows, { g: "Some", id: "b02", v: 3 }], { data: "e.csv", x: "g", y: "v", id: "id" }, env()),
    { message: "id 'b02' appears more than once in category 'Some' of e.csv" },
  );
});

test("overflow counts per side", () => {
  // [2.5, 6]: A has 1 and 2 below and 9 above; B has 8 above; C is inside.
  const props = { ...SBASE, domain: [2.5, 6] };
  const m = pointsModel(STRIPS, props, env());
  assert.deepEqual(m.domain, [2.5, 6], "used as given");
  assert.deepEqual(m.rows.map((r) => r.overflow), [{ low: 2, high: 1 }, { low: 0, high: 1 }, { low: 0, high: 0 }]);
  assert.deepEqual(m.rows.map((r) => r.points.map((q) => q.id)), [[], ["x1"], ["x1", "x4"]], "points outside are not drawn");
  // The summary is the strip's own (every value), drawn only inside the domain.
  assert.deepEqual(m.rows.map((r) => r.summary), [null, 6, 3.5], "A's median (2) is outside: no tick");
  assert.equal(m.rows[0].title, "A: 2 (n = 3)");
  // Room for the boxes is kept at every step, so the plot keeps its size; a step without overflow has none of its own.
  const steps = [SBASE, props];
  const [plain, cut] = steps.map((p) => pointsModel(STRIPS, p, env({ stepProps: steps })));
  assert.deepEqual([plain.margin, plain.pw, plain.ph], [cut.margin, cut.pw, cut.ph]);
  assert.deepEqual(plain.rows.map((r) => r.overflow), [{ low: 0, high: 0 }, { low: 0, high: 0 }, { low: 0, high: 0 }]);
  const alone = pointsModel(STRIPS, SBASE, env());
  assert.ok(cut.room.low > 0 && cut.room.high > 0, JSON.stringify(cut.room));
  assert.deepEqual(alone.room, { low: 0, high: 0 });
  assert.ok(cut.margin.left >= alone.margin.left + cut.room.low - 1, "the low box sits between the labels and the plot");
  assert.ok(cut.margin.right >= cut.room.high, "the high box fits in the right margin");
  // Estimates keep their rule: a value outside a given domain is an error.
  assert.throws(() => pointsModel(ROWS, { ...BASE, domain: [0, 14] }, env()), { message: "estimate 'East' (15.2) is outside `domain` [0, 14]" });
});

test("focus unknown id errors", () => {
  assert.throws(() => pointsModel(STRIPS, { ...SBASE, focus: "zz" }, env()), { message: "`focus` id 'zz' not found in s.csv" });
  // Without `id` there are no points to follow.
  assert.throws(() => pointsModel(ROWS, { ...BASE, focus: "North" }, env()), { message: "`focus` id 'North' not found in data/estimates.csv" });
  // An id found only outside a given domain is known: it simply has no dot.
  const m = pointsModel(STRIPS, { ...SBASE, domain: [2.5, 6], focus: "x3" }, env());
  assert.deepEqual(m.rows.map((r) => r.points.filter((q) => q.focus).length), [0, 0, 0]);
  // The followed item's dots are focused in every strip that has it; the rest dim.
  const x1 = pointsModel(STRIPS, { ...SBASE, focus: "x1" }, env());
  assert.deepEqual(x1.rows.map((r) => r.points.filter((q) => q.focus).map((q) => q.id)), [["x1"], ["x1"], ["x1"]]);
  assert.ok(x1.rows.every((r) => r.points.every((q) => q.dim === (q.id !== "x1"))));
});
