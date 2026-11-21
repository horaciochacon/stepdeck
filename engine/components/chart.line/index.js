// Built-in `chart.line`: one line per series over a numeric x, with direct series labels, optional
// highlight, vertical annotations, an interval band, point markers and a forecast segment.
//
// Rendering is a pure function of props: every update ends by writing the target state directly
// (renderStatic), so the DOM after settled() is the same whether a state was jumped to or played.
// With info.animate the component first morphs from the previous state to the target with its own
// keyed joins (series by name, points by series+x, ticks by value, annotations by x), driven by
// ctx.animate helpers bound to info.signal, so an abort snaps straight to the end state.
//
// The chart owns its entrance (`"x-enter": "own"` in schema.json). With info.entrance.motion "draw" its
// lines draw along their length over info.entrance.duration, else 2 x --sd-duration, while the box stays
// still; axes, labels and bands show at once. The undrawn lines are written before the first await, in the
// same task as the engine shows the element, so the chart never paints drawn first. Any other entrance
// ("none", or a box motion) renders the end state at once.
//
// `highlight` turns the other series to the theme's --sd-color-dim (lines and bands keep opacity 1, their
// labels turn muted) and draws the highlighted one after (above) them; the colors tween over --sd-duration-fast,
// apart from the morph of the geometry.
//
// Colors come from ctx.palette("categorical") in data order (first appearance of each series), so a
// series keeps its color whichever series are shown. A palette color only promises 3:1 against the
// background (enough for a line), so a series label is drawn in the same color darkened (lightened
// on a dark background) until it reaches 4.5:1, the contrast `check` requires of text (textColor in
// core/color.js, which text badges use too).
//
// `points` puts a dot on every data point. `forecast.from` cuts every series at an x value (core/chart.js `splitAt`, in
// pixels): the observed part keeps the solid line and the band, the forecast part is a dotted line, a lighter band and
// hollow dots, over a shaded region from a labelled divider to the plot's end. The cut adds a boundary point, shared by
// both parts, so the solid line ends exactly where the dotted one starts. Every part is derived from a series' points
// by `partsOf`, in the final state and in every frame of a played change alike. Both props fade in and out with the
// element's morph, and their markup exists only while they are set.
// Text sizes come from theme tokens via CSS (core/stepdeck.css); the token values are only read
// here to size the margins.
import { d3 } from "../../core/d3.js";
import { loadTable, tickFormat, frame, keyed, settle, spread, band, morph, entrance, undraw } from "../../core/chart.js";
import { partsOf, dOr, lineD, forecastSeries, dotData, placeDots, placeForecast } from "./parts.js";
import { textColor } from "../../core/color.js";
import { SVG_NS, lerp, motion, motionMs, focusPaint, tweenColor } from "../../core/kit.js";

const NO_SERIES = "all"; // series key when props.series is absent

const lerpArr = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

/** Loads the rows and checks every column the props name. Throws `column 'c' not found in <data>`. */
const loadRows = (props, ctx) =>
  loadTable(props, ctx, "chart.line", [
    ["x", props.x], ["y", props.y], ["series", props.series, true],
    ["interval.lower", props.interval?.lower, true], ["interval.upper", props.interval?.upper, true],
  ]);

