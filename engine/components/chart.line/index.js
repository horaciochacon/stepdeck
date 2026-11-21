// Built-in `chart.line`: one line per series over a numeric x, with direct series labels, optional
// highlight, vertical annotations, an interval band, point markers, a forecast segment and a time sweep with a ticker.
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
// both parts, so the solid line ends exactly where the dotted one starts. Both props fade in and out with the element's
// morph, and their markup exists only while they are set.
//
// `until` cuts every line, band, dot and forecast part at an x value, whatever `forecast` does, without moving the x axis;
// `ticker` shows that x in the plot's upper left. A played forward change of `until` is one morph: each frame cuts the
// tweened points at the sweep's position and draws a cursor there, which only the motion has. Series labels then sit after
// each line's visible end. Every part is derived from a series' points by `partsOf` (./parts.js), in the final state and in
// every frame of a played change alike.
//
// `draws` paints a fan of uncertainty draws (./fan.js) on a canvas layer under the SVG: the first `shown` ids of a fixed
// order (`drawOrder`, by `seed`), each a thin line in its series' color (ink without series; dimmed with the series), cut at
// `until`, with an opacity and a width that fall as more are shown. The summary lines then sit on a halo. A played change
// repaints the canvas every frame of the element's morph (new draws fade in, kept ones go to their new opacity, removed ones
// fade out); the end state is painted from props like everything else, so a played arrival equals a jump pixel for pixel.
//
// Text sizes come from theme tokens via CSS (core/stepdeck.css); the token values are only read
// here to size the margins.
import { d3 } from "../../core/d3.js";
import { loadTable, tickFormat, extentOf, drawOrder, frame, keyed, settle, halo, canvasLayer, paintLines, morph, entrance, undraw } from "../../core/chart.js";
import { partsOf, partsByName, lineAttr, bandAttr, forecastSeries, labelled, dotData, placeDots, placeForecast, placeTicker, labelSpots, cutAt } from "./parts.js";
import { fanAlpha, fanWidth, fanModel, loadDraws } from "./fan.js";
import { textColor } from "../../core/color.js";
import { SVG_NS, num, lerp, motion, motionMs, focusPaint, tweenColor } from "../../core/kit.js";

const NO_SERIES = "all"; // series key when props.series is absent
const LINE_WIDTH = 5; // the stroke width of path.sd-line in core/stepdeck.css, when no line can be read

const lerpArr = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

/** Loads the rows and checks every column the props name. Throws `column 'c' not found in <data>`. */
const loadRows = (props, ctx) =>
  loadTable(props, ctx, "chart.line", [
    ["x", props.x], ["y", props.y], ["series", props.series, true],
    ["interval.lower", props.interval?.lower, true], ["interval.upper", props.interval?.upper, true],
  ]);

/**
 * The [min, max] of `y` over every draws file a step of the slide with the current `y` names, each read with that step's
 * own columns (`ctx.stepProps`; the current props alone without it), so the y axis has room for the fan before it is
 * shown. Steps with another `y` do not count: a `y` change rescales the axis as it always did. A step whose draws do not
 * load is skipped: its own update reports the problem. Null when no such step names draws.
 */
async function drawsExtent(props, ctx) {
  const named = new Map();
  for (const p of [props, ...(ctx.stepProps ?? [])]) {
    if (p?.draws && p.y === props.y) named.set(JSON.stringify([p.draws.data, p.x, p.y, p.series ?? null, p.draws.id, p.types ?? null]), p);
  }
  const found = (await Promise.all([...named.values()].map((p) => loadDraws(p, ctx).then((rows) => extentOf(rows, [p.y]), () => null)))).filter(Boolean);
  return found.length ? [Math.min(...found.map((e) => e[0])), Math.max(...found.map((e) => e[1]))] : null;
}

/**
 * The fan of the model: `{ shown, seed, alpha, order, geometry, lines }`. `lines` are the painted draws in paint order
 * (series below the focused ones first, as the summary lines stack, then by `order`), each `{ key, series, id, points }`
 * with `points` `{ x, px, py }` in plot pixels (`py` null where the value is missing). `geometry` names what the pixel
 * positions depend on: two fans with the same geometry place a draw the same.
 */
