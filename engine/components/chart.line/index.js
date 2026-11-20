// Built-in `chart.line`: one line per series over a numeric x, with direct series labels, optional
// highlight, vertical annotations and an interval band (spec §6.2 trend example, §6.3).
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
// Text sizes come from theme tokens via CSS (core/stepdeck.css); the token values are only read
// here to size the margins.
import { d3 } from "../../core/d3.js";
import { loadTable, tickFormat } from "../../core/chart.js";
import { textColor } from "../../core/color.js";
import { SVG_NS, num, lerp, measureWidth, measureHeight, motion, motionMs, focusPaint, tweenColor } from "../../core/kit.js";

const NO_SERIES = "all"; // series key when props.series is absent

const lerpArr = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

/** Hides an SVG path along its length (the start of ctx.animate.drawPath); a path with no length is left as is. */
function undraw(path) {
  const length = typeof path.getTotalLength === "function" ? Number(path.getTotalLength()) || 0 : 0;
  if (!(length > 0)) return;
  path.style.strokeDasharray = `${length} ${length}`;
  path.style.strokeDashoffset = String(length);
}

/** Loads the rows and checks every column the props name. Throws `column 'c' not found in <data>`. */
const loadRows = (props, ctx) =>
  loadTable(props, ctx, "chart.line", [
    ["x", props.x], ["y", props.y], ["series", props.series, true],
    ["interval.lower", props.interval?.lower, true], ["interval.upper", props.interval?.upper, true],
  ]);

/** The target state, in canvas pixels, computed from props alone. */
function buildModel(props, rows, ctx, el) {
  const font = num(ctx.tokens?.["--sd-font-size-label"], 28);
  const w = measureWidth(el, ctx);
  const h = measureHeight(el, ctx);
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
  const charW = font * 0.6;
  const seriesList = order.filter((s) => shown.has(s));
  const labelChars = props.series ? Math.max(0, ...seriesList.map((s) => s.length)) : 0;
  const margin = {
    top: Math.round(font * 2),
    left: Math.round(Math.max(4, ...yTicks.map((t) => t.label.length)) * charW + font * 0.6),
    right: Math.round(labelChars ? labelChars * charW + font : font),
    bottom: Math.round(font * 3.4),
  };
  const pw = Math.max(1, w - margin.left - margin.right);
  const ph = Math.max(1, h - margin.top - margin.bottom);
  const x = d3.scaleLinear().domain(xDomain).range([0, pw]);
  const y = yScale0.copy().range([ph, 0]);

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

  // Direct labels at each line's end, nudged apart so they never overlap.
  const gap = font * 1.15;
  const labels = d3.sort(series.filter((s) => s.points.length), (s) => s.points.at(-1).py).map((s) => ({ name: s.name, ly: s.points.at(-1).py }));
  for (let i = 1; i < labels.length; i++) labels[i].ly = Math.max(labels[i].ly, labels[i - 1].ly + gap);
  const overflow = labels.length ? labels.at(-1).ly - ph : 0;
  if (overflow > 0) for (const l of labels) l.ly -= overflow;
  for (const s of series) s.ly = labels.find((l) => l.name === s.name)?.ly ?? 0;

  const annotations = (Array.isArray(props.annotate) ? props.annotate : [])
    .filter((a) => a && Number.isFinite(Number(a.x)))
    .map((a) => ({ key: String(Number(a.x)), x: Number(a.x), label: a.label == null ? "" : String(a.label) }));

  return {
    w, h, font, margin, pw, ph,
    xDomain: x.domain(), xRange: x.range(), yDomain: y.domain(), yRange: y.range(),
    xTicks, yTicks, series, annotations,
    hasSeriesLabels: Boolean(props.series),
    hasInterval: Boolean(lower && upper),
    axes: { x: props.axes?.x == null ? "" : String(props.axes.x), y: props.axes?.y == null ? "" : String(props.axes.y) },
  };
}

