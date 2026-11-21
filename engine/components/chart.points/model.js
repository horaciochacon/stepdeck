// chart.points: the model, data and props to plain data. No DOM: it runs in Node (test/unit/chart-points.test.mjs).
//
// pointsModel(rows, props, { stepProps, font, charW, w, h, format, t }) ->
//   { w, h, font, charW, lineH, margin, room, pw, ph, domain, ticks, rows, reference, origin, axes, noData,
//     strips, summary, focus }
//   rows       one per category, in display order (`sort`; the data order without it):
//              { key, label, lines, slot, value, from, lo, hi, shown, dim, text, title, missing }
//              `slot` is the place in that order; a hidden category has its slot too; `from` is the "before" of a
//              pair (the hollow dot), null without a `from` column, for an empty cell and for a row without a value
//   strips     true with `id`: each row of the data is one point and a category is a strip. A strip also has
//              `points` ([{ id, value, dy, focus, dim }], the drawn ones, in data order: a value inside the
//              domain; `dy` is the beeswarm offset from `swarm`, in pixels), `summary` (where its tick is drawn:
//              the median or the mean of every value, null for `summary: "none"`, for no value and outside a given
//              domain) and `overflow` ({ low, high }: how many values lie past a given domain's ends). Its `value`
//              is what `sort` ranks it by (the summary, the median for "none"); `from`, `lo` and `hi` are null.
//   summary    "median" | "mean" | "none" in strips; `focus` the followed id, or null
//   reference  { key, value, label }, or null without one or when it is past a given `domain` (it is not drawn);
//              `origin` is the value rows grow out from
//   margin     { left, right, top, bottom } around the plot (pw x ph), rounded as `frame` rounds them; `room`
//              { low, high } is the width kept for the overflow boxes at each end of the plot (0 without them)
// `format(spec)` gives a formatter (ctx.format) and `t(key)` an engine string (ctx.t).
//
// The value domain is `domain` as given, else the extent of every step's `y`, `from` and interval columns
// (`stepProps`, null entries skipped; steps that read another file do not count) plus every step's `reference`,
// rounded outward to ticks; zero is not forced. Only what can be drawn counts: rows with a category, and the
// interval bounds of a row that has an estimate at that step (with both bounds, as a whisker needs); in strips,
// every point with an id (`from` and `interval` are not drawn there). `sort` orders the rows through `rank`, a
// `{ by }` column read by `sortColumns` (both core/chart-layout.js), and changes nothing else: not the domain, the
// margins nor any row's data. The margins come from character counts and from every step too (its titles, its
// reference label, the tick labels of its own axis, its overflow boxes), so nothing that appears later resizes the
// plot. Cells are read by `cellValue`: a missing value (an empty or blank cell, or text) is never zero: it gives
// `missing: true` and no value (a strip with no value at all is `missing`).
import { d3 } from "../../core/d3.js";
import { extentOf, rank, wrapLabel, swarm, cellValue, sortColumns } from "../../core/chart-layout.js";

const isText = (v) => v != null && String(v) !== "";
const validDomain = (d) => Array.isArray(d) && d.length === 2 && d.every((v) => Number.isFinite(v)) && d[0] < d[1];
const isStrips = (p) => isText(p?.id); // `id` names the point column: one row per point, a strip per category

/** The band of a row, the radius of a dot and the length of a whisker's caps, from the label font and the plot height. */
export function sizesOf({ ph, rows, font }) {
  const band = ph / Math.max(1, rows.length);
  return { band, r: Math.max(4, Math.min(font * 0.35, band * 0.3)), cap: Math.max(4, Math.min(font * 0.8, band * 0.5)) };
}

