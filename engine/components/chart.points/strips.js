// chart.points strips: what a category with many points draws, for ./index.js. With `id` every row of the data is
// one point; a category's points sit in its band as a beeswarm (their `dy` comes from ./model.js), with a summary
// tick across them and an overflow box at each end of the axis that cuts some of them off. The item named by
// `focus` is ringed in every strip and a line joins it across the strips.
//
// Markup of one strip row (g.sd-points-row, placed by index.js): g.sd-strip holding circle.sd-dot[data-id] (data
// order), line.sd-summary, then the followed item's circle.sd-dot.sd-focus (raised to the end of its strip); then
// g.sd-overflow[data-side="low" | "high"] (rect.sd-overflow-box, text.sd-overflow-count). The join is
// g.sd-focus-joins > path.sd-focus-join, above every row, on a halo.
//
// Like the rest of the chart, each mark is a pure function of (model, view): stripAt gives the view of one strip at
// time t of a change, joinStrip and placeStrip write it. Motion (a forward step by exactly one):
//   - points slide between their two rest places, x and swarm offset alike (the swarm is never re-run part-way);
//     a point that comes or goes (a value, a domain) fades where it is;
//   - a strip that appears, and every strip at the entrance, fades in in x order within one build: a mark at a
//     share u of the axis fades in over the motion's [SWEEP x u, SWEEP x u + 1 - SWEEP]; a strip that goes fades out;
//   - a change of `summary` fades the old tick out and the new one in; a tick of the same kind slides;
//   - the focus ring, the raise and the join switch at once, the join fading in or out, while the other dots'
//     colours tween to the dim colour (index.js, over --sd-duration-fast; never opacity).
import { d3 } from "../../core/d3.js";
import { keyed, dot, halo } from "../../core/chart.js";
import { lerp, clamp01 } from "../../core/kit.js";
import { overflowText, overflowWidth, OVERFLOW_GAP } from "./model.js";

const SWEEP = 0.6; // the share of a build over which the marks start, left to right; each fades in over the rest
const STRIP = ":scope > g.sd-strip";
const DOTS = ":scope > circle.sd-dot";
const SUMMARY = ":scope > line.sd-summary";
const OVERFLOW = ":scope > g.sd-overflow";
const JOIN = "path.sd-focus-join";

/** The opacity at time t of a mark at share `u` (0..1) of the axis, in a build that fades in in x order. */
export const sweep = (t, u) => clamp01((t - SWEEP * clamp01(u)) / (1 - SWEEP));
const opacity = (o) => (o === 1 ? null : o);
const gone = (node) => node.classList.contains("sd-exiting");

/**
 * One strip at time t of a change from `p` (the strip before; null when there is none, or for an entrance) to `b`.
 * `paint(from, to)` is the colour of a dot whose fill goes from `from` to `to`, now; `sameKind` is whether the
 * summary is the same statistic on both sides (else its tick fades across). Returns { slot, visible,
 * noData, points (id -> { v, dy, o, fill }), summary ({ v, o } or null), overflow ({ low, high }: opacities) }:
 * where each target mark is (data units, and pixels for dy) and its opacity. Leavers are drawn from their own data.
 */
export function stripAt(p, b, t, enterAll, domain, paint, sameKind) {
  const was = enterAll ? null : p;
  const on0 = Boolean(was?.shown);
  const on1 = b.shown;
  const u = (v) => (v - domain[0]) / (domain[1] - domain[0]);
  // A mark of a strip that appears fades in in x order; of one that goes, fades out; of one that stays, is there.
  // A mark new to a strip that stays (a point that gets a value or comes inside the axis, a tick, a box) fades in.
  const show = (v) => (on1 && !on0 ? sweep(t, u(v)) : on0 && !on1 ? 1 - t : 1);
  const fresh = (v) => (on0 && on1 ? t : show(v));
  const before = new Map((was?.points ?? []).map((q) => [q.id, q]));
  const points = new Map(b.points.map((q) => {
    const a = on0 ? before.get(q.id) : undefined;
    const fill = paint(before.get(q.id)?.fill ?? q.fill, q.fill);
    if (a) return [q.id, { v: lerp(a.value, q.value, t), dy: lerp(a.dy, q.dy, t), o: show(q.value), fill }];
    return [q.id, { v: q.value, dy: q.dy, o: fresh(q.value), fill }]; // where it ends
  }));
  const kept = sameKind && on0 && was.summary !== null && b.summary !== null; // the same tick, slid
  const box = (s, v) => (on0 && was.overflow[s] > 0 ? show(v) : fresh(v));
  const blank0 = Boolean(was?.shown && was.missing);
  const blank1 = b.shown && b.missing;
  return {
    slot: on0 ? lerp(was.slot, b.slot, t) : b.slot,
    visible: on0 || on1,
    noData: blank0 === blank1 ? 1 : blank1 ? t : 1 - t,
    points,
    summary: b.summary === null ? null : { v: kept ? lerp(was.summary, b.summary, t) : b.summary, o: kept ? show(b.summary) : fresh(b.summary) },
    overflow: { low: box("low", domain[0]), high: box("high", domain[1]) },
  };
}

/**
 * The keyed joins of one row's strip marks, in a fixed order: the dots in data order, the summary tick, the
 * followed dot last; then the overflow boxes. An estimate row (no `points`) has none, so its strip marks leave.
 */