function fanOf(props, rows, series, x, y) {
  const { ids, bySeries } = fanModel(rows, props, { x: props.x, y: props.y, series: props.series });
  const { shown } = props.draws;
  const seed = props.draws.seed ?? 1;
  const order = drawOrder(ids, seed);
  const painted = order.slice(0, shown);
  const lines = [];
  for (const s of [...series.filter((d) => d.dimmed), ...series.filter((d) => !d.dimmed)]) {
    const own = bySeries.get(s.name);
    for (const id of own ? painted : []) {
      const points = own.get(id);
      if (points) lines.push({ key: `${s.name}|${id}`, series: s.name, id, points: points.map(([xv, yv]) => ({ x: xv, px: x(xv), py: yv === null ? null : y(yv) })) });
    }
  }
  const geometry = JSON.stringify([props.draws.data, props.x, props.y, props.series ?? null, props.types ?? null, x.domain(), x.range(), y.domain(), y.range()]);
  return { shown, seed, alpha: fanAlpha(shown), order, geometry, lines };
}

/**
 * The target state, in canvas pixels, computed from props alone. `draws` is `{ rows, extent }`: the rows of
 * `draws.data` (null without `draws`) and `drawsExtent`.
 */
function buildModel(props, rows, ctx, el, draws = null) {
  const valueOf = (row, col) => (row[col] == null || row[col] === "" ? null : Number(row[col]));
  const seriesOf = (row) => (props.series ? String(row[props.series]) : NO_SERIES);

  // Series in order of first appearance; colors follow that order.
  const order = [...new Set(rows.map(seriesOf))];
  const colors = ctx.palette?.("categorical")?.colors ?? [];
  const background = ctx.tokens?.["--sd-color-background"];
  const ink = ctx.tokens?.["--sd-color-ink"]?.trim() || null;
  const muted = ctx.tokens?.["--sd-color-muted"]?.trim() || null; // a value: var() does not work in a fill attribute
  const shown = new Set(Array.isArray(props.series_shown) ? props.series_shown.map(String) : order);

  const lower = props.interval?.lower;
  const upper = props.interval?.upper;
  const xs = rows.map((r) => valueOf(r, props.x)).filter((v) => v !== null);
  // The y domain covers every series in the data (not only the shown ones) so the axis does not
  // jump as series appear; it always includes 0.
  const ys = rows.flatMap((r) => [valueOf(r, props.y), lower ? valueOf(r, lower) : null, upper ? valueOf(r, upper) : null]).filter((v) => v !== null);
  if (draws?.extent) ys.push(...draws.extent); // and every draw any step can show
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

  // The sweep's cut in pixels (null without `until`): lines, bands, dots and forecast parts end there. It never reaches
  // the margins or the scales: the x axis does not move while it sweeps.
  const untilValue = props.until == null || props.until === "" ? NaN : Number(props.until);
  const until = Number.isFinite(untilValue) ? untilValue : null;
  const cut = until === null ? null : x(until);
  // The ticker (a large x label in the plot's upper left, only with `until`): its box keeps the series labels clear of it.
  // The width comes from character counts, like the margins, so layout never depends on font timing.
  let ticker = null;
  let avoid = null;
  if (props.ticker === true && until !== null) {
    const size = num(ctx.tokens?.["--sd-font-size-heading"], 48);
    const text = fx(until);
    const chars = Math.max(text.length, ...xTicks.map((t) => t.label.length), fx(xDomain[0]).length, fx(xDomain[1]).length);
    ticker = { text, x: font * 0.3, y: font * 0.3, w: chars * size * 0.62, h: size * 1.3 };
    avoid = { right: ticker.x + ticker.w, bottom: ticker.y + ticker.h + font * 0.65 };
  }

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
      // Its draws (`draws`): the series color, or the ink when the chart has no series; dimmed with the series.
      fanPaint: focusPaint(ctx, props.series ? color : ink, dimmed),
      // Labels are text: their color changes, so a dimmed series' label switches to the muted text color.
      labelColor: dimmed && muted ? muted : colors.length ? textColor(color, background) : null,
      points,
    };
  });

  // Direct labels: at each line's end in the right margin, or, while a sweep cuts the lines, after each line's visible
  // end. Nudged apart so they never overlap and never pass the plot's bottom.
  const spots = labelSpots(series, { font, pw, ph, cut, avoid });
  for (const s of series) s.label = spots.get(s.name);

  const annotations = (Array.isArray(props.annotate) ? props.annotate : [])
    .filter((a) => a && Number.isFinite(Number(a.x)))
    .map((a) => ({ key: String(Number(a.x)), x: Number(a.x), label: a.label == null ? "" : String(a.label) }));

  return {
    w, h, font, margin, pw, ph,
    xDomain: x.domain(), xRange: x.range(), yDomain: y.domain(), yRange: y.range(),
    xTicks, yTicks, series, annotations, forecast, until, cut, ticker, avoid, fmtX: fx,
    fan: draws?.rows ? fanOf(props, draws.rows, series, x, y) : null,
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
    if (props.draws) await loadDraws(props, ctx);

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
      keyed(gLabels.selectAll("text.sd-series-label"), labelled(m), byName, (enter) => enter.append("text").attr("class", "sd-series-label").attr("data-label", byName));
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
      // The ticker: one text over the plot, while it is on (`ticker` with `until`).
      keyed(plot.selectAll("text.sd-ticker"), m.ticker ? [m.ticker] : [], () => "ticker", (enter) => enter.append("text").attr("class", "sd-ticker sd-halo"));
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

    /** The stroke width of the summary lines (the draws' widths are multiples of it). */
    function lineWidth() {
      const node = gLines.select("path.sd-line").node();
      return num(node && doc.defaultView?.getComputedStyle(node).strokeWidth, LINE_WIDTH);
    }

    /** The fan's canvas layer, over the plot at `origin` (`{ left, top }`) with the plot's size `pw` x `ph`. */
    const fanCanvas = (origin, pw, ph) => canvasLayer(el, { left: origin.left, top: origin.top, pw, ph });

    /** paintLines input for a fan line: its points cut at `cut` (plot pixels; null for no cut), as [x, y] pairs. */
    const fanPoints = (points, cut) => (cut === null ? points : cutAt(points, cut)).map((p) => [p.px, p.py]);

    /** The fan of `m` at rest: every painted draw, cut at `until`, at the fan's opacity (times `fade`) and width. */
    function restingFan(m, fade = 1) {
      const paint = new Map(m.series.map((s) => [s.name, s.fanPaint]));
      const width = fanWidth(m.fan.shown, lineWidth());
      return m.fan.lines.map((l) => ({ points: fanPoints(l.points, m.cut), color: paint.get(l.series), alpha: m.fan.alpha * fade, width }));
    }

    /** The summary lines, solid and dotted: over a fan, each sits on a halo (`halo` with `under`). */
    const summaryLines = () => plot.selectAll("g.sd-lines path.sd-line, g.sd-forecast path.sd-forecast-line");

    /**
     * Writes the fan of `m`: the canvas over the plot, painted, with its state attributes (`data-draws`, `data-until`,
     * `data-seed`, `data-signature`, always in this order), and the halos. Without `draws` there is no canvas and no halo.
     */
    function writeFan(m) {
      if (!m.fan) {
        el.querySelector(":scope > canvas.sd-canvas-layer")?.remove();
        plot.selectAll(".sd-halo-under").remove();
        summaryLines().each(function () { delete this.__sdHaloUnder; });
        return;
      }
      halo(summaryLines(), { under: true }); // after stackFocus: each copy goes back just before its line
      const canvas = fanCanvas(m.margin, m.pw, m.ph);
      const signature = paintLines(canvas, restingFan(m));
      canvas.setAttribute("data-draws", String(m.fan.shown));
      canvas.setAttribute("data-until", m.until === null ? "" : String(m.until));
      canvas.setAttribute("data-seed", String(m.fan.seed));
      canvas.setAttribute("data-signature", signature);
    }

    /**
     * The frames of a played change of the fan, `from` -> `to`: `paint(t, cut, origin, pw, ph, colorOf)` repaints the
     * canvas at time t. Every draw painted in either state takes part, keyed by series and id, in the paint order of `to`
     * (series in its stacking, then its draw order), so the first and the last frames are the two states' own pictures.
     * A draw in both goes from the old opacity and width to the new ones (and from its old place to its new one when the
     * scales or columns change), a new one fades in from 0 and a removed one fades out where it was.
     */
    function fanMotion(from, to) {
      const [a, b] = [from.fan, to.fan];
      const old = new Map((a?.lines ?? []).map((l) => [l.key, l]));
      const now = new Map((b?.lines ?? []).map((l) => [l.key, l]));
      const rank = (keys) => {
        const r = new Map();
        for (const k of keys) if (!r.has(k)) r.set(k, r.size);
        return r;
      };
      const seriesRank = rank([...now.values(), ...old.values()].map((l) => l.series));
      const idRank = rank([...(b?.order ?? []), ...(a?.order ?? [])]);
      const keys = [...new Set([...now.keys(), ...old.keys()])].map((k) => now.get(k) ?? old.get(k))
        .sort((p, q) => seriesRank.get(p.series) - seriesRank.get(q.series) || idRank.get(p.id) - idRank.get(q.id))
        .map((l) => l.key);
      const moves = a && b && a.geometry !== b.geometry; // a kept draw moves only when its pixel places change
      const draws = keys.map((k) => {
        const [p, q] = [old.get(k), now.get(k)];
        return { p, q, line: q ?? p, byX: p && q && moves ? new Map(p.points.map((pt) => [pt.x, pt])) : null };
      });
      const lw = lineWidth();
      const [wa, wb] = [a ? fanWidth(a.shown, lw) : 0, b ? fanWidth(b.shown, lw) : 0];
      return (t, cut, origin, pw, ph, colorOf) => {
        const lines = draws.map(({ p, q, line, byX }) => {
          const points = byX
            ? q.points.map((pt) => {
                const o = byX.get(pt.x) ?? pt;
                return { px: lerp(o.px, pt.px, t), py: o.py === null || pt.py === null ? pt.py : lerp(o.py, pt.py, t) };
              })
            : line.points;
          return {
            points: fanPoints(points, cut),
            color: colorOf(line.series),
            alpha: p && q ? lerp(a.alpha, b.alpha, t) : q ? b.alpha * t : a.alpha * (1 - t),
            width: p && q ? lerp(wa, wb, t) : q ? wb : wa,
          };
        });
        paintLines(fanCanvas(origin, pw, ph), lines);
      };
    }

    /** Writes the model exactly: the end state of every update, animated or not. */
    function renderStatic(m) {
      join(m);
      svg.selectAll(".sd-sweep-cursor").remove(); // the sweep's cursor lives only while it plays, whatever ended the play
      settle(svg); // leavers go, the leftovers of drawPath and fades too; what remains is seen (not entering) by a later change
      svg.attr("width", m.w).attr("height", m.h).attr("viewBox", `0 0 ${m.w} ${m.h}`);
      plot.attr("transform", `translate(${m.margin.left},${m.margin.top})`);
      const x = d3.scaleLinear().domain(m.xDomain).range(m.xRange);
      const y = d3.scaleLinear().domain(m.yDomain).range(m.yRange);
      placeMarks(m, x, y);
      const at = m.forecast?.at ?? null;
      const shaped = at !== null || m.cut !== null; // with a forecast or a sweep a part can be empty: it keeps an empty `d`, so the markup does not depend on the way here
      const parts = partsByName(m.series, (s) => s.points, at, m.cut);
      gLines.selectAll("path.sd-line").data(m.series, (d) => d.name)
        .attr("d", (d) => lineAttr(parts.get(d.name).observed, shaped)).attr("stroke", (d) => d.paint);
      gBands.selectAll("path.sd-band:not(.sd-band-forecast)").data(m.hasInterval ? m.series : [], (d) => d.name)
        .attr("d", (d) => bandAttr(parts.get(d.name).observed, shaped)).attr("fill", (d) => d.paint);
      gBands.selectAll("path.sd-band-forecast").data(m.hasInterval ? forecastSeries(m) : [], (d) => d.name)
        .attr("d", (d) => bandAttr(parts.get(d.name).forecast, true)).attr("fill", (d) => d.paint);
      if (m.forecast) {
        placeForecast(plot, m, at, x, y, m.cut);
        plot.selectAll("g.sd-forecast path.sd-forecast-line").data(forecastSeries(m), (d) => d.name)
          .attr("d", (d) => lineAttr(parts.get(d.name).forecast, true)).attr("stroke", (d) => d.paint);
      }
      placeDots(plot.selectAll("g.sd-points circle.sd-dot").data(dotData(m), (d) => d.key), m, (d) => d, at, (d) => d.paint);
      stackFocus(m);
      gLabels.selectAll("text.sd-series-label").data(labelled(m), (d) => d.name)
        .attr("x", (d) => d.label.x).attr("y", (d) => d.label.y).attr("dy", "0.35em")
        .attr("fill", (d) => d.labelColor).text((d) => d.name)
        .attr("opacity", null).order();
      if (m.ticker) placeTicker(plot, m, m.ticker.text);
      gNotes.selectAll("g.sd-annotation").data(m.annotations, (d) => d.key).order();
      gy.selectAll("g.tick").order();
      gx.selectAll("g.tick").order();
      baseline.raise();
      writeFan(m);
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
      // The sweep: the cut moves in data space from the old `until` to the new one (the end of the x domain when a state has
      // none), so it keeps its place when the scales move. A state with the same `until` on both sides only holds the cut.
      const clampedUntil = (m) => (m.until === null ? m.xDomain[1] : Math.min(Math.max(m.until, m.xDomain[0]), m.xDomain[1]));
      const [u0, u1] = [clampedUntil(from), clampedUntil(to)];
      const cutting = from.until !== null || to.until !== null;
      const sweeping = cutting && u0 !== u1;
      // The ticker counts from the old `until` to the new one as given (the cut stays inside the x domain), so it rests on `until`.
      const [t0, t1] = [from.until ?? from.xDomain[1], to.until ?? to.xDomain[1]];
      const counting = cutting && t0 !== t1;
      const cursor = sweeping ? plot.insert("line", "g.sd-lines").attr("class", "sd-sweep-cursor") : null;
      // Colors change on their own, faster tween (a focus change takes --sd-duration-fast); the frame reads them.
      const live = new Map(to.series.map((s) => {
        const was = prevSeries.get(s.name);
        return [s.name, { paint: was?.paint ?? s.paint, label: was?.labelColor ?? s.labelColor, fan: was?.fanPaint ?? s.fanPaint }];
      }));
      const fast = motion(info, ctx, { fast: true });
      const recolor = to.series.flatMap((s) => {
        const was = prevSeries.get(s.name);
        const now = live.get(s.name);
        return was ? [
          was.paint !== s.paint && tweenColor(ctx, was.paint, s.paint, (c) => { now.paint = c; }, fast),
          was.labelColor !== s.labelColor && tweenColor(ctx, was.labelColor, s.labelColor, (c) => { now.label = c; }, fast),
          was.fanPaint !== s.fanPaint && tweenColor(ctx, was.fanPaint, s.fanPaint, (c) => { now.fan = c; }, fast),
        ].filter(Boolean) : [];
      });
      // The fan: repainted every frame. A series that leaves keeps its draws' color while they fade out.
      const fanFrame = from.fan || to.fan ? fanMotion(from, to) : null;
      const fanColor = (name) => live.get(name)?.fan ?? prevSeries.get(name)?.fanPaint ?? null;
      const fadeOf = (sel, t) => sel.attr("opacity", function () {
        return this.classList.contains("sd-exiting") ? 1 - t : this.__sdEnter ? t : null;
      });

      svg.selectAll(".tick, g.sd-annotation, .sd-series-label, .sd-band, .sd-points, .sd-forecast, .sd-dot, .sd-forecast-line").each(function () {
        this.__sdEnter = !this.__sdSeen;
        this.__sdSeen = true;
      });
      // The marks of a group that enters or leaves fade with the group, not once more by themselves.
      svg.selectAll(".sd-points, .sd-forecast").filter(function () { return this.__sdEnter; }).selectAll(".sd-dot, .sd-forecast-line").each(function () { this.__sdEnter = false; });
      // A dot the sweep reveals arrives at full opacity as the cursor passes it: only `points` being switched on fades the dots.
      if (cutting && from.showPoints && to.showPoints) plot.selectAll("circle.sd-dot").filter((d) => d && !entering.has(d.series)).each(function () { this.__sdEnter = false; });
      // Entering series draw at their final shape while everything else morphs.
      const toAt = to.forecast?.at ?? null;
      const lines = gLines.selectAll("path.sd-line:not(.sd-exiting)").data(to.series, (d) => d.name);
      const toShaped = toAt !== null || to.cut !== null;
      lines.filter((d) => entering.has(d.name)).attr("d", (d) => lineAttr(partsOf(d.points, toAt, to.cut).observed, toShaped)).attr("stroke", (d) => d.paint);
      // With a fan on either side the lines sit on halos (they fade in or out with the fan); an entering line's draws with it.
      const halos = () => (fanFrame ? halo(summaryLines(), { under: true }) : null);
      halos();
      const draws = lines.filter((d) => entering.has(d.name)).nodes().flatMap((n) => [n, n.__sdHaloUnder].filter(Boolean))
        .map((n) => ctx.animate.drawPath(n, { duration, signal, ease }));

      const paintAt = (t) => {
        const { x, y } = scalesAt(from, to, t);
        // The forecast start moves with the points; a forecast that appears or leaves is cut at its own place all along (the group fades).
        const at = from.forecast && to.forecast ? lerp(from.forecast.at, to.forecast.at, t) : toAt;
        const u = lerp(u0, u1, t);
        const cut = cutting ? x(u) : null;
        const shaped = at !== null || cut !== null;
        // Every series' tweened points and their parts, once for the frame.
        const pts = new Map(to.series.map((s) => [s.name, s.points.map((p) => ({ ...p, ...tween(p, t) }))]));
        const parts = partsByName(to.series, (s) => pts.get(s.name), at, cut);
        // The plot origin moves with the y tick label width; interpolate it so nothing jumps at t=0.
        const margin = { left: lerp(from.margin.left, to.margin.left, t), top: lerp(from.margin.top, to.margin.top, t) };
        plot.attr("transform", `translate(${margin.left},${margin.top})`);
        placeMarks(to, x, y, margin);
        fadeOf(svg.selectAll(".tick, g.sd-annotation, .sd-points, .sd-forecast"), t);
        lines.filter((d) => !entering.has(d.name))
          .attr("d", (d) => lineAttr(parts.get(d.name).observed, shaped))
          .attr("stroke", (d) => live.get(d.name).paint);
        gBands.selectAll("path.sd-band:not(.sd-band-forecast):not(.sd-exiting)").data(to.hasInterval ? to.series : [], (d) => d.name)
          .attr("d", (d) => bandAttr(parts.get(d.name).observed, shaped))
          .attr("fill", (d) => live.get(d.name).paint).attr("opacity", (d) => (entering.has(d.name) ? t : 1));
        fadeOf(gBands.selectAll("path.sd-band-forecast"), t);
        gBands.selectAll("path.sd-band-forecast:not(.sd-exiting)").data(to.hasInterval ? forecastSeries(to) : [], (d) => d.name)
          .attr("d", (d) => bandAttr(parts.get(d.name).forecast, true)).attr("fill", (d) => live.get(d.name).paint);
        if (to.forecast) {
          placeForecast(plot, to, at, x, y, cut);
          plot.selectAll("g.sd-forecast:not(.sd-exiting) path.sd-forecast-line:not(.sd-exiting)").data(forecastSeries(to), (d) => d.name)
            .attr("d", (d) => lineAttr(parts.get(d.name).forecast, true)).attr("stroke", (d) => live.get(d.name).paint);
        }
        placeDots(plot.selectAll("g.sd-points:not(.sd-exiting) circle.sd-dot:not(.sd-exiting)").data(dotData(to), (d) => d.key), to, (d) => tween(d, t), at, (d) => live.get(d.series).paint);
        // A dot shows once the cut has reached it (a dot that is leaving stays where it was).
        if (cutting) plot.selectAll("circle.sd-dot").style("display", function (d) { return (this.classList.contains("sd-exiting") ? d : tween(d, t)).px > cut ? "none" : null; });
        fadeOf(plot.selectAll("circle.sd-dot, path.sd-forecast-line"), t);
        // Labels: with a sweep on either side they ride the visible end of each line, else they move from where they were.
        const spots = cutting ? labelSpots(to.series.map((s) => ({ name: s.name, points: pts.get(s.name) })), { font: to.font, pw: x.range()[1], ph: y.range()[0], cut, avoid: to.avoid }) : null;
        const spotOf = (d) => spots?.get(d.name) ?? (spots ? d.label : { x: x.range()[1] + to.font * 0.4, y: lerp(prevSeries.get(d.name)?.label?.y ?? d.label.y, d.label.y, t) });
        gLabels.selectAll("text.sd-series-label:not(.sd-exiting)").data(labelled(to), (d) => d.name)
          .attr("x", (d) => spotOf(d).x).attr("y", (d) => spotOf(d).y)
          .attr("dy", "0.35em").attr("fill", (d) => live.get(d.name).label).text((d) => d.name)
          .attr("opacity", (d) => (entering.has(d.name) ? t : 1))
          .style("display", (d) => (spots && !spots.get(d.name) ? "none" : null));
        svg.selectAll("path.sd-line.sd-exiting, .sd-band.sd-exiting, .sd-series-label.sd-exiting").attr("opacity", 1 - t);
        if (to.ticker) placeTicker(plot, to, counting ? to.fmtX(lerp(t0, t1, t)) : to.ticker.text);
        cursor?.attr("x1", x(u)).attr("x2", x(u)).attr("y1", 0).attr("y2", y.range()[0]);
        if (fanFrame) {
          // A halo fades with the fan and with its own line (a line that leaves, a dotted line that fades in or out).
          const fade = from.fan && to.fan ? 1 : to.fan ? t : 1 - t;
          halos().attr("opacity", function () {
            const o = fade * num(this.nextSibling?.getAttribute("opacity"), 1);
            return o === 1 ? null : o;
          });
          fanFrame(t, cut, margin, x.range()[1], y.range()[0], fanColor);
        }
      };
      try {
        await Promise.all([morph(info, ctx, paintAt, { duration }), ...draws, ...recolor]);
      } finally {
        cursor?.remove();
      }
    }

    return {
      async update(props, info = {}) {
        const { draw, duration, ease, signal } = entrance(info, ctx);
        // The start state of the entrance, before the first await: the lines of the last render (and their halos) are undrawn.
        if (draw) gLines.selectAll("path.sd-line, .sd-halo-under").each(function () { undraw(this); });
        const rows = await loadRows(props, ctx);
        const draws = { rows: props.draws ? await loadDraws(props, ctx) : null, extent: await drawsExtent(props, ctx) };
        const model = buildModel(props, rows, ctx, el, draws);
        if (draw && !info.signal?.aborted) {
          // The entrance: every line draws in from its final shape.
          renderStatic(model);
          // The dotted line and the dots cannot draw along their length: they fade in while the solid lines draw, and so does the fan.
          const late = plot.selectAll("g.sd-points, path.sd-forecast-line, g.sd-forecast .sd-halo-under").attr("opacity", 0);
          const fanAt = (t) => model.fan && paintLines(fanCanvas(model.margin, model.pw, model.ph), restingFan(model, t));
          fanAt(0);
          await Promise.all([
            ...gLines.selectAll("path.sd-line, .sd-halo-under").nodes().map((n) => ctx.animate.drawPath(n, { duration, signal, ease })),
            late.empty() && !model.fan ? undefined : morph(info, ctx, (t) => { late.attr("opacity", t); fanAt(t); }, { duration }),
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
        el.querySelector(":scope > canvas.sd-canvas-layer")?.remove();
      },
    };
  },
};
