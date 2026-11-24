// The parts of chart.line's series, shared by its final render and every frame of a played change: a series'
// pixel points cut at `until` and split at the forecast start into an observed part and a forecast part, the
// marks drawn from them, the dots, the forecast region, the ticker and the series labels placed from the same
// numbers; and the scales' pure parts (the y extent, the x ticks, the numeric-x check). Pure of the component's state:
// everything comes in as arguments.
import { d3 } from "../../core/d3.js";
import { splitAt, spread, band, dot, rule, halo } from "../../core/chart.js";
import { cellValue } from "../../core/chart-layout.js";

const HOLLOW_GROWTH = 1.2; // a hollow (forecast) dot is a little larger than a filled one: its ring is thinner

/**
 * The y extent of the values `ys` before it is rounded to ticks: it always includes 0, so data that is all negative
 * ends at 0 and data that is all positive starts there. With no values, or only zeros, it is one unit up from 0.
 * @param {number[]} ys
 * @returns {[number, number]}
 */
export function yExtent(ys) {
  const lo = Math.min(0, d3.min(ys) ?? 0);
  const hi = Math.max(0, d3.max(ys) ?? 1);
  return [lo, lo < hi ? hi : lo + 1];
}

/**
 * The x tick values of `domain` for the x values `xs` of the data: d3's (about 6), and, when every x is a whole
 * number (years, days, counts), only the whole ones, so no tick is 1.5 or prints a year twice.
 * @param {[number, number]} domain
 * @param {number[]} xs
 * @returns {number[]}
 */
export function xTickValues(domain, xs) {
  const values = d3.scaleLinear().domain(domain).ticks(6);
  return xs.length && xs.every(Number.isInteger) ? values.filter(Number.isInteger) : values;
}

/**
 * Throws when the table has rows but its `x` column has no number in any of them (dates, month names): chart.line's
 * x axis is linear, so nothing could be drawn. A table with some numeric x draws those rows; an empty table is not
 * this function's business.
 * @param {Array<Record<string, unknown>>} rows
 * @param {{ data: string, x: string }} props
 */
export function checkX(rows, props) {
  if (rows.length && !rows.some((r) => cellValue(r, props.x) !== null)) {
    throw new Error(`chart.line needs a numeric \`x\`: column '${props.x}' of ${props.data} has no numbers (a date or a name is not a number: add a numeric column, such as the year)`);
  }
}

/**
 * `points` (pixels) cut at `at`: what lies at or before it, ending at the cut itself (`splitAt`'s boundary point,
 * with its x set to `at` exactly, so a later cut at the same place finds it on the cut and not a rounding error
 * beyond it). A point on `at` is kept once. Before the first point nothing is left; past the last, everything is.
 */
export function cutAt(points, at) {
  const { observed } = splitAt(points, at, (p) => p.px);
  const last = observed.at(-1);
  return last?.boundary ? [...observed.slice(0, -1), { ...last, px: at }] : observed;
}

/**
 * A series' points (pixels), cut at the sweep's `until` (pixels; null without a sweep), then split at the forecast
 * start `at` (pixels; null without a forecast): the observed part and the forecast part, which share the point at the
 * split (see `splitAt`). Without a forecast, everything is observed.
 */
export function partsOf(points, at, until = null) {
  const seen = until == null ? points : cutAt(points, until);
  return at == null ? { observed: seen, forecast: [] } : splitAt(seen, at, (p) => p.px);
}

/** `partsOf` of every series at once, by name: `pointsOf(series)` gives its points (tweened, in a frame). */
export const partsByName = (series, pointsOf, at, until) => new Map(series.map((s) => [s.name, partsOf(pointsOf(s), at, until)]));

export const lineD = d3.line().x((p) => p.px).y((p) => p.py);

/**
 * The `d` of a line over `points`. While the series is cut (`shaped`: a forecast or a sweep is set) a part keeps its
 * attribute, empty, when it has nothing to draw, and a part of fewer than 2 points draws nothing: a round-capped
 * path of one point would paint a dot. Without a cut a series draws as it always did.
 */
export const lineAttr = (points, shaped) => (shaped ? (points.length >= 2 ? lineD(points) : "") : lineD(points));

/** The `d` of an interval band over `points`, with the same rule as `lineAttr`. */
export const bandAttr = (points, shaped) => (shaped ? (points.length >= 2 ? band(points) ?? "" : "") : band(points));

