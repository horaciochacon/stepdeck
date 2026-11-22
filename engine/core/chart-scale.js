// Colour scales for charts and maps, and the legend rows that describe them. `colorScale` turns a few props
// (`classes`, `midpoint`, `domain`, `log`, `categories`, `color`) and the theme's palettes into `color(value)` and a
// plain-data legend; `legendRow` draws that legend as a row of DOM. One scale serves every layer that shows values
// (a choropleth, a raster, a heatmap), so they all read the same palette the same way. The class arithmetic is in
// ./chart-layout.js and the extent rules are `extentOf`'s.
import { d3 } from "./d3.js";
import { extentOf, classIndex, classLabels, numberOf } from "./chart-layout.js";

/** The number of colour stops in a ramp legend. */
const RAMP_STOPS = 9;

/** The position `t` (0..1) on the palette of class `i` of `n`: even steps, or, with `below` classes under a midpoint, one half of the palette for each side of it. */
function classPosition(i, n, below) {
  if (below === undefined) return n > 1 ? i / (n - 1) : 0;
  if (i < below) return (0.5 * i) / below;
  const above = n - below;
  return 1 - (0.5 * (above - 1 - (i - below))) / above;
}

/**
 * The ends of a ramp. An explicit `spec.domain` is used as given, except that a zero-width one is a single value v:
 * `[v, v + 1]` (`[v, 10 v]` for `log`). Without one, the extent of `spec.values` (`extentOf`'s rules), made symmetric
 * about `midpoint` when it has one (in ratio for `log`).
 */
function rampDomain(spec) {
  const mid = spec.midpoint;
  let [lo, hi] = spec.domain ?? extentOf((spec.values ?? []).map((v) => ({ v })), ["v"]);
  if (spec.log && !(lo > 0 && hi > 0 && (mid === undefined || mid > 0))) throw new Error("`log` needs a domain above 0");
  if (spec.domain && lo === hi) hi = spec.log ? lo * 10 : lo + 1;
  else if (!spec.domain && mid !== undefined) {
    if (spec.log) {
      const r = Math.max(mid / lo, hi / mid);
      [lo, hi] = [mid / r, mid * r];
    } else {
      const r = Math.max(Math.abs(lo - mid), Math.abs(hi - mid));
      [lo, hi] = [mid - r, mid + r];
    }
  }
  return [lo, hi];
}

/**
 * A colour scale. `spec` is `{ classes?, midpoint?, domain?, log?, categories?, color?, values? }`; `palettes` is
 * `{ sequential, diverging, categorical }` (`ctx.palette` objects); `format` writes a number in a legend label.
 * - `categories` (kind `"categories"`): colours from the categorical palette in order; more categories than colours
 *   is an error. One category with `color` is a mask, coloured `color`.
 * - `classes` (kind `"steps"`): the breaks of stepped classes, sampled evenly along the sequential palette, or along
 *   the diverging one when `midpoint` (one of the breaks) is set: classes below it fill the first half, above it the second.
 * - otherwise (kind `"ramp"`): a continuous ramp over `domain`, else the extent of `values` (one value v: `[v, v + 1]`,
 *   none: `[0, 1]`); `log` places values by their logarithm (the domain must be above 0); with `midpoint` the
 *   diverging palette: a `domain` is used as given and runs lo, midpoint, hi through t 0, 0.5, 1 (linear on each arm,
 *   in the logarithm for `log`); a domain read from `values` is made symmetric about the midpoint.
 * `color(value)` is `null` for a missing value (a blank string is missing, never 0), a value outside the categories, or (log) a value that is not above 0.
 * `legend` is `{ kind: "steps" | "categories", items: [{ color, label }] }` or `{ kind: "ramp", stops, labels: [lo, hi] }`.
 * @param {{ classes?: number[], midpoint?: number, domain?: [number, number], log?: boolean, categories?: unknown[], color?: string, values?: unknown[] }} spec
 * @param {{ sequential: { colors: string[] }, diverging: { colors: string[] }, categorical: { colors: string[] } }} palettes
 * @param {{ format?: (value: number) => string }} [options]
 * @returns {{ kind: "steps" | "ramp" | "categories", color: (value: unknown) => string | null, legend: object }}
 */
