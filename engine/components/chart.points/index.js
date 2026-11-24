// Built-in `chart.points`: one estimate per category from a CSV, as a dot with an optional interval whisker and a
// direct value label, one row per category down the left, a value axis at the bottom and an optional reference
// line across every row. With `from` each row is a before and after pair: a hollow dot at `from`, a quiet connector
// and the filled dot at `y`; a row whose `from` is empty has its end dot alone. With `id` each row of the data is one
// point and a category is a beeswarm strip, with a summary tick, overflow boxes and a followed item (./strips.js).
//
// Everything on screen is a pure function of (model, view):
//   - the model (./model.js) comes from props, rows and every step's props alone: the domain, ticks, margins and
//     one entry per category; the colours are added here from the palette and the theme tokens;
//   - the view is the moment inside a motion: the domain and, per row, its slot, where its dot is, how grown it is,
//     how far its whisker is drawn, the opacity of its labels and its colours.
// An update writes the keyed joins (marks that leave get `.sd-exiting`, nothing is removed), then `settle` (the
// leavers and every animation leftover go), then every attribute from the static view of the target model, so the
// markup is the same whether a step was jumped to or played. With info.animate it first plays the change from the
// previous model in one `morph` bound to info.signal, so an abort snaps straight to the end state. Motion changes
// attributes only, never inline styles.
//
// Motion (a forward step by exactly one):
//   - a changed `y`, `interval` or `domain` tweens the dots, whiskers and value labels, and the axis (ticks that
//     stay move, new ones fade in, dropped ones fade out); a step that adds `from` puts the hollow dot where the
//     value was while the filled dot slides to its new `y` and the connector grows behind it;
//   - a row that appears in `shown` grows out of the origin (the reference, else 0, else the domain's start): its
//     dot slides out as it grows (GROW is that share of the motion), then its whisker draws outward; a row that
//     leaves does the reverse. A pair grows out of its `from` instead: the hollow dot grows there and the filled
//     dot slides to `y` with the connector behind it. A value that turns missing shrinks where it is while "no data"
//     fades in, and back;
//   - `sort` orders the rows (rank, in ./model.js); when it changes, every row, with its category label, slides from
//     its old slot to its new one in the same motion, and a row that appears is already at its final slot as it
//     grows. A value label keeps the side of its mark it ends at (the side it started at, for a row that goes) and
//     only its x follows the mark, so it never flips part-way;
//   - `highlight` tweens the other rows' dots and whiskers to the theme's --sd-color-dim and their value labels to
//     the muted colour, over --sd-duration-fast (never opacity);
//   - `reference` and the axis titles fade: one that appears fades in, one that changes fades out as the new one
//     fades in.
// Entrance: the chart owns it (`"x-enter": "own"` in schema.json). With info.entrance.motion "draw" every shown row
// grows out of the origin (its `from`, for a pair) as above, and every strip fades in in x order (./strips.js), over
// info.entrance.duration (else 2 x --sd-duration), while the box stays still
// and the axes, labels and reference show at once. The start state is written before the first await, in the same
// task as the engine shows the element. Any other entrance renders the end state at once.
import { d3 } from "../../core/d3.js";
import { loadTable, frame, keyed, settle, dot, whisker, rule, halo, fit, morph, entrance } from "../../core/chart.js";
import { SVG_NS, lerp, clamp01, motion, focusPaint, tweenColor } from "../../core/kit.js";
import { pointsModel, sizesOf } from "./model.js";
import { stripAt, joinStrip, placeStrip, joinFocus, placeFocus, sweep } from "./strips.js";

const GROW = 0.6; // share of a row's growth in which its dot slides out and grows; its whisker draws in the rest
const FILLED = ":scope > circle.sd-dot:not(.sd-dot-hollow)"; // the dot at `y`; the hollow one at `from` is `.sd-dot-hollow`
const LINK = ":scope > path.sd-pair-connector";
const HOLLOW = ":scope > circle.sd-dot-hollow";
// Back to front: the whisker, the connector, the hollow dot, the filled dot, then the labels; a strip's points and
// its overflow boxes before its "no data" mark.
const ROW_PARTS = [":scope > title", ":scope > g.sd-whisker", LINK, HOLLOW, FILLED, ":scope > text.sd-points-value", ":scope > g.sd-strip", ":scope > g.sd-overflow", ":scope > text.sd-no-data"];