const lineD = d3.line().x((p) => p.px).y((p) => p.py);
const bandD = d3.area().defined((p) => p.lo !== null && p.hi !== null).x((p) => p.px).y0((p) => p.lo).y1((p) => p.hi);

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

    // A keyed join whose update and exit only toggle `.sd-exiting` (leavers stay until renderStatic).
    const keyed = (sel, data, key, enter) =>
      sel.data(data, key).join(enter, (update) => update.classed("sd-exiting", false), (exit) => exit.classed("sd-exiting", true));
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
      keyed(gBands.selectAll("path.sd-band"), m.hasInterval ? m.series : [], byName, (enter) => enter.append("path").attr("class", "sd-band").attr("data-band", byName));
      keyed(gNotes.selectAll("g.sd-annotation"), m.annotations, (d) => d.key, (enter) => {
        const g = enter.append("g").attr("class", "sd-annotation");
        g.append("line").attr("class", "sd-annotation-rule");
        g.append("text").attr("class", "sd-annotation-label");
        return g;
      });
    }

    /** Draws the focused series after (above) the dimmed ones: the data order, with the dimmed first. */
    function stackFocus(m) {
      const focused = (d) => !d.dimmed;
      gLines.selectAll("path.sd-line:not(.sd-exiting)").data(m.series, byName).order().filter(focused).raise();
      gBands.selectAll("path.sd-band:not(.sd-exiting)").data(m.hasInterval ? m.series : [], byName).order().filter(focused).raise();
    }

    /** Writes the model exactly: the end state of every update, animated or not. */
    function renderStatic(m) {
      join(m);
      svg.selectAll(".sd-exiting").remove();
      svg.selectAll("[style]").attr("style", null); // leftovers of drawPath and fades
      svg.selectAll("[opacity]").attr("opacity", null);
      svg.selectAll("*").each(function () {
        this.__sdSeen = true; // what a later morph treats as already on screen (not entering)
      });
      svg.attr("width", m.w).attr("height", m.h).attr("viewBox", `0 0 ${m.w} ${m.h}`);
      plot.attr("transform", `translate(${m.margin.left},${m.margin.top})`);
      const x = d3.scaleLinear().domain(m.xDomain).range(m.xRange);
      const y = d3.scaleLinear().domain(m.yDomain).range(m.yRange);
      placeMarks(m, x, y);
      gLines.selectAll("path.sd-line").data(m.series, (d) => d.name)
        .attr("d", (d) => lineD(d.points)).attr("stroke", (d) => d.paint);
      gBands.selectAll("path.sd-band").data(m.hasInterval ? m.series : [], (d) => d.name)
        .attr("d", (d) => bandD(d.points)).attr("fill", (d) => d.paint);
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

    /** Morph from `from` to `to`: keyed by series+x, scales and ticks interpolate, leavers fade. */
    async function morph(from, to, info) {
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

      svg.selectAll(".tick, g.sd-annotation, .sd-series-label, .sd-band").each(function () {
        this.__sdEnter = !this.__sdSeen;
        this.__sdSeen = true;
      });
      // Entering series draw at their final shape while everything else morphs.
      const lines = gLines.selectAll("path.sd-line:not(.sd-exiting)").data(to.series, (d) => d.name);
      lines.filter((d) => entering.has(d.name)).attr("d", (d) => lineD(d.points)).attr("stroke", (d) => d.paint);
      const draws = lines.filter((d) => entering.has(d.name)).nodes().map((n) => ctx.animate.drawPath(n, { duration, signal, ease }));

      const frame = (t) => {
        const { x, y } = scalesAt(from, to, t);
        // The plot origin moves with the y tick label width; interpolate it so nothing jumps at t=0.
        const margin = { left: lerp(from.margin.left, to.margin.left, t), top: lerp(from.margin.top, to.margin.top, t) };
        plot.attr("transform", `translate(${margin.left},${margin.top})`);
        placeMarks(to, x, y, margin);
        fadeOf(svg.selectAll(".tick, g.sd-annotation"), t);
        lines.filter((d) => !entering.has(d.name))
          .attr("d", (d) => lineD(d.points.map((p) => tween(p, t))))
          .attr("stroke", (d) => live.get(d.name).paint);
        gBands.selectAll("path.sd-band:not(.sd-exiting)").data(to.hasInterval ? to.series : [], (d) => d.name)
          .attr("d", (d) => bandD(d.points.map((p) => ({ ...p, ...tween(p, t) }))))
          .attr("fill", (d) => live.get(d.name).paint).attr("opacity", (d) => (entering.has(d.name) ? t : 1));
        gLabels.selectAll("text.sd-series-label:not(.sd-exiting)").data(to.hasSeriesLabels ? to.series : [], (d) => d.name)
          .attr("x", x.range()[1] + to.font * 0.4).attr("y", (d) => lerp(prevSeries.get(d.name)?.ly ?? d.ly, d.ly, t))
          .attr("dy", "0.35em").attr("fill", (d) => live.get(d.name).label).text((d) => d.name)
          .attr("opacity", (d) => (entering.has(d.name) ? t : 1));
        svg.selectAll("path.sd-line.sd-exiting, .sd-band.sd-exiting, .sd-series-label.sd-exiting").attr("opacity", 1 - t);
      };
      await Promise.all([ctx.animate.tween(0, 1, frame, { duration, signal, ease }), ...draws, ...recolor]);
    }

    return {
      async update(props, info = {}) {
        const draw = info.entrance?.motion === "draw" && !info.signal?.aborted;
        // The start state of the entrance, before the first await: the lines of the last render are undrawn.
        if (draw) gLines.selectAll("path.sd-line").each(function () { undraw(this); });
        const rows = await loadRows(props, ctx);
        const model = buildModel(props, rows, ctx, el);
        if (draw && !info.signal?.aborted) {
          // The entrance: every line draws in from its final shape.
          renderStatic(model);
          const duration = info.entrance.duration ?? motionMs(info, ctx, 2);
          const { ease } = motion(info, ctx);
          await Promise.all(gLines.selectAll("path.sd-line").nodes().map((n) => ctx.animate.drawPath(n, { duration, signal: info.signal, ease })));
        } else if (info.animate && last && !info.entered && !info.signal?.aborted) {
          // A change while the chart stays shown. An element that just appeared without a draw snaps.
          await morph(last, model, info);
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