export function colorScale(spec, palettes, { format = String } = {}) {
  const palette = (kind) => {
    if (!palettes?.[kind]?.colors?.length) throw new Error(`no ${kind} palette to colour from`);
    return palettes[kind].colors;
  };

  if (spec.categories) {
    const names = spec.categories.map(String);
    const mask = names.length === 1 && spec.color !== undefined;
    const colors = mask ? [spec.color] : palette("categorical");
    if (names.length > colors.length) throw new Error(`${names.length} categories but the palette has ${colors.length} colours`);
    const items = names.map((label, i) => ({ color: colors[i], label }));
    return {
      kind: "categories",
      color: (v) => (v === null || v === undefined ? null : items[names.indexOf(String(v))]?.color ?? null),
      legend: { kind: "categories", items },
    };
  }

  const mid = spec.midpoint;
  const interpolate = d3.piecewise(d3.interpolateLab, palette(mid === undefined ? "sequential" : "diverging"));

  if (spec.classes) {
    const breaks = spec.classes;
    const n = breaks.length + 1;
    let below;
    if (mid !== undefined) {
      const at = breaks.indexOf(mid);
      if (at < 0) throw new Error(`\`midpoint\` must be one of \`classes\` (${breaks.join(", ")})`);
      below = at + 1;
    }
    const colors = Array.from({ length: n }, (_, i) => interpolate(classPosition(i, n, below)));
    const labels = classLabels(breaks, format);
    return {
      kind: "steps",
      color: (v) => {
        const i = classIndex(v, breaks);
        return i === null ? null : colors[i];
      },
      legend: { kind: "steps", items: colors.map((color, i) => ({ color, label: labels[i] })) },
    };
  }

  const [lo, hi] = rampDomain(spec);
  const place = spec.log ? Math.log : (v) => v;
  const [p0, p1] = [place(lo), place(hi)];
  const pm = mid === undefined ? undefined : place(mid);
  const arm = (x, from, to) => Math.min(1, Math.max(0, (x - from) / (to - from)));
  const position = (x) => {
    if (pm === undefined) return arm(x, p0, p1);
    if (x <= pm) return p0 < pm ? 0.5 * arm(x, p0, pm) : x === pm ? 0.5 : 0; // a midpoint at or below the low end has no lower arm
    return p1 > pm ? 0.5 + 0.5 * arm(x, pm, p1) : 1;
  };
  return {
    kind: "ramp",
    color: (v) => {
      const n = numberOf(v);
      const x = n === null ? NaN : place(n);
      return Number.isFinite(x) ? interpolate(position(x)) : null;
    },
    legend: {
      kind: "ramp",
      stops: Array.from({ length: RAMP_STOPS }, (_, i) => interpolate(i / (RAMP_STOPS - 1))),
      labels: [format(lo), format(hi)],
    },
  };
}

/**
 * One legend row, detached: `div.sd-legend-row` with the `title`, then the swatches of a steps or categories legend
 * (`span.sd-legend-item` holding a `span.sd-legend-swatch` and its label) or a ramp (low label, `span.sd-legend-ramp`
 * gradient, high label), then, when `noData` is set, the swatch `.sd-legend-nodata` labelled `t("noData")`. The theme
 * styles the classes; only the colours of the scale are written inline.
 * @param {Document} doc
 * @param {{ kind: string, items?: Array<{ color: string, label: string }>, stops?: string[], labels?: string[] }} legend
 * @param {{ title?: string, noData?: boolean, t: (key: string) => string }} options
 * @returns {HTMLElement}
 */
export function legendRow(doc, legend, { title, noData, t }) {
  const make = (tag, className, text) => {
    const node = doc.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const item = (label, swatchClass, color) => {
    const node = make("span", "sd-legend-item");
    const swatch = make("span", swatchClass);
    if (color) swatch.style.backgroundColor = color;
    node.append(swatch, make("span", "sd-legend-label", label));
    return node;
  };
  const row = make("div", "sd-legend-row");
  if (title) row.append(make("span", "sd-legend-title", title));
  if (legend.kind === "ramp") {
    const ramp = make("span", "sd-legend-ramp");
    ramp.style.backgroundImage = `linear-gradient(to right, ${legend.stops.join(", ")})`;
    row.append(make("span", "sd-legend-label", legend.labels[0]), ramp, make("span", "sd-legend-label", legend.labels[1]));
  } else for (const { color, label } of legend.items) row.append(item(label, "sd-legend-swatch", color));
  if (noData) row.append(item(t("noData"), "sd-legend-swatch sd-legend-nodata"));
  return row;
}
