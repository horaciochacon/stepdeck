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
// waterfallSteps(rows, props, stepProps) -> [{ bars, total, whiskers }]
//   The waterfalls of the slide: the current props when they are a waterfall, then every other step (`stepProps`,
//   null entries skipped) that is a waterfall over the same `data`, each with its own `y`, `sort`, `shown` and
//   `total`. `whiskers` are the spans of its shown bars' whiskers when it has `interval` (a contribution's interval
//   sits on its start: start + lower .. start + upper). The current props throw (their error is the element's);
//   another step that fails is skipped (its own update reports it).
// waterfallSpan(rows, props, stepProps) -> [min, max]
//   waterfallDomain(waterfallSteps(rows, props, stepProps)).
import { extentOf, rank } from "../../core/chart-layout.js";

/** A finite number, from a number or a numeric string; null for an empty cell or anything else. */
export const valueOf = (row, col) => (row[col] == null || row[col] === "" ? null : Number.isFinite(Number(row[col])) ? Number(row[col]) : null);

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

/** One step's waterfall and the whisker spans of its shown bars, from the rows and that step's props. Throws. */
function flowOf(rows, props) {
  const items = categoriesOf(rows, props.x).map((r) => ({ key: String(r[props.x]), value: valueOf(r, props.y), columns: r }));
  const byKey = new Map(items.map((it) => [it.key, it]));
  const shown = Array.isArray(props.shown) ? new Set(props.shown.map(String)) : null;
  const order = rank(items, props.sort).map((key) => byKey.get(key));
  const flow = waterfall(order.map((it) => ({ key: it.key, value: it.value, shown: shown ? shown.has(it.key) : true })), { total: hasTotal(props.total) });
  const { lower, upper } = props.interval ?? {};
  const whiskers = [];
  if (lower && upper) {
    flow.bars.forEach((b, i) => {
      const lo = valueOf(order[i].columns, lower);
      const hi = valueOf(order[i].columns, upper);
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
