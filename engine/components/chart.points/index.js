// Built-in `chart.points`: one estimate per category from a CSV, as a dot with an optional interval whisker and a
// direct value label, one row per category down the left, a value axis at the bottom and an optional reference
// line across every row.
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
//     stay move, new ones fade in, dropped ones fade out);
//   - a row that appears in `shown` grows out of the origin (the reference, else 0, else the domain's start): its
//     dot slides out as it grows (GROW is that share of the motion), then its whisker draws outward; a row that
//     leaves does the reverse. A value that turns missing shrinks where it is while "no data" fades in, and back;
//   - `highlight` tweens the other rows' dots and whiskers to the theme's --sd-color-dim and their value labels to
//     the muted colour, over --sd-duration-fast (never opacity);
//   - `reference` and the axis titles fade: one that appears fades in, one that changes fades out as the new one
//     fades in.
// Entrance: the chart owns it (`"x-enter": "own"` in schema.json). With info.entrance.motion "draw" every shown row
// grows out of the origin as above, over info.entrance.duration (else 2 x --sd-duration), while the box stays still
// and the axes, labels and reference show at once. The start state is written before the first await, in the same
// task as the engine shows the element. Any other entrance renders the end state at once.
import { d3 } from "../../core/d3.js";
import { loadTable, frame, keyed, settle, dot, whisker, rule, halo, fit, morph, entrance } from "../../core/chart.js";
import { SVG_NS, lerp, clamp01, motion, focusPaint, tweenColor } from "../../core/kit.js";
import { pointsModel } from "./model.js";

const GROW = 0.6; // share of a row's growth in which its dot slides out and grows; its whisker draws in the rest
const ROW_PARTS = [":scope > title", ":scope > g.sd-whisker", ":scope > circle.sd-dot", ":scope > text.sd-points-value", ":scope > text.sd-no-data"];

const token = (ctx, name) => ctx.tokens?.[name]?.trim() || null; // a value: var() does not work in an attribute
const mix = (a, b, t) => (a === null ? b : b === null ? a : lerp(a, b, t));
const hasWhisker = (r) => r.lo !== null && r.hi !== null;
const byKey = (d) => d.key;

/** Loads the rows and checks every column the props name. Throws `column 'c' not found in <data>`. */
const loadRows = (props, ctx) =>
  loadTable(props, ctx, "chart.points", [
    ["x", props.x], ["y", props.y], ["interval.lower", props.interval?.lower, true], ["interval.upper", props.interval?.upper, true],
  ]);

/** The model of ./model.js for this element's box, with each row's colours. Throws the model's errors. */
function buildModel(props, rows, ctx, el) {
  const { w, h, font, charW } = frame(el, ctx, { left: 0, right: 0, top: 0, bottom: 0 });
  const m = pointsModel(rows, props, { stepProps: ctx.stepProps ?? null, font, charW, w, h, format: ctx.format, t: ctx.t ?? ((key) => key) });
  const color = ctx.palette?.("categorical")?.colors?.[0] ?? token(ctx, "--sd-color-accent");
  const ink = token(ctx, "--sd-color-ink") ?? "currentColor";
  const muted = token(ctx, "--sd-color-muted");
  for (const r of m.rows) {
    Object.assign(r, { fill: focusPaint(ctx, color, r.dim), stroke: focusPaint(ctx, ink, r.dim), labelFill: r.dim && muted ? muted : ink });
  }
  return m;
}

/** The radius of a dot and the length of a whisker's caps, from the label font and the row band. */
function sizes(m) {
  const band = m.ph / Math.max(1, m.rows.length);
  return { band, r: Math.max(4, Math.min(m.font * 0.35, band * 0.3)), cap: Math.max(4, Math.min(m.font * 0.8, band * 0.5)) };
}

/**
 * One row at time t of a change from `p` (the row before; null when there is none, or for an entrance) to `b`.
 * `v` is where the dot is (data units), `grow` its size (0..1), `whisker` how far its whisker is drawn out of it
 * (0..1), `label` the opacity of its value label and `noData` that of its "no data" mark.
 */