const token = (ctx, name) => ctx.tokens?.[name]?.trim() || null; // a value: var() does not work in an attribute
const mix = (a, b, t) => (a === null ? b : b === null ? a : lerp(a, b, t));
const hasWhisker = (r) => r.lo !== null && r.hi !== null;
const byKey = (d) => d.key;

/** Loads the rows and checks every column the props name. Throws `column 'c' not found in <data>`. */
const loadRows = (props, ctx) =>
  loadTable(props, ctx, "chart.points", [
    ["x", props.x], ["y", props.y], ["id", props.id, true], ["from", props.from, true], ["interval.lower", props.interval?.lower, true], ["interval.upper", props.interval?.upper, true],
  ]);

/** The model of ./model.js for this element's box, with each row's colours (and each strip point's). Throws the model's errors. */
function buildModel(props, rows, ctx, el) {
  const { w, h, font, charW } = frame(el, ctx, { left: 0, right: 0, top: 0, bottom: 0 });
  const m = pointsModel(rows, props, { stepProps: ctx.stepProps ?? null, font, charW, w, h, format: ctx.format, t: ctx.t ?? ((key) => key) });
  const color = ctx.palette?.("categorical")?.colors?.[0] ?? token(ctx, "--sd-color-accent");
  const ink = token(ctx, "--sd-color-ink") ?? "currentColor";
  const muted = token(ctx, "--sd-color-muted");
  for (const r of m.rows) {
    Object.assign(r, { fill: focusPaint(ctx, color, r.dim), stroke: focusPaint(ctx, ink, r.dim), labelFill: r.dim && muted ? muted : ink, link: focusPaint(ctx, muted ?? ink, r.dim) });
    for (const q of r.points ?? []) q.fill = focusPaint(ctx, color, q.dim);
  }
  return m;
}

/**
 * Which side of its mark a row's value label takes, decided once from the row at rest (its whole whisker and pair, its
 * dots at full size, the model's own axis) and then kept through a motion, so it never flips part-way: `edge` is the
 * end of the mark it sits against (`top` the upper end, `bottom` the lower) and `anchor` its `text-anchor`. Past the
 * upper end when the label fits in the svg, else past the lower end, and only when neither fits inside the mark; a
 * pair whose end dot is the lower one starts from the lower end instead, so the label sits on the far side of the
 * end dot from the hollow one. Null for a row without a value.
 */
const sides = new WeakMap();
function sideOf(m, row) {
  if (row.missing) return null;
  let own = sides.get(m);
  if (!own) sides.set(m, (own = new Map()));
  if (!own.has(row.key)) {
    const { r } = sizesOf(m);
    const x = d3.scaleLinear().domain(m.domain).range([0, m.pw]);
    const [d0, d1] = m.domain;
    const clamped = (v) => x(Math.min(Math.max(v, Math.min(d0, d1)), Math.max(d0, d1)));
    const at = x(row.value);
    const pair = row.from === null ? null : x(row.from);
    const top = Math.max(row.hi === null ? at : clamped(row.hi), at + r, pair === null ? -Infinity : pair + r);
    const bottom = Math.min(row.lo === null ? at : clamped(row.lo), at - r, pair === null ? Infinity : pair - r);
    const width = row.text.length * m.charW;
    const range = [0, m.pw + m.margin.right];
    const gap = m.font * 0.4;
    const down = pair !== null && pair > at; // the end dot is the lower one: its label goes below the mark
    const [first, second] = down ? [bottom, top] : [top, bottom];
    const one = fit(first, second, width, range, gap);
    const other = one.inside ? fit(second, first, width, range, gap) : null;
    const spot = other && !other.inside && other.anchor === (down ? "start" : "end") ? other : one; // past the other end, outside
    // Against or past the upper end: an outside label anchored "start", or an inside one anchored "end".
    own.set(row.key, { edge: spot.inside === (spot.anchor === "end") ? "top" : "bottom", anchor: spot.anchor });
  }
  return own.get(row.key);
}