export function joinStrip(row, d, m) {
  const strip = keyed(row.selectAll(STRIP), d.points ? [d] : [], () => "strip", (enter) => enter.append("g").attr("class", "sd-strip"));
  strip.each(function (s) {
    const g = d3.select(this);
    const dots = keyed(g.selectAll(DOTS), s.points, (q) => q.id, (enter) => enter.append("circle").attr("class", "sd-dot"));
    const tick = keyed(g.selectAll(SUMMARY), s.summary === null ? [] : [{ key: m.summary, value: s.summary }], (k) => k.key,
      (enter) => enter.append("line").attr("class", "sd-summary"));
    dots.raise();
    tick.raise();
    dots.filter((q) => q.focus).raise();
  });
  const sides = d.points ? ["low", "high"].filter((k) => d.overflow[k] > 0).map((k) => ({ key: k, n: d.overflow[k] })) : [];
  keyed(row.selectAll(OVERFLOW), sides, (o) => o.key, (enter) => {
    const g = enter.append("g").attr("class", "sd-overflow");
    g.append("rect").attr("class", "sd-overflow-box");
    g.append("text").attr("class", "sd-overflow-count");
    return g;
  });
}

/** Copies each halo copy's opacity from the mark just after it (`halo` copies geometry only). */
const haloOpacity = (copies) => copies.attr("opacity", function () {
  return this.nextSibling?.getAttribute("opacity") ?? null;
});

/**
 * Writes one strip of `view` (s, from stripAt): its dots, summary tick and overflow boxes. `x` is the value scale of
 * the view, `r` the dot radius, `band` the row's height, `out` the opacity of a mark that leaves.
 */
export function placeStrip(row, s, { x, r, band, m, stroke, out }) {
  const strip = row.selectAll(`${STRIP}:not(.sd-exiting)`);
  strip.selectAll(DOTS).each(function (q) {
    const leaving = gone(this);
    const at = leaving ? { v: q.value, dy: q.dy, o: out, fill: q.fill } : s.points.get(q.id);
    dot(d3.select(this), { r, color: at.fill })
      .attr("data-id", q.id).classed("sd-focus", !leaving && q.focus)
      .attr("cx", x(at.v)).attr("cy", at.dy).attr("opacity", opacity(at.o));
  });
  // The tick runs across the strip, a little inside the band, over the dots (no halo: it would hide them).
  const half = Math.max(r * 1.5, band / 2 - r * 0.5);
  strip.selectAll(SUMMARY).each(function (k) {
    const leaving = gone(this);
    const at = leaving ? { v: k.value, o: out } : s.summary;
    d3.select(this).attr("x1", x(at.v)).attr("x2", x(at.v)).attr("y1", -half).attr("y2", half).attr("stroke", stroke).attr("opacity", opacity(at.o));
  });
  // Overflow boxes: the count, muted, in a box past that end of the axis (the margin keeps room for it).
  const f = m.font;
  const gap = f * OVERFLOW_GAP;
  const h = f * 1.3;
  row.selectAll(OVERFLOW).each(function (o) {
    const wide = overflowWidth(o.n, f, m.charW);
    const g = d3.select(this).attr("data-side", o.key)
      .attr("transform", `translate(${o.key === "low" ? -(gap + wide) : m.pw + gap},0)`)
      .attr("opacity", opacity(gone(this) ? out : s.overflow[o.key]));
    g.select("rect").attr("x", 0).attr("y", -h / 2).attr("width", wide).attr("height", h).attr("rx", f * 0.2);
    g.select("text").attr("x", wide / 2).attr("y", 0).attr("dy", "0.35em").attr("text-anchor", "middle").text(overflowText(o.key, o.n));
  });
}

/** The join line, present while the followed item has a dot in at least two shown strips. */
export function joinFocus(g, m) {
  const on = m.strips && m.focus !== null && m.rows.filter((r) => r.shown && r.points.some((q) => q.focus)).length >= 2;
  keyed(g.selectAll(JOIN), on ? [{ key: m.focus }] : [], (j) => j.key, (enter) => enter.append("path").attr("class", "sd-focus-join"));
}

/** `M a L b` for each pair of consecutive points, each end cut back by `trim` so the line stops at the dots' rings. */
function segments(points, trim) {
  let d = "";
  for (let i = 1; i < points.length; i++) {
    const [[ax, ay], [bx, by]] = [points[i - 1], points[i]];
    const length = Math.hypot(bx - ax, by - ay);
    if (length <= 2 * trim) continue;
    const [ux, uy] = [((bx - ax) / length) * trim, ((by - ay) / length) * trim];
    d += `M${ax + ux},${ay + uy}L${bx - ux},${by - uy}`;
  }
  return d || null;
}

/**
 * Writes the join of `view`: through the item's dots in row order, in the strips on screen (a strip without the
 * item is skipped), wherever they are now. It fades in with `view.in` when it appears (with `view.join` at an
 * entrance, the end of the build) and out with `view.out` when it goes.
 */
export function placeFocus(g, m, view, { x, yOf, r }) {
  const joins = g.selectAll(JOIN).each(function (j) {
    const points = [];
    for (const row of m.rows) {
      const s = view.rows.get(row.key);
      const q = s.visible ? s.points?.get(j.key) : null;
      if (q) points.push([x(q.v), yOf(s.slot) + q.dy]);
    }
    const o = gone(this) ? view.out : view.join ?? (this.__sdSeen ? 1 : view.in);
    d3.select(this).attr("d", segments(points, r + 3)).attr("opacity", opacity(o));
  });
  haloOpacity(halo(joins, { under: true }));
}
