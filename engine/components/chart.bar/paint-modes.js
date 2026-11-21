// The mode-specific pieces of chart.bar's model, view and painting. index.js owns mount and update, the shared model
// (scale, ticks, frame, one entry per category) and the shared paint (axes, band labels, bars, whiskers); it calls these
// for what only a mode has. The pure maths of the modes is in ./modes.js.
//
// Waterfall: each bar runs from `start` to `end` (the running totals over the shown bars, `stack`); dotted connectors
// (`linksOf`, painted by `paintConnectors`) join each shown bar's end to the next shown bar, and the last to the total
// bar (`totalBar`, key TOTAL, in the last band). Value labels are signed (`signedSpec`); their side (past the end,
// inside against it, or past the start) is chosen once from the model at rest with `fit` (`placeSides`) and kept
// through a motion (`placeFlowLabel`). Colours: increases the diverging palette's `high` role, decreases its `low`
// role (`invert` swaps them, `waterfallColors`), the total in ink. In a motion every bar's start and end tween from
// where it was to where it goes (`flowEnds`): a hidden bar is already a point on the running total, so a category that
// appears grows from the running total before it while the later bases move up, and `bars` <-> `waterfall` lifts each
// bar onto its base or sets it back on zero. Connectors follow their bar's end (`linksView`); new ones, and the total
// (`totalView`), fade in.
//
// Back-to-back: one band per category, the left group's bar extending left of the centre rule (the baseline at zero)
// and the right group's right. They are plain bars on a mirrored axis [-n, n]: a left bar carries its value negated and
// its interval flipped (lo' = -hi, hi' = -lo), so the plain bars' paint and motion draw it, grow it out of the rule
// and slide it on a re-sort, while its text, like the ticks', shows the magnitude. `pairModel` builds two marks per band
// (keyed `<half>:<category>`, `half` "left" or "right"; index.js paints them with `data-key` = the category and
// `data-side` = the half: not `side`, which is a waterfall label's place), one band label per
// category, and the side titles (`paintSideTitles`), in the group colours (the categorical palette's first two; as
// text through `textColor`, so they reach 4.5:1). `highlight` names a group (the other side's bars dim and its title
// turns muted) or a category (the other bands dim on both sides); the titles' colours tween with the bars'
// (`sideColors`).
import { d3 } from "../../core/d3.js";
import { fit } from "../../core/chart.js";
import { textColor } from "../../core/color.js";
import { lerp, focusPaint, tweenColor } from "../../core/kit.js";
import { lerp as lerpNull } from "../../core/chart-layout.js"; // a missing end gives the end value
import { waterfall, hasTotal, backToBack, backToBackOrder, categoriesOf } from "./modes.js";

export const TOTAL = "__total"; // the key of a waterfall's total bar
const SIDES = ["left", "right"];

const tokenColor = (tokens, name) => tokens?.[name]?.trim() || null; // a value: var() does not work in a fill attribute

// --- Waterfall: model ---------------------------------------------------------------------------------------------

/** The format spec with a `+` for positive values (unless it already names a sign), for a waterfall's contributions. */
export function signedSpec(spec) {
  const parsed = d3.formatSpecifier(spec);
  if (parsed.sign === "-") parsed.sign = "+";
  return String(parsed);
}

/**
 * A waterfall's increases and decreases -> [rise, fall]: the diverging palette's high and low roles (its last and
 * first colours in a palette without roles, `fill` without a palette), swapped by `invert`.
 */
export function waterfallColors(ctx, fill, invert) {
  const diverging = ctx.palette?.("diverging");
  const high = diverging?.roles?.high ?? diverging?.colors?.at(-1) ?? fill;
  const low = diverging?.roles?.low ?? diverging?.colors?.[0] ?? fill;
  return invert === true ? [low, high] : [high, low];
}

/** Sets each bar's `start`, `end` and `up` from the running totals over the shown bars (an empty value throws); -> the sum. */
export function stack(bars) {
  const flow = waterfall(bars, { total: true });
  flow.bars.forEach((s, i) => Object.assign(bars[i], { start: s.start, end: s.end, up: bars[i].value >= 0 }));
  return flow.total.end;
}