function rowAt(p, b, t, enterAll, origin) {
  const was = enterAll ? null : p;
  const drawn0 = Boolean(was && was.shown && !was.missing);
  const drawn1 = b.shown && !b.missing;
  const blank0 = Boolean(was && was.shown && was.missing);
  const blank1 = b.shown && b.missing;
  const s = {
    slot: p ? lerp(p.slot, b.slot, t) : b.slot,
    visible: Boolean(was?.shown) || b.shown,
    v: b.value ?? p?.value ?? null, lo: b.lo ?? p?.lo ?? null, hi: b.hi ?? p?.hi ?? null,
    grow: 1, whisker: 1, label: 1,
    noData: blank0 === blank1 ? 1 : blank1 ? t : 1 - t,
  };
  if (drawn0 && drawn1) {
    s.v = lerp(p.value, b.value, t);
    s.lo = mix(p.lo, b.lo, t);
    s.hi = mix(p.hi, b.hi, t);
    s.whisker = hasWhisker(p) === hasWhisker(b) ? 1 : hasWhisker(b) ? t : 1 - t;
  } else if (drawn1) {
    // A row that appears grows out of the origin; a value that was missing grows where it is (never from zero).
    const g = clamp01(t / GROW);
    s.v = g >= 1 ? b.value : lerp(blank0 ? b.value : origin, b.value, g);
    Object.assign(s, { grow: g, whisker: clamp01((t - GROW) / (1 - GROW)), label: g });
  } else if (drawn0) {
    const g = 1 - clamp01((t - (1 - GROW)) / GROW);
    s.v = g >= 1 ? p.value : lerp(blank1 ? p.value : origin, p.value, g);
    Object.assign(s, { lo: p.lo, hi: p.hi, grow: g, whisker: 1 - clamp01(t / (1 - GROW)), label: g });
  }
  return s;
}

/**
 * The view of a change `from` -> `to` at time t (`from` null: nothing before). `in` and `out` are the opacities of
 * the ticks, reference and titles that enter and leave (an entrance shows them at once). `live` holds the colours
 * of a running colour tween.
 */