/**
 * One row at time t of a change from `p` (the row before; null when there is none, or for an entrance) to `b`.
 * `v` is where the dot is (data units), `grow` its size (0..1), `whisker` how far its whisker is drawn out of it
 * (0..1), `label` the opacity of its value label and `noData` that of its "no data" mark. A row slides from its old
 * slot to its new one; one that was hidden has no old place, so it is at its new one from the start. `leaving` is
 * true while a row that is drawn goes away (its label keeps the side it had). A pair adds `from` (where the hollow
 * dot is, data units; null without one), `fromGrow` (its size) and `reach` (how far the connector runs from the dot
 * towards it): the hollow dot is at once where the filled one was, and a row that appears or goes grows or shrinks
 * out of its `from` (the origin, for a row without one).
 */
function rowAt(p, b, t, enterAll, origin) {
  const was = enterAll ? null : p;
  const drawn0 = Boolean(was && was.shown && !was.missing);
  const drawn1 = b.shown && !b.missing;
  const blank0 = Boolean(was && was.shown && was.missing);
  const blank1 = b.shown && b.missing;
  const s = {
    slot: was?.shown ? lerp(was.slot, b.slot, t) : b.slot,
    visible: Boolean(was?.shown) || b.shown,
    leaving: drawn0 && !drawn1,
    v: b.value ?? p?.value ?? null, lo: b.lo ?? p?.lo ?? null, hi: b.hi ?? p?.hi ?? null,
    from: b.from ?? p?.from ?? null, fromGrow: 1, reach: 1,
    grow: 1, whisker: 1, label: 1,
    noData: blank0 === blank1 ? 1 : blank1 ? t : 1 - t,
  };
  if (drawn0 && drawn1) {
    s.v = lerp(p.value, b.value, t);
    s.lo = mix(p.lo, b.lo, t);
    s.hi = mix(p.hi, b.hi, t);
    s.whisker = hasWhisker(p) === hasWhisker(b) ? 1 : hasWhisker(b) ? t : 1 - t;
    s.from = mix(p.from, b.from, t);
    if (b.from === null && p.from !== null) Object.assign(s, { fromGrow: 1 - t, reach: 1 - t }); // the pair folds into the dot
  } else if (drawn1) {
    // A row that appears grows out of the origin (out of its `from`, for a pair); a value that was missing grows where it is (never from zero).
    const g = clamp01(t / GROW);
    s.v = g >= 1 ? b.value : lerp(blank0 ? b.value : b.from ?? origin, b.value, g);
    // Its own pair only: a `from` it had while hidden is gone (its marks leave and are not drawn).
    Object.assign(s, { from: b.from, grow: g, fromGrow: g, reach: blank0 ? g : 1, whisker: clamp01((t - GROW) / (1 - GROW)), label: g });
  } else if (drawn0) {
    const g = 1 - clamp01((t - (1 - GROW)) / GROW);
    s.v = g >= 1 ? p.value : lerp(blank1 ? p.value : p.from ?? origin, p.value, g);
    Object.assign(s, { lo: p.lo, hi: p.hi, from: p.from, grow: g, fromGrow: g, reach: blank1 ? g : 1, whisker: 1 - clamp01(t / (1 - GROW)), label: g });
  }
  return s;
}

/**
 * The view of a change `from` -> `to` at time t (`from` null: nothing before). `in` and `out` are the opacities of
 * the ticks, reference and titles that enter and leave (an entrance shows them at once); `join` is the opacity of
 * the focus join at an entrance (it fades in at the end of the build), else null. `live` holds the row colours of a
 * running colour tween and `paint(from, to)` a strip point's.
 */