/** The total bar, in band `slot`: from zero to `sum`, in ink, labelled from the props that ask for it (`totalProps`). */
export function totalBar({ totalProps, props, ctx, slot, sum, flow, fv, ink, muted }) {
  const label = totalProps.total === true ? (ctx.t?.("total") ?? "Total") : String(totalProps.total);
  const dim = props.highlight != null;
  return {
    key: TOTAL, label, slot, value: sum, lo: null, hi: null, start: 0, end: sum, up: sum >= 0,
    text: fv(sum), title: `${label}: ${fv(sum)}`, shown: flow && hasTotal(props.total), dim,
    fill: focusPaint(ctx, ink, dim), labelFill: dim && muted ? muted : ink,
  };
}

/** The connectors: each shown bar's end to the next shown bar, and the last to the total when it is shown. */
export function linksOf(bars, total, flow) {
  if (!flow) return [];
  const visible = bars.filter((b) => b.shown);
  const links = visible.slice(0, -1).map((b, i) => ({ key: b.key, next: visible[i + 1].key, at: b.end }));
  if (total?.shown && visible.length) links.push({ key: visible.at(-1).key, next: TOTAL, at: visible.at(-1).end });
  return links;
}

/**
 * Where a waterfall bar's value label sits, decided once from the model at rest: "end" (past its end, or its
 * whisker's), "inside" (inside the bar, against its end) or "start" (past its start), by `fit` along the bar's own
 * direction (`dir`, so a bar of no length still points the way its value does) within `range` (plot pixels).
 */
function sideOf(b, scale, [lo, hi], dir, gap, width) {
  const tip = b.lo !== null && b.hi !== null ? (b.up ? Math.max(b.end, b.start + b.hi) : Math.min(b.end, b.start + b.lo)) : b.end;
  const spot = fit(dir * scale(tip), dir * scale(b.start), width, dir > 0 ? [lo, hi] : [-hi, -lo], gap);
  return spot.inside ? "inside" : spot.anchor === "start" ? "end" : "start";
}

/**
 * Sets `side` on every band: the value labels' room along the value axis is the plot and the label room on either
 * side of it (horizontal), or the room above it under the axis title and the room kept below it (vertical).
 */
export function placeSides(bands, domain, { horizontal, pw, ph, margin, labelRoom, hasY, font, charW }) {
  const scale = d3.scaleLinear().domain(domain).range(horizontal ? [0, pw] : [ph, 0]);
  const range = horizontal ? [-labelRoom, pw + margin.right] : [-(margin.top - (hasY ? font * 1.2 : 0)), ph + labelRoom];
  for (const b of bands) b.side = sideOf(b, scale, range, (horizontal ? 1 : -1) * (b.up ? 1 : -1), font * 0.4, horizontal ? b.text.length * charW : font);
}

/** The band slot of a bar or the total. */
const slotOf = (m, key) => (key === TOTAL ? m.total.slot : m.bars.find((b) => b.key === key).slot);

/** The connectors at rest. */
export const staticLinks = (m) => m.links.map((l) => ({ key: l.key, a: slotOf(m, l.key), b: slotOf(m, l.next), at: l.at, opacity: 1 }));

// --- Waterfall: paint ---------------------------------------------------------------------------------------------

/**
 * The connectors, under the bars (at a fixed place in the plot, so the markup does not depend on how many frames were
 * painted): each runs straight across the bands from its bar's end to the next bar's edge. No group without links.
 */
export function paintConnectors(plot, view, { centerOf, thick, scale, horizontal }) {
  const connectors = plot.selectAll("g.sd-connectors").data(view.links ? [0] : [])
    .join((enter) => enter.insert("g", "g.sd-bars").attr("class", "sd-connectors"));
  connectors.selectAll("line.sd-connector").data(view.links ?? [], (d) => d.key)
    .join((enter) => enter.append("line").attr("class", "sd-connector"))
    .attr("data-key", (d) => d.key)
    .order()
    .each(function (d) {
      const [a, b] = [centerOf(d.a), centerOf(d.b)];
      const half = (b >= a ? 1 : -1) * (thick / 2);
      const at = scale(d.at);
      d3.select(this)
        .attr("x1", horizontal ? at : a + half).attr("x2", horizontal ? at : b - half)
        .attr("y1", horizontal ? a + half : at).attr("y2", horizontal ? b - half : at)
        .attr("opacity", d.opacity === 1 ? null : d.opacity);
    });
}