/** The text of an overflow box: the count with an arrow pointing past that end of the axis. */
export const overflowText = (side, n) => (side === "low" ? `‹ ${n}` : `${n} ›`);
/** The width of an overflow box for a count, from character counts (never measured text). */
export const overflowWidth = (n, font, charW) => overflowText("high", n).length * charW + font * 0.6;
/** The gap between an overflow box and the plot, as a share of the font size: clear of a dot on the axis end. */
export const OVERFLOW_GAP = 0.5;

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
 * interval); in strips, the value of every row with an id. Its reference counts too.
 */
function autoDomain(rows, steps) {
  const values = [];
  for (const p of steps) {
    const strip = isStrips(p);
    for (const row of rows) {
      if (!isText(row[p.x]) || (strip && !isText(row[p.id]))) continue;
      if (strip) {
        const y = cellValue(row, p.y);
        if (y !== null) values.push(y);
        continue;
      }
      const [y, from, lo, hi] = [p.y, p.from, p.interval?.lower, p.interval?.upper].map((c) => cellValue(row, c));
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

/**
 * Checks the categories, the names in `shown` and `highlight` and the `focus` id, and returns the category keys in
 * data order. A category appears once, or, in strips, once per id. Throws naming the category or the id.
 */
function checkCategories(categories, props) {
  const strips = isStrips(props);
  const keys = [];
  const seen = new Set();
  const ids = new Map(); // category -> its ids (strips)
  for (const row of categories) {
    const key = String(row[props.x]);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
      ids.set(key, new Set());
    } else if (!strips) throw new Error(`category '${key}' appears more than once in ${props.data} (chart.points needs one row per category, or \`id\` for strips)`);
    if (strips) {
      const id = String(row[props.id]);
      if (ids.get(key).has(id)) throw new Error(`id '${id}' appears more than once in category '${key}' of ${props.data}`);
      ids.get(key).add(id);
    }
  }
  const named = [["shown", Array.isArray(props.shown) ? props.shown : []], ["highlight", props.highlight == null ? [] : [props.highlight]]];
  for (const [prop, list] of named) {
    for (const id of list) {
      if (!seen.has(String(id))) throw new Error(`category '${id}' in \`${prop}\` not found in ${props.data} (categories: ${keys.join(", ")})`);
    }
  }
  if (props.focus != null && ![...ids.values()].some((set) => set.has(String(props.focus)))) {
    throw new Error(`\`focus\` id '${props.focus}' not found in ${props.data}`);
  }
  return keys;
}

const STATS = { median: d3.median, mean: d3.mean };

/**
 * The strips of `categories` (rows with a category and an id), one per key in data order, with the column values
 * `sort: { by }` reads (`sortColumns` over every row of the table, `rows`): a number column reduced over the strip's
 * rows as the summary is (the median for "none"), a text column the text all of them have.
 * Points, overflow and summary as the header of this file says; `dy` is set later, once the plot is sized.
 */
function stripRows(rows, categories, keys, props, { domain, given, fValue, fCategory, noData, kind, shown }) {
  const stat = STATS[kind] ?? d3.median;
  const focus = props.focus == null ? null : String(props.focus);
  const of = new Map(keys.map((k) => [k, []]));
  for (const row of categories) of.get(String(row[props.x])).push(row);
  const reduce = (values) => {
    const known = values.filter((v) => v !== null);
    return known.length ? stat(known) : null;
  };
  const columns = sortColumns(rows, keys.map((k) => of.get(k)), reduce);
  return keys.map((key, slot) => {
    const members = of.get(key);
    const raw = members[0][props.x];
    const label = fCategory && typeof raw === "number" ? fCategory(raw) : key;
    const values = members.map((row) => cellValue(row, props.y)).filter((v) => v !== null);
    const missing = values.length === 0;
    const value = missing ? null : stat(values) ?? null;
    const overflow = { low: 0, high: 0 };
    const dim = props.highlight != null && String(props.highlight) !== key;
    const points = [];
    for (const row of members) {
      const v = cellValue(row, props.y);
      if (v === null) continue; // an empty cell is never a point
      if (given && v < domain[0]) overflow.low += 1;
      else if (given && v > domain[1]) overflow.high += 1;
      else {
        const id = String(row[props.id]);
        points.push({ id, value: v, dy: 0, focus: id === focus, dim: dim || (focus !== null && id !== focus) });
      }
    }
    const inside = value !== null && (!given || (value >= domain[0] && value <= domain[1]));
    const text = missing ? "" : fValue(value);
    const n = `(n = ${values.length})`;
    return {
      row: {
        key, label, lines: [label], slot, value, from: null, lo: null, hi: null,
        shown: shown ? shown.has(key) : true, dim, text, missing,
        title: missing ? `${label}: ${noData}` : kind === "none" ? `${label} ${n}` : `${label}: ${text} ${n}`,
        summary: kind !== "none" && inside ? value : null,
        points, overflow,
      },
      columns: columns[slot],
    };
  });
}

/**
 * The width kept at each end of the plot for the overflow boxes of every step: the widest box a step with strips
 * and a given `domain` draws there, plus its gap; 0 when no step has one.
 */
function overflowRoom(rows, steps, font, charW) {
  const most = { low: 0, high: 0 };
  for (const p of steps) {
    if (!isStrips(p) || !validDomain(p.domain)) continue;
    const counts = new Map();
    for (const row of rows) {
      if (!isText(row[p.x]) || !isText(row[p.id])) continue;
      const v = cellValue(row, p.y);
      const side = v === null ? null : v < p.domain[0] ? "low" : v > p.domain[1] ? "high" : null;
      if (!side) continue;
      const at = `${side}\n${row[p.x]}`;
      counts.set(at, (counts.get(at) ?? 0) + 1);
      most[side] = Math.max(most[side], counts.get(at));
    }
  }
  const width = (n) => (n > 0 ? overflowWidth(n, font, charW) + font * OVERFLOW_GAP : 0);
  return { low: width(most.low), high: width(most.high) };
}

/**
 * @param {Array<Record<string, unknown>>} rows the rows of `props.data`
 * @param {object} props the element's props at this step
 * @param {{ stepProps?: ReadonlyArray<object | null> | null, font?: number, charW?: number, w?: number, h?: number, format?: (spec: string) => (n: number) => string, t?: (key: string) => string }} [env]
 */
export function pointsModel(rows, props, { stepProps = null, font = 28, charW = font * 0.6, w = 1, h = 1, format = d3.format, t = (key) => key } = {}) {
  if (props.domain !== undefined && !validDomain(props.domain)) throw new Error("`domain` must be [min, max] with min < max");
  const strips = isStrips(props);
  const categories = rows.filter((r) => isText(r[props.x]) && (!strips || isText(r[props.id])));
  const keys = checkCategories(categories, props);
  const steps = stepsOf(props, stepProps);
  const auto = autoDomain(rows, steps);
  const domainAt = (p) => (validDomain(p.domain) ? [p.domain[0], p.domain[1]] : auto); // a step's own axis
  const domain = domainAt(props);
  const ticks = ticksOf(domain, props.format?.y, format);
  const fValue = format(props.format?.y || ",~r"); // value labels: as precise as the data
  const fCategory = props.format?.x ? format(props.format.x) : null;
  const noData = t("noData");
  const kind = strips ? (Object.hasOwn(STATS, props.summary ?? "") || props.summary === "none" ? props.summary : "median") : null;

  const lower = props.interval?.lower;
  const upper = props.interval?.upper;
  const shown = Array.isArray(props.shown) ? new Set(props.shown.map(String)) : null;
  // Each made entry is a row and the columns `sort: { by }` reads (`sortColumns`, core/chart-layout.js): an estimate's
  // own cells, a strip's reduced columns.
  const estimateColumns = strips ? null : sortColumns(rows, categories.map((row) => [row]));
  const made = strips
    ? stripRows(rows, categories, keys, props, { domain, given: props.domain !== undefined, fValue, fCategory, noData, kind, shown })
    : categories.map((row, slot) => {
      const raw = row[props.x];
      const key = String(raw);
      const label = fCategory && typeof raw === "number" ? fCategory(raw) : key;
      const value = cellValue(row, props.y);
      const missing = value === null;
      const from = missing ? null : cellValue(row, props.from); // the "before" of a pair: nothing for a row with no estimate
      const [lo, hi] = [cellValue(row, lower), cellValue(row, upper)];
      const bounded = !missing && lo !== null && hi !== null; // a whisker needs a value and both bounds
      if (props.domain !== undefined && !missing && (value < domain[0] || value > domain[1])) {
        throw new Error(`estimate '${key}' (${value}) is outside \`domain\` [${domain[0]}, ${domain[1]}]`);
      }
      if (props.domain !== undefined && from !== null && (from < domain[0] || from > domain[1])) {
        throw new Error(`\`from\` of '${key}' (${from}) is outside \`domain\` [${domain[0]}, ${domain[1]}]`);
      }
      const text = missing ? "" : fValue(value);
      return {
        row: {
          key, label, lines: [label], slot, value, from,
          lo: bounded ? lo : null, hi: bounded ? hi : null,
          shown: shown ? shown.has(key) : true,
          dim: props.highlight != null && String(props.highlight) !== key,
          text, missing,
          title: missing ? `${label}: ${noData}` : `${label}: ${from === null ? "" : `${fValue(from)} → `}${text}${bounded ? ` (${fValue(lo)} – ${fValue(hi)})` : ""}`,
        },
        columns: estimateColumns[slot],
      };
    });

  // The order: every category is ranked, shown or not, so a hidden one keeps its slot. An estimate's `value` is its
  // `y` and its `columns` its cells; a strip's are its summary (the median for "none") and its reduced columns. The
  // errors are rank's.
  const byKey = new Map(made.map(({ row }) => [row.key, row]));
  const order = rank(made.map(({ row, columns }) => ({ key: row.key, value: row.value, columns })), props.sort);
  const out = order.map((key, slot) => Object.assign(byKey.get(key), { slot }));

  // Margins from character counts (never measured text), over every step, so the plot keeps its size:
  // category labels left of the plot (wrapped to the room the plot leaves them), ticks and the value axis title
  // under it, the category axis title and a reference label above it, half the widest tick label past either end
  // (left too, whatever the category labels leave), and the overflow boxes at either end of the rows (on the left,
  // between the labels and the plot).
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
  const room = overflowRoom(rows, steps, font, charW);
  const margin = {
    left: Math.round(Math.max(chars * charW + font * 0.6 + room.low, tickHalf)),
    right: Math.round(Math.max(font * 0.6, tickHalf, room.high + (room.high ? font * 0.2 : 0))),
    top,
    bottom,
  };
  const pw = Math.max(1, w - margin.left - margin.right);

  // The beeswarm: each strip's points packed by `swarm` over their x pixels, within the row band.
  if (strips) {
    const { band, r } = sizesOf({ ph, rows: out, font });
    const px = (v) => ((v - domain[0]) / (domain[1] - domain[0])) * pw;
    for (const strip of out) {
      const dys = swarm(strip.points.map((q) => px(q.value)), { r, maxDy: band / 2 - r });
      strip.points.forEach((q, i) => {
        q.dy = dys[i];
      });
    }
  }
  const reference = referenceOf(props);
  const drawn = reference && reference.value >= domain[0] && reference.value <= domain[1]; // past a given domain: not drawn
  return {
    w, h, font, charW, lineH, margin, room, pw, ph,
    domain, ticks, rows: out,
    reference: drawn ? { key: `${reference.value}|${reference.label}`, ...reference } : null,
    origin: originOf(domain, reference),
    axes: { x: isText(props.axes?.x) ? String(props.axes.x) : "", y: isText(props.axes?.y) ? String(props.axes.y) : "" },
    noData,
    strips, summary: kind, focus: strips && props.focus != null ? String(props.focus) : null,
  };
}
