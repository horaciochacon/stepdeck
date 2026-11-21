// The pure maths of chart.bar's modes: no DOM, no randomness; Node tests it directly.
//
// waterfall(bars, { total }) -> { bars: [{ key, start, end, shown }], total: { start: 0, end } | null }
//   `bars` are [{ key, value, shown }] in display order. The running total counts shown bars only: a shown bar runs
//   from the total before it to that plus its value; a hidden one has no length and sits at the running total of its
//   slot (start = end), so the bars and the total always add up what is on screen. Every category needs a finite value,
//   shown or not: an empty one throws `waterfall needs a value for every category: '<key>' is empty`.
// waterfallDomain(steps) -> [min, max]
//   extentOf (core/chart-layout.js) over every start and end of every step's waterfall, the total and any `whiskers`
//   included, with zero. `steps` are waterfall results; null entries are skipped. Not niced: the caller nices.
// barOrder(rows, props) -> keys in display order
//   Plain bars' and a waterfall's order: `rank` over the categories (rows with a category, in data order), each valued at
//   its `y`; `{ by }` reads that column by `sortColumns` (core/chart-layout.js). The errors are rank's.
// waterfallSteps(rows, props, stepProps) -> [{ bars, total, whiskers }]
//   The waterfalls of the slide: the current props when they are a waterfall, then every other step (`stepProps`,
//   null entries skipped) that is a waterfall over the same `data`, each with its own `y`, `sort`, `shown` and
//   `total`. `whiskers` are the spans of its shown bars' whiskers when it has `interval` (a contribution's interval
//   sits on its start: start + lower .. start + upper). The current props throw (their error is the element's);
//   another step that fails is skipped (its own update reports it).
// waterfallSpan(rows, props, stepProps) -> [min, max]
//   waterfallDomain(waterfallSteps(rows, props, stepProps)).
//
// backToBack(rows, props) -> { categories: [{ key, left: { value, lo, hi }, right: { value, lo, hi } }], groups: [left, right] }
//   Long data: one row per category (`x`) and group (`group`). The `group` column needs exactly two values (rows with an
//   empty category or group are skipped); `groups` orders them [left, right], else the data order. Categories are in
//   data order. `value` is the row's `y`, null when empty; `lo` and `hi` its `interval` bounds, both null unless the row
//   has a value and both bounds (a lone bound draws nothing). Throws, naming it: a `group` column without two values; a
//   category with no row, or more than one, for a group; `groups` naming one group twice; a `highlight` that is both a
//   category and a group, or neither; a value or a drawn bound below zero.
// backToBackOrder(rows, props) -> keys in display order
//   `rank` over the categories, each valued at the sum of its two sides' `y` (none when either is not a number, which
//   ranks last); `{ by }` reads that column by `sortColumns` and reduces it the same way: a number column is summed
//   (text in it is missing), and a text column counts where both rows agree, as the category's own text does. The
//   errors are rank's.
// backToBackSpan(rows, props, stepProps) -> [0, max]
//   extentOf with zero over every `y` and drawn interval bound of every back-to-back step of the slide over the same
//   `data` (the current props when they are one, then `stepProps`, null entries skipped). Not niced or mirrored: the
//   caller does both.
import { extentOf, rank, cellValue, sortColumns } from "../../core/chart-layout.js";

/** The rows that name a category (a non-empty `x`), in data order. */
export const categoriesOf = (rows, x) => rows.filter((r) => r[x] != null && r[x] !== "");

/** Whether `total` asks for a total bar: `true`, or a label. */
export const hasTotal = (total) => total === true || (typeof total === "string" && total !== "");

/**
 * @param {Array<{ key: string, value: number | null, shown?: boolean }>} bars
 * @param {{ total?: unknown }} [options]
 * @returns {{ bars: Array<{ key: string, start: number, end: number, shown: boolean }>, total: { start: 0, end: number } | null }}
 */
