// chart.points: the model, data and props to plain data. No DOM: it runs in Node (test/unit/chart-points.test.mjs).
//
// pointsModel(rows, props, { stepProps, font, charW, w, h, format, t }) ->
//   { w, h, font, charW, lineH, margin, pw, ph, domain, ticks, rows, reference, origin, axes, noData }
//   rows       one per category, in display order (`sort`; the data order without it):
//              { key, label, lines, slot, value, from, lo, hi, shown, dim, text, title, missing }
//              `slot` is the place in that order; a hidden category has its slot too; `from` is the "before" of a
//              pair (the hollow dot), null without a `from` column, for an empty cell and for a row without a value
//   reference  { key, value, label }, or null without one or when it is past a given `domain` (it is not drawn);
//              `origin` is the value rows grow out from
//   margin     { left, right, top, bottom } around the plot (pw x ph), rounded as `frame` rounds them
// `format(spec)` gives a formatter (ctx.format) and `t(key)` an engine string (ctx.t).
//
// The value domain is `domain` as given, else the extent of every step's `y`, `from` and interval columns
// (`stepProps`, null entries skipped; steps that read another file do not count) plus every step's `reference`,
// rounded outward to ticks; zero is not forced. Only what can be drawn counts: rows with a category, and the
// interval bounds of a row that has an estimate at that step (with both bounds, as a whisker needs). `sort` orders
// the rows through `rank` (core/chart-layout.js) and changes nothing else: not the domain, the margins nor any row's data. The margins come from character counts and from every step too
// (its titles, its reference label, the tick labels of its own axis), so nothing that appears later resizes the plot. A missing value is never zero:
// it gives `missing: true` and no value.
import { d3 } from "../../core/d3.js";
import { extentOf, rank, wrapLabel } from "../../core/chart-layout.js";

/** A cell as a number, or null when it is empty or not a number. */
export const valueOf = (row, column) => {
  if (column === undefined) return null;
  const raw = row?.[column];
  if (raw == null || raw === "") return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
};

const isText = (v) => v != null && String(v) !== "";
const validDomain = (d) => Array.isArray(d) && d.length === 2 && d.every((v) => Number.isFinite(v)) && d[0] < d[1];

/** `reference` as { value, label }, or null when it is not set (or not a number). */
export function referenceOf(p) {
  const ref = p?.reference;
  if (ref == null) return null;
  const value = typeof ref === "object" ? Number(ref.value) : Number(ref);
  if (!Number.isFinite(value)) return null;
  const label = typeof ref === "object" && isText(ref.label) ? String(ref.label) : "";
  return { value, label };
}

/** The props of every step that read the same file as `props` (and `props` itself), skipping null entries. */
const stepsOf = (props, stepProps) => [props, ...(stepProps ?? [])].filter((p) => p && p.data === props.data);

/**
 * The domain of a step without `domain`: what every step can draw, niced. A step draws the rows with a category: a
 * `from` value, and an estimate with its interval bounds (a row without an estimate shows "no data" and draws no
 * interval). Its reference counts too.
 */
function autoDomain(rows, steps) {
  const values = [];
  for (const p of steps) {
    for (const row of rows) {
      if (!isText(row[p.x])) continue;
      const [y, from, lo, hi] = [p.y, p.from, p.interval?.lower, p.interval?.upper].map((c) => valueOf(row, c));
      if (y === null) continue;
      values.push(y);
      if (from !== null) values.push(from);
      if (lo !== null && hi !== null) values.push(lo, hi);
    }
    const ref = referenceOf(p);
    if (ref) values.push(ref.value);
  }
  return d3.scaleLinear().domain(extentOf(values.map((v) => ({ v })), ["v"])).nice(5).domain();
}

/** The ticks of a domain with one step's labels: `format.y`, else a fixed precision from the tick step. */
function ticksOf(domain, spec, format) {
  const values = d3.scaleLinear().domain(domain).ticks(5);
  const step = values.length > 1 ? Math.abs(values[1] - values[0]) : 1;
  const label = format(spec || `.${d3.precisionFixed(step || 1)}f`);
  return values.map((value) => ({ value, label: label(value) }));
}

/** The value rows grow out from: the reference inside the domain, else 0 inside the domain, else its start. */
function originOf(domain, reference) {
  const inside = (v) => v >= domain[0] && v <= domain[1];
  if (reference) return inside(reference.value) ? reference.value : domain[0];
  return inside(0) ? 0 : domain[0];
}

/** Checks the categories and the names in `shown` and `highlight`. Throws naming the category. */
function checkCategories(categories, props) {
  const keys = categories.map((r) => String(r[props.x]));
  const seen = new Set();
  for (const key of keys) {
    if (seen.has(key)) throw new Error(`category '${key}' appears more than once in ${props.data} (chart.points needs one row per category, or \`id\` for strips)`);
    seen.add(key);
  }
  const named = [["shown", Array.isArray(props.shown) ? props.shown : []], ["highlight", props.highlight == null ? [] : [props.highlight]]];
  for (const [prop, list] of named) {
    for (const id of list) {
      if (!seen.has(String(id))) throw new Error(`category '${id}' in \`${prop}\` not found in ${props.data} (categories: ${keys.join(", ")})`);
    }
  }
}

