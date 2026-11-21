// The parts of chart.line's series, shared by its final render and every frame of a played change: a series'
// pixel points cut into an observed part and a forecast part, the marks drawn from them, and the dots and the
// forecast region placed from the same numbers. Pure of the component's state: everything comes in as arguments.
import { d3 } from "../../core/d3.js";
import { splitAt, band, dot, rule, halo } from "../../core/chart.js";

const HOLLOW_GROWTH = 1.2; // a hollow (forecast) dot is a little larger than a filled one: its ring is thinner

/**
 * A series' points (pixels) cut at the forecast start `at` (pixels; null without a forecast): the observed part
 * and the forecast part, which share the point at the cut (see `splitAt`). Without a forecast, everything is observed.
 */
export const partsOf = (points, at) => (at == null ? { observed: points, forecast: [] } : splitAt(points, at, (p) => p.px));

/** A path's `d`, with "" in place of null when `keep`, so a part that becomes empty keeps its attribute (and its place in the markup). */
export const dOr = (d, keep) => d ?? (keep ? "" : null);

export const lineD = d3.line().x((p) => p.px).y((p) => p.py);

/** The series that have a forecast line (and band): two or more points after the cut. */
export const forecastSeries = (m) => (m.forecast ? m.series.filter((s) => partsOf(s.points, m.forecast.at).forecast.length >= 2) : []);

/** One dot per data point of every shown series (never the boundary point of a cut), while `points` is on. */
export const dotData = (m) =>
  m.showPoints
    ? m.series.flatMap((s) => s.points.filter((p) => Number.isFinite(p.px) && Number.isFinite(p.py)).map((p) => ({ key: p.key, series: s.name, px: p.px, py: p.py, dimmed: s.dimmed, paint: s.paint })))
    : [];

/** The dots at positions `pos(d)` (pixels), hollow past the forecast start `at`, painted `paint(d)`. */
export function placeDots(sel, m, pos, at, paint) {
  const r = m.font * 0.22;
  const hollow = (d) => at != null && pos(d).px > at;
  sel.attr("cx", (d) => pos(d).px).attr("cy", (d) => pos(d).py);
  dot(sel, { r: (d) => (hollow(d) ? r * HOLLOW_GROWTH : r), color: paint, hollow });
}

/** The forecast's region and divider in `plot` for the scales x, y and the forecast start `at` (pixels, which a played change interpolates). */
export function placeForecast(plot, m, at, x, y) {
  const [x0, x1] = x.range();
  const edge = Math.min(Math.max(at, x0), x1);
  const g = plot.select("g.sd-forecast:not(.sd-exiting)");
  g.select("rect.sd-forecast-region").attr("x", edge).attr("y", 0).attr("width", x1 - edge).attr("height", y.range()[0]);
  // Near the plot's end the label sits before the divider (right-aligned), else after it.
  const flip = edge > x0 + (x1 - x0) * 0.8;
  const ph = y.range()[0];
  const divider = g.select("g.sd-forecast-divider");
  rule(divider, { x1: edge, y1: flip ? ph : 0, x2: edge, y2: flip ? 0 : ph, label: m.forecast.label, anchor: flip ? "end" : "start" });
  halo(divider.select("text.sd-rule-label")).attr("y", m.font * 0.9).attr("dy", null); // inside the plot, like an annotation's label
}