function viewAt(from, to, t, enterAll, live = null, paint = (_a, b) => b) {
  const prev = new Map((from?.rows ?? []).map((r) => [r.key, r]));
  const ref = from ?? to;
  const origin = lerp(ref.origin, to.origin, t);
  const sameKind = from?.summary === to.summary;
  return {
    domain: [lerp(ref.domain[0], to.domain[0], t), lerp(ref.domain[1], to.domain[1], t)],
    in: enterAll ? 1 : t,
    out: 1 - t,
    join: enterAll ? sweep(t, 1) : null,
    rows: new Map(to.rows.map((b) => {
      const colours = live?.get(b.key) ?? { fill: b.fill, stroke: b.stroke, labelFill: b.labelFill, link: b.link };
      if (to.strips) return [b.key, { ...stripAt(prev.get(b.key) ?? null, b, t, enterAll, to.domain, paint, sameKind), ...colours }];
      const s = rowAt(prev.get(b.key) ?? null, b, t, enterAll, origin);
      // A value label takes the side its row ends at (the side it started at, for a row that goes).
      return [b.key, {
        ...s,
        side: s.leaving ? sideOf(from, prev.get(b.key)) : sideOf(to, b),
        ...colours,
      }];
    })),
  };
}

const staticView = (m) => viewAt(m, m, 1, false);