function viewAt(from, to, t, enterAll, live = null) {
  const prev = new Map((from?.rows ?? []).map((r) => [r.key, r]));
  const ref = from ?? to;
  const origin = lerp(ref.origin, to.origin, t);
  return {
    domain: [lerp(ref.domain[0], to.domain[0], t), lerp(ref.domain[1], to.domain[1], t)],
    in: enterAll ? 1 : t,
    out: 1 - t,
    rows: new Map(to.rows.map((b) => [b.key, {
      ...rowAt(prev.get(b.key) ?? null, b, t, enterAll, origin),
      ...(live?.get(b.key) ?? { fill: b.fill, stroke: b.stroke, labelFill: b.labelFill }),
    }])),
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
        keyed(row.selectAll(":scope > g.sd-whisker"), hasWhisker(d) ? [d] : [], () => "whisker", (enter) => enter.append("g").attr("class", "sd-whisker"));
        keyed(row.selectAll(":scope > circle.sd-dot"), d.missing ? [] : [d], () => "dot", (enter) => enter.append("circle").attr("class", "sd-dot"));
        keyed(row.selectAll(":scope > text.sd-points-value"), d.missing ? [] : [d], () => "value", (enter) => enter.append("text").attr("class", "sd-points-value"));
        keyed(row.selectAll(":scope > text.sd-no-data"), d.missing ? [d] : [], () => "none", (enter) => enter.append("text").attr("class", "sd-no-data"));
        for (const part of ROW_PARTS) row.selectAll(part).raise();
      });
      const title = (cls, text) => keyed(svg.selectAll(`text.${cls}`), text ? [{ key: text }] : [], byKey, (enter) => enter.append("text").attr("class", `sd-axis-title ${cls}`));
      title("sd-axis-title-band", m.axes.x);
      title("sd-axis-title-value", m.axes.y);
      svg.selectAll("text.sd-axis-title-band").raise();
      svg.selectAll("text.sd-axis-title-value").raise();
    }

    /** Writes `view` of model `m`: every attribute the component owns, on every call, leavers included. */
    function place(m, view) {
      const f = m.font;
      const { band, r, cap } = sizes(m);
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

      // Category labels, right-aligned left of the plot, wrapped; hidden with their row.
      gLabels.selectAll("text.sd-points-label")
        .attr("data-key", byKey)
        .attr("data-visible", (d) => String(view.rows.get(d.key).visible))
        .attr("transform", (d) => `translate(0,${yOf(view.rows.get(d.key).slot)})`)
        .attr("y", (d) => -((d.lines.length - 1) * m.lineH) / 2)
        .attr("text-anchor", "end")
        .each(function (d) {
          d3.select(this).selectAll("tspan").data(d.lines).join("tspan")
            .attr("x", -f * 0.4).attr("dy", (_l, j) => (j > 0 ? m.lineH : "0.35em")).text((l) => l);
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
          if (s.v === null) return; // missing on both sides: only the mark
          const at = x(s.v);
          const lo = s.lo === null ? null : clamped(lerp(s.v, s.lo, s.whisker));
          const hi = s.hi === null ? null : clamped(lerp(s.v, s.hi, s.whisker));
          const wg = row.selectAll(":scope > g.sd-whisker").attr("stroke", s.stroke).attr("opacity", s.whisker > 0 ? null : 0);
          if (lo !== null && hi !== null) {
            whisker(wg, { at: 0, lo, hi, cap, orient: "horizontal" });
            halo(wg.select(".sd-whisker-line"), { under: true });
          }
          dot(row.selectAll(":scope > circle.sd-dot").attr("cx", at).attr("cy", 0), { r: r * s.grow, color: s.fill });
          // The value label: past the upper end of the mark (the whisker, else the dot) when it fits in the svg, else
          // past its lower end, and only when neither fits inside the whisker (a label on a line reads struck through).
          const top = Math.max(hi ?? at, at + r * s.grow);
          const bottom = Math.min(lo ?? at, at - r * s.grow);
          const range = [0, m.pw + m.margin.right];
          const gap = f * 0.4;
          halo(row.selectAll(":scope > text.sd-points-value").each(function (own) {
            const width = own.text.length * m.charW;
            const right = fit(top, bottom, width, range, gap);
            const left = right.inside ? fit(bottom, top, width, range, gap) : null;
            const spot = left && !left.inside && left.anchor === "end" ? left : right;
            d3.select(this).attr("x", spot.x).attr("y", 0).attr("dy", "0.35em").attr("text-anchor", spot.anchor)
              .attr("fill", s.labelFill).attr("opacity", s.label === 1 ? null : s.label).text(own.text);
          }));
        });

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

    const comparable = (a, b) => a && b && a.rows.map(byKey).join("\n") === b.rows.map(byKey).join("\n");
    const signature = (m) => JSON.stringify([
      m.domain, m.margin, m.pw, m.ph, m.ticks.map((k) => k.label), m.reference?.key ?? null, m.axes,
      m.rows.map((r) => [r.slot, r.value, r.lo, r.hi, r.shown, r.dim, r.missing, r.text, r.lines]),
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
        return [b.key, { fill: p.fill, stroke: p.stroke, labelFill: p.labelFill }];
      }));
      const fast = motion(info, ctx, { fast: true });
      const recolor = to.rows.flatMap((b) => {
        const p = prev.get(b.key);
        const now = live.get(b.key);
        return p ? ["fill", "stroke", "labelFill"].filter((k) => p[k] !== b[k]).map((k) => tweenColor(ctx, p[k], b[k], (c) => { now[k] = c; }, fast)) : [];
      });
      await Promise.all([morph(info, ctx, (t) => place(to, viewAt(from, to, t, enterAll, live)), { duration }), ...recolor]);
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