/**
 * @param {Array<Record<string, unknown>>} rows the rows of `props.data`
 * @param {object} props the element's props at this step
 * @param {{ stepProps?: ReadonlyArray<object | null> | null, font?: number, charW?: number, w?: number, h?: number, format?: (spec: string) => (n: number) => string, t?: (key: string) => string }} [env]
 */
export function pointsModel(rows, props, { stepProps = null, font = 28, charW = font * 0.6, w = 1, h = 1, format = d3.format, t = (key) => key } = {}) {
  if (props.domain !== undefined && !validDomain(props.domain)) throw new Error("`domain` must be [min, max] with min < max");
  const categories = rows.filter((r) => isText(r[props.x]));
  checkCategories(categories, props);
  const steps = stepsOf(props, stepProps);
  const auto = autoDomain(rows, steps);
  const domainAt = (p) => (validDomain(p.domain) ? [p.domain[0], p.domain[1]] : auto); // a step's own axis
  const domain = domainAt(props);
  const ticks = ticksOf(domain, props.format?.y, format);
  const fValue = format(props.format?.y || ",~r"); // value labels: as precise as the data
  const fCategory = props.format?.x ? format(props.format.x) : null;
  const noData = t("noData");

  const lower = props.interval?.lower;
  const upper = props.interval?.upper;
  const shown = Array.isArray(props.shown) ? new Set(props.shown.map(String)) : null;
  const made = categories.map((row, slot) => {
    const raw = row[props.x];
    const key = String(raw);
    const label = fCategory && typeof raw === "number" ? fCategory(raw) : key;
    const value = valueOf(row, props.y);
    const missing = value === null;
    const from = missing ? null : valueOf(row, props.from); // the "before" of a pair: nothing for a row with no estimate
    const [lo, hi] = [valueOf(row, lower), valueOf(row, upper)];
    const bounded = !missing && lo !== null && hi !== null; // a whisker needs a value and both bounds
    if (props.domain !== undefined && !missing && (value < domain[0] || value > domain[1])) {
      throw new Error(`estimate '${key}' (${value}) is outside \`domain\` [${domain[0]}, ${domain[1]}]`);
    }
    if (props.domain !== undefined && from !== null && (from < domain[0] || from > domain[1])) {
      throw new Error(`\`from\` of '${key}' (${from}) is outside \`domain\` [${domain[0]}, ${domain[1]}]`);
    }
    const text = missing ? "" : fValue(value);
    return {
      key, label, lines: [label], slot, value, from,
      lo: bounded ? lo : null, hi: bounded ? hi : null,
      shown: shown ? shown.has(key) : true,
      dim: props.highlight != null && String(props.highlight) !== key,
      text, missing,
      title: missing ? `${label}: ${noData}` : `${label}: ${from === null ? "" : `${fValue(from)} → `}${text}${bounded ? ` (${fValue(lo)} – ${fValue(hi)})` : ""}`,
    };
  });

  // The order: every category is ranked, shown or not, so a hidden one keeps its slot. An estimate's `value` is its
  // `y` and its `columns` its row; the errors are rank's.
  const byKey = new Map(made.map((r) => [r.key, r]));
  const order = rank(made.map((r, i) => ({ key: r.key, value: r.value, columns: categories[i] })), props.sort);
  const out = order.map((key, slot) => Object.assign(byKey.get(key), { slot }));

  // Margins from character counts (never measured text), over every step, so the plot keeps its size:
  // category labels left of the plot (wrapped to the room the plot leaves them), ticks and the value axis title
  // under it, the category axis title and a reference label above it, and half the widest tick label past either end (left too, whatever the category labels leave).
  const titled = (axis) => steps.some((p) => isText(p.axes?.[axis]));
  const lineH = font * 1.15;
  const top = Math.round(titled("x") || steps.some((p) => referenceOf(p)?.label) ? font * 1.9 : font * 0.6);
  const bottom = Math.round(titled("y") ? font * 3.6 : font * 1.9);
  const ph = Math.max(1, h - top - bottom);
  const maxChars = Math.max(4, Math.floor((w * 0.34 - font * 0.6) / charW));
  const maxLines = Math.max(1, Math.floor(ph / Math.max(1, out.length) / lineH));
  for (const r of out) r.lines = wrapLabel(r.label, maxChars, maxLines);
  const chars = Math.max(1, ...out.flatMap((r) => r.lines.map((l) => l.length)));
  const tickChars = Math.max(1, ...steps.flatMap((p) => ticksOf(domainAt(p), p.format?.y, format).map((k) => k.label.length)));
  const tickHalf = (tickChars * charW) / 2 + font * 0.2; // half the widest tick label, past either end of the axis
  const margin = {
    left: Math.round(Math.max(chars * charW + font * 0.6, tickHalf)),
    right: Math.round(Math.max(font * 0.6, tickHalf)),
    top,
    bottom,
  };
  const pw = Math.max(1, w - margin.left - margin.right);
  const reference = referenceOf(props);
  const drawn = reference && reference.value >= domain[0] && reference.value <= domain[1]; // past a given domain: not drawn
  return {
    w, h, font, charW, lineH, margin, pw, ph: Math.max(1, h - margin.top - margin.bottom),
    domain, ticks, rows: out,
    reference: drawn ? { key: `${reference.value}|${reference.label}`, ...reference } : null,
    origin: originOf(domain, reference),
    axes: { x: isText(props.axes?.x) ? String(props.axes.x) : "", y: isText(props.axes?.y) ? String(props.axes.y) : "" },
    noData,
  };
}