export function waterfall(bars, { total } = {}) {
  for (const { key, value } of bars) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`waterfall needs a value for every category: '${key}' is empty`);
  }
  let run = 0;
  const out = bars.map(({ key, value, shown }) => {
    const start = run;
    if (shown !== false) run += value;
    return { key, start, end: run, shown: shown !== false };
  });
  return { bars: out, total: total ? { start: 0, end: run } : null };
}

/**
 * @param {Array<{ bars: Array<{ start: number, end: number }>, total: { start: number, end: number } | null } | null>} steps
 * @returns {[number, number]}
 */
export function waterfallDomain(steps) {
  const marks = [];
  for (const step of steps ?? []) {
    if (!step) continue;
    marks.push(...step.bars, ...(step.whiskers ?? []));
    if (step.total) marks.push(step.total);
  }
  return extentOf(marks, ["start", "end"], { zero: true });
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {Record<string, any>} props
 * @returns {string[]}
 */
export function barOrder(rows, props) {
  const categories = categoriesOf(rows, props.x);
  const columns = sortColumns(rows, categories.map((r) => [r]));
  return rank(categories.map((r, i) => ({ key: String(r[props.x]), value: cellValue(r, props.y), columns: columns[i] })), props.sort);
}

/** One step's waterfall and the whisker spans of its shown bars, from the rows and that step's props. Throws. */
function flowOf(rows, props) {
  const items = categoriesOf(rows, props.x).map((r) => ({ key: String(r[props.x]), value: cellValue(r, props.y), row: r }));
  const byKey = new Map(items.map((it) => [it.key, it]));
  const shown = Array.isArray(props.shown) ? new Set(props.shown.map(String)) : null;
  const order = barOrder(rows, props).map((key) => byKey.get(key));
  const flow = waterfall(order.map((it) => ({ key: it.key, value: it.value, shown: shown ? shown.has(it.key) : true })), { total: hasTotal(props.total) });
  const { lower, upper } = props.interval ?? {};
  const whiskers = [];
  if (lower && upper) {
    flow.bars.forEach((b, i) => {
      const lo = cellValue(order[i].row, lower);
      const hi = cellValue(order[i].row, upper);
      if (b.shown && lo !== null && hi !== null) whiskers.push({ start: b.start + lo, end: b.start + hi });
    });
  }
  return { ...flow, whiskers };
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {Record<string, any>} props the current props
 * @param {ReadonlyArray<Record<string, any> | null> | null} stepProps
 * @returns {Array<{ bars: Array<{ key: string, start: number, end: number, shown: boolean }>, total: { start: 0, end: number } | null, whiskers: Array<{ start: number, end: number }> }>}
 */
export function waterfallSteps(rows, props, stepProps) {
  const steps = props.mode === "waterfall" ? [flowOf(rows, props)] : [];
  for (const p of stepProps ?? []) {
    if (!p || p.mode !== "waterfall" || p.data !== props.data) continue;
    try {
      steps.push(flowOf(rows, p));
    } catch {
      // That step's own update reports the problem.
    }
  }
  return steps;
}

/** @returns {[number, number]} */
export const waterfallSpan = (rows, props, stepProps) => waterfallDomain(waterfallSteps(rows, props, stepProps));

// --- Back-to-back ----------------------------------------------------------------------------------------------------

const SIDES = ["left", "right"];
const blank = (v) => v == null || v === "";

/** The two group rows of every category, in data order, and the groups [left, right]. Throws naming the problem. */
function pairRows(rows, props) {
  const { x, group } = props;
  const named = categoriesOf(rows, x).filter((r) => !blank(r[group]));
  const values = [...new Set(named.map((r) => String(r[group])))];
  if (values.length !== 2) throw new Error(`\`group\` column '${group}' has ${values.length} values (back-to-back needs exactly two)`);
  const groups = Array.isArray(props.groups) ? props.groups.map(String) : values;
  if (groups.length !== 2 || groups[0] === groups[1]) {
    throw new Error(`\`groups\` must be two different values of the \`group\` column '${group}' (values: ${values.join(", ")})`);
  }
  const byKey = new Map();
  for (const r of named) {
    const key = String(r[x]);
    if (!byKey.has(key)) byKey.set(key, {});
    const pair = byKey.get(key);
    const g = String(r[group]);
    if (pair[g]) throw new Error(`category '${key}' has more than one '${g}' row`);
    pair[g] = r;
  }
  const categories = [...byKey].map(([key, pair]) => {
    for (const g of groups) if (!pair[g]) throw new Error(`category '${key}' has no '${g}' row`);
    return { key, rows: groups.map((g) => pair[g]) };
  });
  return { categories, groups };
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {Record<string, any>} props
 * @returns {{ categories: Array<{ key: string, left: { value: number | null, lo: number | null, hi: number | null }, right: { value: number | null, lo: number | null, hi: number | null } }>, groups: [string, string] }}
 */
export function backToBack(rows, props) {
  const { categories, groups } = pairRows(rows, props);
  if (props.highlight != null) {
    const name = String(props.highlight);
    const isCategory = categories.some((c) => c.key === name);
    if (isCategory && groups.includes(name)) throw new Error(`'${name}' in \`highlight\` is both a category and a group`);
    if (!isCategory && !groups.includes(name)) {
      const names = `categories: ${categories.map((c) => c.key).join(", ")}; groups: ${groups.join(", ")}`;
      throw new Error(`category or group '${name}' in \`highlight\` not found in ${props.data} (${names})`);
    }
  }
  const { lower, upper } = props.interval ?? {};
  const both = Boolean(lower && upper);
  return {
    categories: categories.map(({ key, rows: pair }) => {
      const out = { key };
      pair.forEach((row, i) => {
        const value = cellValue(row, props.y);
        const lo = both && value !== null ? cellValue(row, lower) : null;
        const hi = both && value !== null ? cellValue(row, upper) : null;
        const drawn = lo !== null && hi !== null;
        for (const [col, v] of [[props.y, value], ...(drawn ? [[lower, lo], [upper, hi]] : [])]) {
          if (v === null || v >= 0) continue;
          throw new Error(`category '${key}' has ${v} in '${col}' for '${groups[i]}' (back-to-back needs values of zero or more)`);
        }
        out[SIDES[i]] = { value, lo: drawn ? lo : null, hi: drawn ? hi : null };
      });
      return out;
    }),
    groups,
  };
}

/** The sum of a pair's two values, or null unless both are numbers. */
const sum = ([a, b]) => (a !== null && b !== null ? a + b : null);

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {Record<string, any>} props
 * @returns {string[]}
 */
export function backToBackOrder(rows, props) {
  const { categories } = pairRows(rows, props);
  // A number column (a number in any row) is summed, so text in it ("n/a") ranks as missing, never as a value.
  const columns = sortColumns(rows, categories.map((c) => c.rows), sum);
  const items = categories.map(({ key, rows: pair }, i) => ({ key, value: sum(pair.map((r) => cellValue(r, props.y))), columns: columns[i] }));
  return rank(items, props.sort);
}

/** One step's drawn values: every `y`, and both bounds where the row has a value and both. */
function pairMarks(rows, p) {
  const { lower, upper } = p.interval ?? {};
  const marks = [];
  for (const r of categoriesOf(rows, p.x)) {
    if (blank(r[p.group])) continue;
    const value = cellValue(r, p.y);
    if (value === null) continue;
    marks.push({ v: value });
    if (lower && upper && cellValue(r, lower) !== null && cellValue(r, upper) !== null) marks.push({ v: cellValue(r, lower) }, { v: cellValue(r, upper) });
  }
  return marks;
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {Record<string, any>} props the current props
 * @param {ReadonlyArray<Record<string, any> | null> | null} stepProps
 * @returns {[number, number]}
 */
export function backToBackSpan(rows, props, stepProps) {
  const steps = [props, ...(stepProps ?? [])].filter((p) => p && p.mode === "back-to-back" && p.data === props.data);
  return [0, extentOf(steps.flatMap((p) => pairMarks(rows, p)), ["v"], { zero: true })[1]];
}