/** The target state, in canvas pixels, computed from props alone. */
function buildModel(props, rows, ctx, el) {
  const valueOf = (row, col) => (row[col] == null || row[col] === "" ? null : Number(row[col]));
  const seriesOf = (row) => (props.series ? String(row[props.series]) : NO_SERIES);

  // Series in order of first appearance; colors follow that order.
  const order = [...new Set(rows.map(seriesOf))];
  const colors = ctx.palette?.("categorical")?.colors ?? [];
  const background = ctx.tokens?.["--sd-color-background"];
  const muted = ctx.tokens?.["--sd-color-muted"]?.trim() || null; // a value: var() does not work in a fill attribute
  const shown = new Set(Array.isArray(props.series_shown) ? props.series_shown.map(String) : order);

  const lower = props.interval?.lower;
  const upper = props.interval?.upper;
  const xs = rows.map((r) => valueOf(r, props.x)).filter((v) => v !== null);
  // The y domain covers every series in the data (not only the shown ones) so the axis does not
  // jump as series appear; it always includes 0.
  const ys = rows.flatMap((r) => [valueOf(r, props.y), lower ? valueOf(r, lower) : null, upper ? valueOf(r, upper) : null]).filter((v) => v !== null);
  const xDomain = xs.length ? d3.extent(xs) : [0, 1];
  if (xDomain[0] === xDomain[1]) xDomain[1] = xDomain[0] + 1;
  const yScale0 = d3.scaleLinear().domain([Math.min(0, d3.min(ys) ?? 0), Math.max(0, d3.max(ys) ?? 1) || 1]).nice(5);
  const yTickValues = yScale0.ticks(5);
  const xTickValues = d3.scaleLinear().domain(xDomain).ticks(6);
  const fy = tickFormat(ctx, props.format?.y, yTickValues);
  const fx = tickFormat(ctx, props.format?.x, xTickValues);
  const yTicks = yTickValues.map((v) => ({ value: v, label: fy(v) }));
  const xTicks = xTickValues.map((v) => ({ value: v, label: fx(v) }));

  // Fixed margins from character counts (not measured text), so layout never depends on font timing.
  const seriesList = order.filter((s) => shown.has(s));
  const labelChars = props.series ? Math.max(0, ...seriesList.map((s) => s.length)) : 0;
  const { w, h, font, margin, pw, ph } = frame(el, ctx, ({ font, charW }) => ({
    top: font * 2,
    left: Math.max(4, ...yTicks.map((t) => t.label.length)) * charW + font * 0.6,
    right: labelChars ? labelChars * charW + font : font,
    bottom: font * 3.4,
  }));
  const x = d3.scaleLinear().domain(xDomain).range([0, pw]);
  const y = yScale0.copy().range([ph, 0]);

  // The forecast start in pixels. At or past the plot's end there is no forecast part and no region, so no forecast.
  const from = props.forecast?.from;
  const at = from == null || from === "" ? NaN : x(Number(from));
  const forecast = Number.isFinite(at) && at < pw ? { at, label: props.forecast.label ?? ctx.t("forecast") } : null;

  const series = seriesList.map((name) => {
    const own = d3.sort(rows.filter((r) => seriesOf(r) === name && valueOf(r, props.x) !== null && valueOf(r, props.y) !== null), (r) => valueOf(r, props.x));
    const points = own.map((r) => {
      const xv = valueOf(r, props.x);
      const lo = lower ? valueOf(r, lower) : null;
      const hi = upper ? valueOf(r, upper) : null;
      return {
        key: `${name}|${xv}`,
        px: x(xv),
        py: y(valueOf(r, props.y)),
        lo: lo === null ? null : y(lo),
        hi: hi === null ? null : y(hi),
      };
    });
    const dimmed = props.highlight != null && String(props.highlight) !== name;
    const color = colors.length ? colors[order.indexOf(name) % colors.length] : null;
    return {
      name,
      color,
      dimmed,
      // A series out of focus turns to the theme's dim color (opacity stays 1) and is drawn below the focused ones.
      paint: focusPaint(ctx, color, dimmed),
      // Labels are text: their color changes, so a dimmed series' label switches to the muted text color.
      labelColor: dimmed && muted ? muted : colors.length ? textColor(color, background) : null,
      points,
    };
  });

  // Direct labels at each line's end, nudged apart so they never overlap and never pass the plot's bottom.
  // An end that is NaN (a non-numeric y cell) takes no part: its label keeps y NaN, and while one is present
  // the other labels are not lifted off the plot's bottom.
  const labelled = series.filter((s) => s.points.length);
  const placed = labelled.filter((s) => !Number.isNaN(s.points.at(-1).py));
  const lys = spread(placed.map((s) => s.points.at(-1).py), font * 1.15, [-Infinity, placed.length < labelled.length ? Infinity : ph]);
  const labelY = new Map(placed.map((s, i) => [s.name, lys[i]]));
  for (const s of series) s.ly = labelY.get(s.name) ?? (s.points.length ? NaN : 0);

  const annotations = (Array.isArray(props.annotate) ? props.annotate : [])
    .filter((a) => a && Number.isFinite(Number(a.x)))
    .map((a) => ({ key: String(Number(a.x)), x: Number(a.x), label: a.label == null ? "" : String(a.label) }));

  return {
    w, h, font, margin, pw, ph,
    xDomain: x.domain(), xRange: x.range(), yDomain: y.domain(), yRange: y.range(),
    xTicks, yTicks, series, annotations, forecast,
    showPoints: Boolean(props.points),
    hasSeriesLabels: Boolean(props.series),
    hasInterval: Boolean(lower && upper),
    axes: { x: props.axes?.x == null ? "" : String(props.axes.x), y: props.axes?.y == null ? "" : String(props.axes.y) },
  };
}