/** The series that have a forecast line (and band): two or more points after the cut. */
export const forecastSeries = (m) => (m.forecast ? m.series.filter((s) => partsOf(s.points, m.forecast.at).forecast.length >= 2) : []);

/** The series that have a label: all of them, but while the sweep stands before a line's first point. */
export const labelled = (m) => (m.hasSeriesLabels ? m.series.filter((s) => s.label) : []);

/** One dot per data point of every shown series up to the sweep's cut (never the boundary point of a cut), while `points` is on. */
export const dotData = (m) =>
  m.showPoints
    ? m.series.flatMap((s) =>
        s.points
          .filter((p) => m.cut == null || p.px <= m.cut)
          .map((p) => ({ key: p.key, series: s.name, px: p.px, py: p.py, dimmed: s.dimmed, paint: s.paint })),
      )
    : [];

/** The dots at positions `pos(d)` (pixels), hollow past the forecast start `at`, painted `paint(d)`. */
export function placeDots(sel, m, pos, at, paint) {
  const r = m.font * 0.22;
  const hollow = (d) => at != null && pos(d).px > at;
  sel.attr("cx", (d) => pos(d).px).attr("cy", (d) => pos(d).py);
  dot(sel, { r: (d) => (hollow(d) ? r * HOLLOW_GROWTH : r), color: paint, hollow });
}

/**
 * The forecast's region and divider in `plot` for the scales x, y and the forecast start `at` (pixels, which a played
 * change interpolates). The region runs from the divider to the plot's end, or to the sweep's cut `until` (pixels)
 * when that comes first: it is revealed as the sweep passes the divider.
 */
export function placeForecast(plot, m, at, x, y, until = null) {
  const [x0, x1] = x.range();
  const edge = Math.min(Math.max(at, x0), x1);
  const end = until == null ? x1 : Math.min(Math.max(until, edge), x1);
  const g = plot.select("g.sd-forecast:not(.sd-exiting)");
  g.select("rect.sd-forecast-region").attr("x", edge).attr("y", 0).attr("width", end - edge).attr("height", y.range()[0]);
  // Near the plot's end the label sits before the divider (right-aligned), else after it.
  const flip = edge > x0 + (x1 - x0) * 0.8;
  const ph = y.range()[0];
  const divider = g.select("g.sd-forecast-divider");
  rule(divider, { x1: edge, y1: flip ? ph : 0, x2: edge, y2: flip ? 0 : ph, label: m.forecast.label, anchor: flip ? "end" : "start" });
  halo(divider.select("text.sd-rule-label")).attr("y", m.font * 0.9).attr("dy", null); // inside the plot, like an annotation's label
}

/** Writes the ticker's place and `text` (its box is `m.ticker`; the size and colour come from the CSS). */
export function placeTicker(plot, m, text) {
  plot.select("text.sd-ticker:not(.sd-exiting)").attr("x", m.ticker.x).attr("y", m.ticker.y).attr("dominant-baseline", "hanging").text(text);
}

/**
 * Where each series' label goes, by name: `{ x, y }` in plot pixels, or null for a series with nothing to label.
 * `series` is `[{ name, points }]` (pixels, in x order). Without a sweep (`cut` null) every label sits in the right
 * margin at the height of its line's last point, as it always did, so a series with no points still has one (at the
 * top). With one, a label sits just after its line's visible end, the last point at or before `cut`, never past the
 * plot's right edge, and a series with no visible point has none. The labels are spread so they never overlap and never
 * pass the plot's bottom. `avoid` (`{ right, bottom }`, the ticker's box, when there is one) keeps a label that starts
 * left of `right` below `bottom`.
 */
export function labelSpots(series, { font, pw, ph, cut = null, avoid = null }) {
  const ends = series.map((s) => (cut == null ? s.points : cutAt(s.points, cut)).at(-1));
  const spots = new Map(series.map((s) => [s.name, cut == null ? { x: pw + font * 0.4, y: 0 } : null]));
  // Every point has a finite place: the model leaves out a row without a numeric x or y (buildModel in ./index.js).
  const have = series.map((s, i) => i).filter((i) => ends[i]);
  const xOf = (i) => (cut == null ? pw + font * 0.4 : Math.min(ends[i].px, pw) + font * 0.4);
  const wanted = have.map((i) => (avoid && xOf(i) < avoid.right ? Math.max(ends[i].py, avoid.bottom) : ends[i].py));
  const ys = spread(wanted, font * 1.15, [-Infinity, ph]);
  have.forEach((i, k) => spots.set(series[i].name, { x: xOf(i), y: ys[k] }));
  return spots;
}