/** A waterfall bar's value label, on the side the model chose at rest, following the bar's ends (and whisker) as they move. */
export function placeFlowLabel(label, d, s, { horizontal, scale, v, end, base, center, hasWhisker, gap }) {
  const dir = (horizontal ? 1 : -1) * (d.up ? 1 : -1); // the bar's direction in pixels
  const tip = hasWhisker ? scale(d.up ? Math.max(v, lerp(v, s.hi, s.whisker)) : Math.min(v, lerp(v, s.lo, s.whisker))) : end;
  const side = s.side ?? "end";
  const at = side === "end" ? tip + dir * gap : side === "inside" ? end - dir * gap : base - dir * gap;
  const forward = side === "end" ? dir > 0 : dir < 0; // the text runs towards higher pixel values from `at`
  label
    .attr("x", horizontal ? at : center)
    .attr("y", horizontal ? center : at)
    .attr("dy", horizontal ? "0.35em" : forward ? "0.71em" : "0em") // always written: see the plain bars' label
    .attr("text-anchor", horizontal ? (forward ? "start" : "end") : "middle");
}

// --- Waterfall: motion --------------------------------------------------------------------------------------------

/** A bar's ends at rest, and the point it grows out of (plain bars: zero; a waterfall's: its start). */
const rest = (m, b) => (m.mode === "waterfall" ? [b.start, b.end] : [0, b.value ?? 0]);
const point = (m, b) => (m.mode === "waterfall" ? [b.start, b.start] : [0, 0]);

/**
 * A bar's ends at `t` when a waterfall is at either end of the change: both tween over the whole motion, from its ends
 * (a bar that was hidden: the point it grows out of; an entrance: zero, so the whole waterfall grows out of zero and
 * stays joined) to its new ends (or its point). `p` is the bar in `from` (or `b` when it is new there).
 * -> { start, v, lo, hi } (lo and hi on the running total, or null).
 */
export function flowEnds(from, to, p, b, { known, enterAll, wasShown, t }) {
  const fromModel = known ? from : to;
  const [s0, e0] = enterAll ? [0, 0] : wasShown ? rest(fromModel, p) : point(fromModel, p);
  const [s1, e1] = b.shown ? rest(to, b) : point(to, b);
  const start = lerp(s0, s1, t);
  const lo = lerpNull(p.lo, b.lo, t);
  const hi = lerpNull(p.hi, b.hi, t);
  return { start, v: lerp(e0, e1, t), lo: lo === null ? null : start + lo, hi: hi === null ? null : start + hi };
}

/**
 * The total's view at `t`: it stays in its band, tweens its end while it stays, and fades in or out where it is.
 * `a` is the total of the model played from (null in an entrance or when it had none), `b` the target's.
 */
export function totalView(a, b, { enterAll, t, live }) {
  const [was, is] = [Boolean(a?.shown), b.shown];
  let v = b.end;
  let opacity = 1;
  let labelOpacity = 1;
  if (enterAll) [v, labelOpacity] = [b.end * t, t];
  else if (was && is) v = lerp(a.end, b.end, t);
  else if (is) opacity = t;
  else if (was) [v, opacity] = [a.end, 1 - t];
  return {
    slot: b.slot, start: 0, v, lo: null, hi: null, whisker: 1, visible: was || is, labelOpacity, opacity,
    side: was && !is ? a.side : b.side, ...live,
  };
}

/**
 * The connectors at `t`: each leaves its bar's current end (from `view.bars`). One that stays turns to its new next bar;
 * a new one fades in, and one that goes fades out.
 */
export function linksView(from, to, view, { enterAll, t }) {
  const now = (key) => view.bars.get(key);
  const was = new Map((enterAll || !from ? [] : from.links).map((l) => [l.key, l]));
  const is = new Map(to.links.map((l) => [l.key, l]));
  const links = [];
  for (const [key, l] of is) {
    const o = was.get(key);
    links.push({ key, a: now(key).slot, b: o ? lerp(now(o.next).slot, now(l.next).slot, t) : now(l.next).slot, at: now(key).v, opacity: o ? 1 : t });
  }
  for (const [key, o] of was) if (!is.has(key)) links.push({ key, a: now(key).slot, b: now(o.next).slot, at: now(key).v, opacity: 1 - t });
  return links;
}

// --- Back-to-back -------------------------------------------------------------------------------------------------

