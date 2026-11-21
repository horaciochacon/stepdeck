// chart.points: the model, data and props to plain data. No DOM: it runs in Node (test/unit/chart-points.test.mjs).
//
// pointsModel(rows, props, { stepProps, font, charW, w, h, format, t }) ->
//   { w, h, font, charW, lineH, margin, pw, ph, domain, ticks, rows, reference, origin, axes, noData }
//   rows       one per category, in display order:
//              { key, label, lines, slot, value, lo, hi, shown, dim, text, title, missing }
//   reference  { key, value, label }, or null without one or when it is past a given `domain` (it is not drawn);
//              `origin` is the value rows grow out from
//   margin     { left, right, top, bottom } around the plot (pw x ph), rounded as `frame` rounds them
// `format(spec)` gives a formatter (ctx.format) and `t(key)` an engine string (ctx.t).
//
// The value domain is `domain` as given, else the extent of `y` and the interval columns of every step's props
// (`stepProps`, null entries skipped; steps that read another file do not count) plus every step's `reference`,
// rounded outward to ticks; zero is not forced. The margins come from character counts and from every step too
// (its titles, its reference label, the tick labels of its own axis), so nothing that appears later resizes the plot. A missing value is never zero:
// it gives `missing: true` and no value.
import { d3 } from "../../core/d3.js";
import { extentOf, wrapLabel } from "../../core/chart-layout.js";

const REF = Symbol("reference"); // the column of the pseudo-rows that carry reference values into extentOf

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

/** The value columns one step's props draw: `y` and the interval bounds. */
export const valueColumns = (p) => [p.y, p.interval?.lower, p.interval?.upper].filter((c) => typeof c === "string" && c !== "");

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

/** The domain of a step without `domain`: every step's columns and references, niced. */
function autoDomain(rows, steps) {
  const columns = [...new Set(steps.flatMap(valueColumns))];
  const refs = steps.map(referenceOf).filter(Boolean).map((r) => ({ [REF]: r.value }));
  return d3.scaleLinear().domain(extentOf([...rows, ...refs], [...columns, REF])).nice(5).domain();
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
  const out = categories.map((row, slot) => {
    const raw = row[props.x];
    const key = String(raw);
    const label = fCategory && typeof raw === "number" ? fCategory(raw) : key;
    const value = valueOf(row, props.y);
    const missing = value === null;
    const [lo, hi] = [valueOf(row, lower), valueOf(row, upper)];
    const bounded = !missing && lo !== null && hi !== null; // a whisker needs a value and both bounds
    if (props.domain !== undefined && !missing && (value < domain[0] || value > domain[1])) {
      throw new Error(`estimate '${key}' (${value}) is outside \`domain\` [${domain[0]}, ${domain[1]}]`);
    }
    const text = missing ? "" : fValue(value);
    return {
      key, label, lines: [label], slot, value,
      lo: bounded ? lo : null, hi: bounded ? hi : null,
      shown: shown ? shown.has(key) : true,
      dim: props.highlight != null && String(props.highlight) !== key,
      text, missing,
      title: missing ? `${label}: ${noData}` : `${label}: ${text}${bounded ? ` (${fValue(lo)} – ${fValue(hi)})` : ""}`,
    };
  });

  // Margins from character counts (never measured text), over every step, so the plot keeps its size:
  // category labels left of the plot (wrapped to the room the plot leaves them), ticks and the value axis title
  // under it, the category axis title and a reference label above it, and half the widest tick label past its right end.
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
  const margin = {
    left: Math.round(chars * charW + font * 0.6),
    right: Math.round(Math.max(font * 0.6, (tickChars * charW) / 2 + font * 0.2)),
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