export default {
  async mount(el, props, ctx) {
    const doc = el.ownerDocument;
    const svg = d3.select(el).append(() => doc.createElementNS(SVG_NS, "svg")).attr("class", "sd-chart-points");
    const plot = svg.append("g").attr("class", "sd-plot");
    const gAxis = plot.append("g").attr("class", "sd-axis sd-axis-value");
    const axisLine = plot.append("line").attr("class", "sd-axis-line");
    const gRefs = plot.append("g").attr("class", "sd-references");
    const gLabels = plot.append("g").attr("class", "sd-points-labels");
    const gRows = plot.append("g").attr("class", "sd-points-rows");
    const gJoins = plot.append("g").attr("class", "sd-focus-joins");

    let last = null; // the last fully applied model
    buildModel(props, await loadRows(props, ctx), ctx, el); // fail early: a column, a category or the domain

    /** The keyed joins: brings the DOM's marks to the model's, in a fixed order; leavers get `.sd-exiting`. */
    function join(m) {
      keyed(gAxis.selectAll("g.tick"), m.ticks, (d) => d.value, (enter) => {
        const g = enter.append("g").attr("class", "tick");
        g.append("line").attr("class", "sd-grid-line");
        g.append("text");
        return g;
      });
      keyed(gRefs.selectAll("g.sd-reference"), m.reference ? [m.reference] : [], byKey, (enter) => enter.append("g").attr("class", "sd-reference"));
      keyed(gLabels.selectAll("text.sd-points-label"), m.rows, byKey, (enter) => enter.append("text").attr("class", "sd-points-label"));
      keyed(gRows.selectAll("g.sd-points-row"), m.rows, byKey, (enter) => {
        const g = enter.append("g").attr("class", "sd-points-row");
        g.append("title");
        return g;
      }).each(function (d) {
        const row = d3.select(this);
        const mark = !m.strips && !d.missing; // an estimate's own marks; a strip has its points instead
        keyed(row.selectAll(":scope > g.sd-whisker"), !m.strips && hasWhisker(d) ? [d] : [], () => "whisker", (enter) => enter.append("g").attr("class", "sd-whisker"));
        keyed(row.selectAll(LINK), mark && d.from !== null ? [d] : [], () => "link", (enter) => enter.append("path").attr("class", "sd-pair-connector"));
        keyed(row.selectAll(HOLLOW), mark && d.from !== null ? [d] : [], () => "from", (enter) => enter.append("circle").attr("class", "sd-dot-hollow"));
        keyed(row.selectAll(FILLED), mark ? [d] : [], () => "dot", (enter) => enter.append("circle").attr("class", "sd-dot"));
        keyed(row.selectAll(":scope > text.sd-points-value"), mark ? [d] : [], () => "value", (enter) => enter.append("text").attr("class", "sd-points-value"));
        keyed(row.selectAll(":scope > text.sd-no-data"), d.missing ? [d] : [], () => "none", (enter) => enter.append("text").attr("class", "sd-no-data"));
        joinStrip(row, m.strips ? d : {}, m);
        for (const part of ROW_PARTS) row.selectAll(part).raise();
      });
      joinFocus(gJoins, m);
      const title = (cls, text) => keyed(svg.selectAll(`text.${cls}`), text ? [{ key: text }] : [], byKey, (enter) => enter.append("text").attr("class", `sd-axis-title ${cls}`));
      title("sd-axis-title-band", m.axes.x);
      title("sd-axis-title-value", m.axes.y);
      svg.selectAll("text.sd-axis-title-band").raise();
      svg.selectAll("text.sd-axis-title-value").raise();
    }

    /** Writes `view` of model `m`: every attribute the component owns, on every call, leavers included. */
    function place(m, view) {
      const f = m.font;
      const { band, r, cap } = sizesOf(m);
      const x = d3.scaleLinear().domain(view.domain).range([0, m.pw]);
      const [d0, d1] = view.domain;
      const clamped = (v) => x(Math.min(Math.max(v, Math.min(d0, d1)), Math.max(d0, d1))); // a whisker is cut at the axis ends
      const yOf = (slot) => band * (slot + 0.5);
      // Ticks, references and titles that enter or leave fade; the rest are at full opacity.
      const fade = function () {
        const o = this.classList.contains("sd-exiting") ? view.out : this.__sdSeen ? 1 : view.in;
        return o === 1 ? null : o;
      };
      svg.attr("width", m.w).attr("height", m.h).attr("viewBox", `0 0 ${m.w} ${m.h}`);
      plot.attr("transform", `translate(${m.margin.left},${m.margin.top})`);

      // Value axis: grid lines and tick labels at the bottom, keyed by tick value.
      gAxis.selectAll("g.tick").attr("transform", (d) => `translate(${x(d.value)},0)`).attr("opacity", fade).each(function (d) {
        const g = d3.select(this);
        g.select("line").attr("x1", 0).attr("x2", 0).attr("y1", 0).attr("y2", m.ph);
        g.select("text").attr("x", 0).attr("y", m.ph + f * 0.5).attr("dy", "0.71em").attr("text-anchor", "middle").text(d.label);
      });
      axisLine.attr("x1", 0).attr("x2", m.pw).attr("y1", m.ph).attr("y2", m.ph);

      // The reference: a rule across every row, its label above the plot, right of the rule when it fits, else left.
      gRefs.selectAll("g.sd-reference").attr("opacity", fade).each(function (d) {
        const px = x(d.value);
        const side = fit(px, px, d.label.length * m.charW, [-m.margin.left, m.pw + m.margin.right], f * 0.35).anchor;
        const down = side === "start";
        rule(d3.select(this), { x1: px, y1: down ? 0 : m.ph, x2: px, y2: down ? m.ph : 0, label: d.label, anchor: side });
      });

      // Category labels, right-aligned left of the plot (and of the room kept for overflow boxes), wrapped; hidden with their row.
      gLabels.selectAll("text.sd-points-label")
        .attr("data-key", byKey)
        .attr("data-visible", (d) => String(view.rows.get(d.key).visible))
        .attr("transform", (d) => `translate(0,${yOf(view.rows.get(d.key).slot)})`)
        .attr("y", (d) => -((d.lines.length - 1) * m.lineH) / 2)
        .attr("text-anchor", "end")
        .each(function (d) {
          d3.select(this).selectAll("tspan").data(d.lines).join("tspan")
            .attr("x", -f * 0.4 - m.room.low).attr("dy", (_l, j) => (j > 0 ? m.lineH : "0.35em")).text((l) => l);
        });

      // Rows: the whisker on a halo, the dot and the value label, or the "no data" mark. A leaving mark keeps its
      // own datum (its text) and takes its place from the row's view.
      gRows.selectAll("g.sd-points-row")
        .attr("data-key", byKey)
        .attr("data-visible", (d) => String(view.rows.get(d.key).visible))
        .attr("data-dim", (d) => String(d.dim))
        .attr("transform", (d) => `translate(0,${yOf(view.rows.get(d.key).slot)})`)
        .each(function (d) {
          const s = view.rows.get(d.key);
          const row = d3.select(this);
          row.select(":scope > title").text(d.title);
          halo(row.selectAll(":scope > text.sd-no-data").attr("x", f * 0.3).attr("y", 0).attr("dy", "0.35em").attr("text-anchor", "start")
            .attr("opacity", s.noData === 1 ? null : s.noData).text(m.noData));
          if (m.strips) return placeStrip(row, s, { x, r, band, m, stroke: s.stroke, out: view.out });
          if (s.v === null) return; // missing on both sides: only the mark
          const at = x(s.v);
          const lo = s.lo === null ? null : clamped(lerp(s.v, s.lo, s.whisker));
          const hi = s.hi === null ? null : clamped(lerp(s.v, s.hi, s.whisker));
          const wg = row.selectAll(":scope > g.sd-whisker").attr("stroke", s.stroke).attr("opacity", s.whisker > 0 ? null : 0);
          if (lo !== null && hi !== null) {
            whisker(wg, { at: 0, lo, hi, cap, orient: "horizontal" });
            halo(wg.select(".sd-whisker-line"), { under: true });
          }
          // A pair: the connector runs from the hollow dot to the filled one (shortened by `reach`), both dots on it.
          if (s.from !== null) {
            const start = x(s.from);
            row.selectAll(LINK).attr("d", `M${s.reach >= 1 ? start : lerp(at, start, s.reach)},0L${at},0`).attr("stroke", s.link);
            dot(row.selectAll(HOLLOW).attr("cx", start).attr("cy", 0), { r: r * s.fromGrow, color: s.fill, hollow: true });
          } else {
            // No pair now: the marks of one this row had while hidden are leaving, and stay out of sight.
            row.selectAll(`${LINK}, ${HOLLOW}`).attr("opacity", 0);
          }
          dot(row.selectAll(FILLED).attr("cx", at).attr("cy", 0), { r: r * s.grow, color: s.fill });
          // The value label: against the end of the mark its side names (see sideOf), which follows the mark through a
          // motion; only its x changes.
          const pair = s.from === null ? null : x(s.from);
          const top = Math.max(hi ?? at, at + r * s.grow, pair === null ? -Infinity : pair + r * s.fromGrow);
          const bottom = Math.min(lo ?? at, at - r * s.grow, pair === null ? Infinity : pair - r * s.fromGrow);
          const gap = f * 0.4;
          const side = s.side ?? { edge: "top", anchor: "start" };
          halo(row.selectAll(":scope > text.sd-points-value").each(function (own) {
            d3.select(this).attr("x", (side.edge === "top" ? top : bottom) + (side.anchor === "start" ? gap : -gap)).attr("y", 0).attr("dy", "0.35em")
              .attr("text-anchor", side.anchor).attr("fill", s.labelFill).attr("opacity", s.label === 1 ? null : s.label).text(own.text);
          }));
        });

      // The focus join, over every row.
      placeFocus(gJoins, m, view, { x, yOf, r });

      // Axis titles: the category axis above the labels, the value axis under the ticks.
      svg.selectAll("text.sd-axis-title-band").attr("opacity", fade).attr("x", 0).attr("y", f).attr("text-anchor", "start").text(byKey);
      svg.selectAll("text.sd-axis-title-value").attr("opacity", fade)
        .attr("x", m.margin.left + m.pw / 2).attr("y", m.margin.top + m.ph + f * 3.1).attr("text-anchor", "middle").text(byKey);
    }

    /** The end state of every update, animated or not: the joins, then settle, then every attribute. */
    function renderStatic(m) {
      join(m);
      settle(svg);
      place(m, staticView(m));
    }

    // The same set of categories (their order may differ: a re-sort moves them), both estimates or both strips.
    const comparable = (a, b) => a && b && a.strips === b.strips && a.rows.map(byKey).sort().join("\n") === b.rows.map(byKey).sort().join("\n");
    const signature = (m) => JSON.stringify([
      m.domain, m.margin, m.room, m.pw, m.ph, m.ticks.map((k) => k.label), m.reference?.key ?? null, m.axes,
      m.rows.map((r) => [r.slot, r.value, r.from, r.lo, r.hi, r.shown, r.dim, r.missing, r.text, r.lines]),
      m.strips ? [m.summary, m.focus, m.rows.map((r) => [r.summary, r.overflow, r.points.map((q) => [q.id, q.value, q.dy, q.dim, q.focus])])] : null,
    ]);

    /**
     * Plays `from` -> `to` (from may be null: nothing before, as when the element appears) over `duration`, else
     * the step's transition, else 2 x --sd-duration. Colours tween on their own, over --sd-duration-fast.
     */
    async function change(from, to, info, enterAll, duration) {
      join(to);
      if (!from) {
        // Rows of another set of categories never move: they go at once.
        gRows.selectAll("g.sd-points-row.sd-exiting").remove();
        gLabels.selectAll("text.sd-points-label.sd-exiting").remove();
      }
      const prev = new Map((from?.rows ?? []).map((r) => [r.key, r]));
      const live = new Map(to.rows.map((b) => {
        const p = prev.get(b.key) ?? b;
        return [b.key, { fill: p.fill, stroke: p.stroke, labelFill: p.labelFill, link: p.link }];
      }));
      const fast = motion(info, ctx, { fast: true });
      const recolor = to.rows.flatMap((b) => {
        const p = prev.get(b.key);
        const now = live.get(b.key);
        return p ? ["fill", "stroke", "labelFill", "link"].filter((k) => p[k] !== b[k]).map((k) => tweenColor(ctx, p[k], b[k], (c) => { now[k] = c; }, fast)) : [];
      });
      // Strip points: one tween per pair of colours (base to dim and back), shared by every point that makes it.
      const tones = new Map();
      for (const b of to.strips ? to.rows : []) {
        const was = new Map((prev.get(b.key)?.points ?? []).map((q) => [q.id, q.fill]));
        for (const q of b.points) {
          const a = was.get(q.id);
          const pair = `${a}\n${q.fill}`;
          if (a === undefined || a === q.fill || tones.has(pair)) continue;
          tones.set(pair, a);
          recolor.push(tweenColor(ctx, a, q.fill, (c) => { tones.set(pair, c); }, fast));
        }
      }
      const paint = (a, b) => (a === b ? b : tones.get(`${a}\n${b}`) ?? b);
      await Promise.all([morph(info, ctx, (t) => place(to, viewAt(from, to, t, enterAll, live, paint)), { duration }), ...recolor]);
    }

    return {
      async update(props, info = {}) {
        const { draw, duration } = entrance(info, ctx);
        // The start state of the entrance, before the first await: the rows of the last render, not grown yet.
        if (draw && last) place(last, viewAt(null, last, 0, true));
        const rows = await loadRows(props, ctx);
        const model = buildModel(props, rows, ctx, el);
        const from = comparable(last, model) ? last : null;
        if (draw && !info.signal?.aborted) {
          await change(from, model, info, true, duration);
        } else if (info.animate && !info.entered && !info.signal?.aborted && from && signature(from) !== signature(model)) {
          // A change while the chart stays shown. An element that just appeared without a draw snaps.
          await change(from, model, info, false);
        }
        renderStatic(model);
        last = model;
      },
      destroy() {
        svg.remove();
      },
    };
  },
};