/**
 * The marks of a back-to-back chart, from the rows and props alone (backToBack and backToBackOrder in ./modes.js throw
 * naming the problem): two bars per band in display order, `bands` one per category (each pointing at a bar of its band,
 * `bar`, for its slot and visibility), `sides` the titles [left, right] with their colours, and `pairing`: the `group`
 * column and the groups in order, which a played change must keep (else it snaps).
 */
export function pairModel(rows, props, ctx, { fv, fx, ink, muted }) {
  const pair = backToBack(rows, props);
  const order = backToBackOrder(rows, props);
  const raws = new Map();
  for (const r of categoriesOf(rows, props.x)) if (!raws.has(String(r[props.x]))) raws.set(String(r[props.x]), r[props.x]);
  const shown = Array.isArray(props.shown) ? new Set(props.shown.map(String)) : null;
  const palette = ctx.palette?.("categorical")?.colors ?? [];
  const accent = tokenColor(ctx.tokens, "--sd-color-accent");
  const colors = [palette[0] ?? accent, palette[1] ?? palette[0] ?? accent];
  const background = tokenColor(ctx.tokens, "--sd-color-background");
  const name = props.highlight == null ? null : String(props.highlight);
  const byGroup = name !== null && pair.groups.includes(name); // else a category (backToBack checked it is one)
  const byKey = new Map(pair.categories.map((c) => [c.key, c]));
  const bands = [];
  const bars = [];
  order.forEach((key, slot) => {
    const raw = raws.get(key);
    const label = fx && typeof raw === "number" ? fx(raw) : key;
    bands.push({ key, label, bar: `right:${key}` });
    SIDES.forEach((side, i) => {
      const { value, lo, hi } = byKey.get(key)[side];
      const group = pair.groups[i];
      const dim = name !== null && (byGroup ? group !== name : key !== name);
      const flip = side === "left";
      const text = value === null ? "" : fv(value);
      const range = lo !== null ? ` (${fv(lo)} – ${fv(hi)})` : "";
      bars.push({
        key: `${side}:${key}`, category: key, half: side, label, slot,
        value: value === null ? null : flip ? -value : value, lo: lo === null ? null : flip ? -hi : lo, hi: hi === null ? null : flip ? -lo : hi,
        text, title: `${label}, ${group}: ${text}${range}`, shown: shown ? shown.has(key) : true, dim,
        fill: focusPaint(ctx, colors[i], dim), labelFill: dim && muted ? muted : ink,
      });
    });
  });
  const sides = pair.groups.map((group, i) => ({
    side: SIDES[i], label: group, fill: byGroup && group !== name && muted ? muted : textColor(colors[i], background),
  }));
  return { bars, bands, total: null, links: [], sides, pairing: JSON.stringify([props.group, pair.groups]) };
}

/**
 * The side titles, above the plot (in the svg, at the plot's margin), each centred over its half; none without
 * `m.sides`. `view.sides` maps a side to its colour now (a fill attribute); `text` writes the label on a motion's first frame.
 */
export function paintSideTitles(svg, m, view, { scale, font, text }) {
  const half = view.domain[1] / 2;
  const titles = svg.selectAll("text.sd-side-title").data(m.sides ?? [], (d) => d.side)
    .join((enter) => enter.append("text").attr("class", "sd-side-title"))
    .attr("data-side", (d) => d.side)
    .attr("x", (d) => view.margin.left + scale(d.side === "left" ? -half : half))
    .attr("y", view.margin.top - font * 0.6)
    .attr("text-anchor", "middle")
    .attr("fill", (d) => view.sides.get(d.side));
  text(titles, (d) => d.label);
}

/** The side titles' colours at rest: side -> colour, or null for a chart without sides. */
export const staticSides = (m) => (m.sides ? new Map(m.sides.map((s) => [s.side, s.fill])) : null);

/**
 * The side titles' colours while a change from `from` to `to` plays: `live` (side -> colour, read by each frame) starts
 * at the old colours, and `tweens` move each changed one to its new colour over `opts` (the bars' focus timing).
 */
export function sideColors(from, to, ctx, opts) {
  const live = new Map();
  const tweens = [];
  for (const s of to.sides ?? []) {
    const p = from?.sides?.find((x) => x.side === s.side) ?? s;
    live.set(s.side, p.fill);
    if (p.fill !== s.fill) tweens.push(tweenColor(ctx, p.fill, s.fill, (c) => { live.set(s.side, c); }, opts));
  }
  return { live, tweens };
}