export default {
  async mount(el, props, ctx) {
    const doc = el.ownerDocument;
    const svg = d3.select(el).append(() => doc.createElementNS(SVG_NS, "svg")).attr("class", "sd-chart-line");
    const plot = svg.append("g").attr("class", "sd-plot");
    const gy = plot.append("g").attr("class", "sd-axis sd-axis-y");
    const gx = plot.append("g").attr("class", "sd-axis sd-axis-x");
    const gBands = plot.append("g").attr("class", "sd-bands");
    const gNotes = plot.append("g").attr("class", "sd-annotations");
    const gLines = plot.append("g").attr("class", "sd-lines");
    const gLabels = plot.append("g").attr("class", "sd-series-labels");
    const yTitle = svg.append("text").attr("class", "sd-axis-title sd-axis-title-y");
    // The x-axis title hangs from the svg's bottom edge (text-after-edge: the bottom of its line box), so its whole
    // line box stays inside the chart whatever the font's descent.
    const xTitle = svg.append("text").attr("class", "sd-axis-title sd-axis-title-x").attr("dominant-baseline", "text-after-edge");
    const baseline = gx.append("line").attr("class", "sd-axis-line");

    let last = null; // the last fully applied model
    await loadRows(props, ctx); // fail early (the controller shows the error) when a column is missing

    const scalesAt = (from, to, t) => ({
      x: d3.scaleLinear().domain(lerpArr(from.xDomain, to.xDomain, t)).range(lerpArr(from.xRange, to.xRange, t)),
      y: d3.scaleLinear().domain(lerpArr(from.yDomain, to.yDomain, t)).range(lerpArr(from.yRange, to.yRange, t)),
    });

    const byName = (d) => d.name;

    /** Keyed joins: brings the DOM's set of marks to the model's, marking leavers `.sd-exiting`. */
    function join(m) {
      const tickJoin = (g, ticks, cls) =>
        keyed(g.selectAll(`g.tick`), ticks, (d) => d.value, (enter) => {
          const t = enter.append("g").attr("class", `tick ${cls}`);
          if (cls === "sd-tick-y") t.append("line").attr("class", "sd-grid-line");
          t.append("text");
          return t;
        });
      tickJoin(gy, m.yTicks, "sd-tick-y");
      tickJoin(gx, m.xTicks, "sd-tick-x");
      keyed(gLines.selectAll("path.sd-line"), m.series, byName, (enter) => enter.append("path").attr("class", "sd-line").attr("data-series", byName));
      keyed(gLabels.selectAll("text.sd-series-label"), m.hasSeriesLabels ? m.series : [], byName, (enter) => enter.append("text").attr("class", "sd-series-label").attr("data-label", byName));
      keyed(gBands.selectAll("path.sd-band:not(.sd-band-forecast)"), m.hasInterval ? m.series : [], byName, (enter) => enter.append("path").attr("class", "sd-band").attr("data-band", byName));
      keyed(gBands.selectAll("path.sd-band-forecast"), m.hasInterval ? forecastSeries(m) : [], byName, (enter) => enter.append("path").attr("class", "sd-band sd-band-forecast").attr("data-band-forecast", byName));
      keyed(gNotes.selectAll("g.sd-annotation"), m.annotations, (d) => d.key, (enter) => {
        const g = enter.append("g").attr("class", "sd-annotation");
        g.append("line").attr("class", "sd-annotation-rule");
        g.append("text").attr("class", "sd-annotation-label");
        return g;
      });
      // Forecast: one group (the region, the divider, a dotted line per series) under everything, while `forecast` is set.
      const forecastG = keyed(plot.selectAll("g.sd-forecast"), m.forecast ? [m.forecast] : [], () => "forecast", (enter) => {
        const g = enter.append("g").attr("class", "sd-forecast");
        g.append("rect").attr("class", "sd-forecast-region");
        g.append("g").attr("class", "sd-forecast-divider");
        return g;
      });
      forecastG.lower();
      if (m.forecast) keyed(forecastG.selectAll("path.sd-forecast-line"), forecastSeries(m), byName, (enter) => enter.append("path").attr("class", "sd-forecast-line").attr("data-forecast", byName));
      // Points: one group of dots over the lines, while `points` is on.
      const pointsG = keyed(plot.selectAll("g.sd-points"), m.showPoints ? [m.showPoints] : [], () => "points", (enter) => enter.append("g").attr("class", "sd-points"));
      if (!pointsG.empty()) gLabels.node().before(pointsG.node());
      if (m.showPoints) keyed(pointsG.selectAll("circle.sd-dot"), dotData(m), (d) => d.key, (enter) => enter.append("circle").attr("class", "sd-dot").attr("data-series", (d) => d.series));
    }

    /** Draws the focused series after (above) the dimmed ones: the data order, with the dimmed first. */
    function stackFocus(m) {
      const focused = (d) => !d.dimmed;
      gLines.selectAll("path.sd-line:not(.sd-exiting)").data(m.series, byName).order().filter(focused).raise();
      gBands.selectAll("path.sd-band:not(.sd-band-forecast):not(.sd-exiting)").data(m.hasInterval ? m.series : [], byName).order().filter(focused).raise();
      gBands.selectAll("path.sd-band-forecast:not(.sd-exiting)").data(m.hasInterval ? forecastSeries(m) : [], byName).order().filter(focused).raise();
      plot.selectAll("g.sd-forecast path.sd-forecast-line:not(.sd-exiting)").data(forecastSeries(m), byName).order().filter(focused).raise();
      plot.selectAll("g.sd-points circle.sd-dot:not(.sd-exiting)").data(dotData(m), (d) => d.key).order().filter(focused).raise();
    }

    /** Writes the model exactly: the end state of every update, animated or not. */
    function renderStatic(m) {
      join(m);
      settle(svg); // leavers go, the leftovers of drawPath and fades too; what remains is seen (not entering) by a later change
      svg.attr("width", m.w).attr("height", m.h).attr("viewBox", `0 0 ${m.w} ${m.h}`);
      plot.attr("transform", `translate(${m.margin.left},${m.margin.top})`);
      const x = d3.scaleLinear().domain(m.xDomain).range(m.xRange);
      const y = d3.scaleLinear().domain(m.yDomain).range(m.yRange);
      placeMarks(m, x, y);
      const at = m.forecast?.at ?? null;
      const keep = at !== null; // with a forecast a part can be empty: it keeps an empty `d`, so the markup does not depend on the way here
      gLines.selectAll("path.sd-line").data(m.series, (d) => d.name)
        .attr("d", (d) => dOr(lineD(partsOf(d.points, at).observed), keep)).attr("stroke", (d) => d.paint);
      gBands.selectAll("path.sd-band:not(.sd-band-forecast)").data(m.hasInterval ? m.series : [], (d) => d.name)
        .attr("d", (d) => dOr(band(partsOf(d.points, at).observed), keep)).attr("fill", (d) => d.paint);
      gBands.selectAll("path.sd-band-forecast").data(m.hasInterval ? forecastSeries(m) : [], (d) => d.name)
        .attr("d", (d) => band(partsOf(d.points, at).forecast) ?? "").attr("fill", (d) => d.paint);
      if (m.forecast) {
        placeForecast(plot, m, at, x, y);
        plot.selectAll("g.sd-forecast path.sd-forecast-line").data(forecastSeries(m), (d) => d.name)
          .attr("d", (d) => lineD(partsOf(d.points, at).forecast)).attr("stroke", (d) => d.paint);
      }
      placeDots(plot.selectAll("g.sd-points circle.sd-dot").data(dotData(m), (d) => d.key), m, (d) => d, at, (d) => d.paint);
      stackFocus(m);
      gLabels.selectAll("text.sd-series-label").data(m.hasSeriesLabels ? m.series : [], (d) => d.name)
        .attr("x", m.pw + m.font * 0.4).attr("y", (d) => d.ly).attr("dy", "0.35em")
        .attr("fill", (d) => d.labelColor).text((d) => d.name)
        .attr("opacity", null).order();
      gNotes.selectAll("g.sd-annotation").data(m.annotations, (d) => d.key).order();
      gy.selectAll("g.tick").order();
      gx.selectAll("g.tick").order();
      baseline.raise();
    }

    /** Axes, titles and annotations for scales x, y (interpolated while animating). */
    function placeMarks(m, x, y, margin = m.margin) {
      const [x0, x1] = x.range();
      const ph = y.range()[0];
      gy.selectAll("g.tick").attr("transform", (d) => `translate(0,${y(d.value)})`);
      gy.selectAll("g.tick:not(.sd-exiting) text").text((d) => d.label);
      gy.selectAll("g.tick text").attr("x", -m.font * 0.4).attr("dy", "0.35em");
      gy.selectAll("g.tick line").attr("x1", x0).attr("x2", x1);
      gx.attr("transform", `translate(0,${ph})`);
      gx.selectAll("g.tick").attr("transform", (d) => `translate(${x(d.value)},0)`);
      gx.selectAll("g.tick:not(.sd-exiting) text").text((d) => d.label);
      gx.selectAll("g.tick text").attr("y", m.font * 0.5).attr("dy", "0.71em");
      baseline.attr("x1", x0).attr("x2", x1);
      yTitle.attr("x", margin.left - m.font * 0.4).attr("y", m.font).text(m.axes.y);
      xTitle.attr("x", margin.left + (x0 + x1) / 2).attr("y", margin.top + ph + m.margin.bottom).text(m.axes.x);
      gNotes.selectAll("g.sd-annotation").attr("transform", (d) => `translate(${x(d.x)},0)`);
      gNotes.selectAll("g.sd-annotation line").attr("y1", 0).attr("y2", ph);
      gNotes.selectAll("g.sd-annotation:not(.sd-exiting) text").text((d) => d.label);
      gNotes.selectAll("g.sd-annotation text").attr("x", m.font * 0.35).attr("y", m.font * 0.9)
        .attr("text-anchor", (d) => (x(d.x) > (x0 + x1) * 0.8 ? "end" : "start"))
        .attr("dx", (d) => (x(d.x) > (x0 + x1) * 0.8 ? -m.font * 0.7 : 0));
    }

    /** Plays `from` -> `to`: keyed by series+x, scales and ticks interpolate, leavers fade. */
    async function change(from, to, info) {
      const duration = motionMs(info, ctx, 2);
      const signal = info.signal;
      const { ease } = motion(info, ctx); // the theme's --sd-easing, for every geometry tween and draw
      join(to);
      stackFocus(to);
      // Pixel positions of the previous state, keyed by series+x.
      const prevPts = new Map(from.series.flatMap((s) => s.points.map((p) => [p.key, p])));
      const prevSeries = new Map(from.series.map((s) => [s.name, s]));
      const entering = new Set(to.series.filter((s) => !prevSeries.has(s.name)).map((s) => s.name));
      const tween = (p, t) => {
        const q = prevPts.get(p.key) ?? p;
        const mix = (a, b) => (a === null || b === null ? b : lerp(a, b, t));
        return { px: lerp(q.px, p.px, t), py: lerp(q.py, p.py, t), lo: mix(q.lo, p.lo), hi: mix(q.hi, p.hi) };
      };
      // Colors change on their own, faster tween (a focus change takes --sd-duration-fast); the frame reads them.
      const live = new Map(to.series.map((s) => [s.name, { paint: prevSeries.get(s.name)?.paint ?? s.paint, label: prevSeries.get(s.name)?.labelColor ?? s.labelColor }]));
      const fast = motion(info, ctx, { fast: true });
      const recolor = to.series.flatMap((s) => {
        const was = prevSeries.get(s.name);
        const now = live.get(s.name);
        return was ? [
          was.paint !== s.paint && tweenColor(ctx, was.paint, s.paint, (c) => { now.paint = c; }, fast),
          was.labelColor !== s.labelColor && tweenColor(ctx, was.labelColor, s.labelColor, (c) => { now.label = c; }, fast),
        ].filter(Boolean) : [];
      });
      const fadeOf = (sel, t) => sel.attr("opacity", function () {
        return this.classList.contains("sd-exiting") ? 1 - t : this.__sdEnter ? t : null;
      });

      svg.selectAll(".tick, g.sd-annotation, .sd-series-label, .sd-band, .sd-points, .sd-forecast, .sd-dot, .sd-forecast-line").each(function () {
        this.__sdEnter = !this.__sdSeen;
        this.__sdSeen = true;
      });
      // The marks of a group that enters or leaves fade with the group, not once more by themselves.
      svg.selectAll(".sd-points, .sd-forecast").filter(function () { return this.__sdEnter; }).selectAll(".sd-dot, .sd-forecast-line").each(function () { this.__sdEnter = false; });
      // Entering series draw at their final shape while everything else morphs.
      const toAt = to.forecast?.at ?? null;
      const lines = gLines.selectAll("path.sd-line:not(.sd-exiting)").data(to.series, (d) => d.name);
      lines.filter((d) => entering.has(d.name)).attr("d", (d) => dOr(lineD(partsOf(d.points, toAt).observed), toAt !== null)).attr("stroke", (d) => d.paint);
      const draws = lines.filter((d) => entering.has(d.name)).nodes().map((n) => ctx.animate.drawPath(n, { duration, signal, ease }));

      const paintAt = (t) => {
        const { x, y } = scalesAt(from, to, t);
        // The forecast start moves with the points; a forecast that appears or leaves is cut at its own place all along (the group fades).
        const at = from.forecast && to.forecast ? lerp(from.forecast.at, to.forecast.at, t) : toAt;
        const keep = at !== null;
        const pts = (s) => s.points.map((p) => ({ ...p, ...tween(p, t) }));
        // The plot origin moves with the y tick label width; interpolate it so nothing jumps at t=0.
        const margin = { left: lerp(from.margin.left, to.margin.left, t), top: lerp(from.margin.top, to.margin.top, t) };
        plot.attr("transform", `translate(${margin.left},${margin.top})`);
        placeMarks(to, x, y, margin);
        fadeOf(svg.selectAll(".tick, g.sd-annotation, .sd-points, .sd-forecast"), t);
        lines.filter((d) => !entering.has(d.name))
          .attr("d", (d) => dOr(lineD(partsOf(pts(d), at).observed), keep))
          .attr("stroke", (d) => live.get(d.name).paint);
        gBands.selectAll("path.sd-band:not(.sd-band-forecast):not(.sd-exiting)").data(to.hasInterval ? to.series : [], (d) => d.name)
          .attr("d", (d) => dOr(band(partsOf(pts(d), at).observed), keep))
          .attr("fill", (d) => live.get(d.name).paint).attr("opacity", (d) => (entering.has(d.name) ? t : 1));
        fadeOf(gBands.selectAll("path.sd-band-forecast"), t);
        gBands.selectAll("path.sd-band-forecast:not(.sd-exiting)").data(to.hasInterval ? forecastSeries(to) : [], (d) => d.name)
          .attr("d", (d) => band(partsOf(pts(d), at).forecast) ?? "").attr("fill", (d) => live.get(d.name).paint);
        if (to.forecast) {
          placeForecast(plot, to, at, x, y);
          plot.selectAll("g.sd-forecast:not(.sd-exiting) path.sd-forecast-line:not(.sd-exiting)").data(forecastSeries(to), (d) => d.name)
            .attr("d", (d) => lineD(partsOf(pts(d), at).forecast)).attr("stroke", (d) => live.get(d.name).paint);
        }
        placeDots(plot.selectAll("g.sd-points:not(.sd-exiting) circle.sd-dot:not(.sd-exiting)").data(dotData(to), (d) => d.key), to, (d) => tween(d, t), at, (d) => live.get(d.series).paint);
        fadeOf(plot.selectAll("circle.sd-dot, path.sd-forecast-line"), t);
        gLabels.selectAll("text.sd-series-label:not(.sd-exiting)").data(to.hasSeriesLabels ? to.series : [], (d) => d.name)
          .attr("x", x.range()[1] + to.font * 0.4).attr("y", (d) => lerp(prevSeries.get(d.name)?.ly ?? d.ly, d.ly, t))
          .attr("dy", "0.35em").attr("fill", (d) => live.get(d.name).label).text((d) => d.name)
          .attr("opacity", (d) => (entering.has(d.name) ? t : 1));
        svg.selectAll("path.sd-line.sd-exiting, .sd-band.sd-exiting, .sd-series-label.sd-exiting").attr("opacity", 1 - t);
      };
      await Promise.all([morph(info, ctx, paintAt, { duration }), ...draws, ...recolor]);
    }

    return {
      async update(props, info = {}) {
        const { draw, duration, ease, signal } = entrance(info, ctx);
        // The start state of the entrance, before the first await: the lines of the last render are undrawn.
        if (draw) gLines.selectAll("path.sd-line").each(function () { undraw(this); });
        const rows = await loadRows(props, ctx);
        const model = buildModel(props, rows, ctx, el);
        if (draw && !info.signal?.aborted) {
          // The entrance: every line draws in from its final shape.
          renderStatic(model);
          // The dotted line and the dots cannot draw along their length: they fade in while the solid lines draw.
          const late = plot.selectAll("g.sd-points, path.sd-forecast-line").attr("opacity", 0);
          await Promise.all([
            ...gLines.selectAll("path.sd-line").nodes().map((n) => ctx.animate.drawPath(n, { duration, signal, ease })),
            morph(info, ctx, (t) => late.attr("opacity", t), { duration }),
          ]);
        } else if (info.animate && last && !info.entered && !info.signal?.aborted) {
          // A change while the chart stays shown. An element that just appeared without a draw snaps.
          await change(last, model, info);
        }
        renderStatic(model);
        last = model;
      },
      anchor(ref) {
        const m = /^series:(.+)$/.exec(String(ref));
        const s = m && last?.series.find((d) => d.name === m[1]);
        if (!s || !s.points.length) return null;
        // Canvas pixels: offsets ignore the shell's scale transform.
        let ox = 0;
        let oy = 0;
        for (let n = el; n && !n.classList?.contains("sd-canvas"); n = n.offsetParent) {
          ox += n.offsetLeft;
          oy += n.offsetTop;
        }
        const xs = s.points.map((p) => p.px);
        const ys = s.points.map((p) => p.py);
        const [x0, x1] = d3.extent(xs);
        const [y0, y1] = d3.extent(ys);
        return { x: ox + last.margin.left + x0, y: oy + last.margin.top + y0, w: x1 - x0, h: y1 - y0 };
      },
      destroy() {
        svg.remove();
      },
    };
  },
};
