// Built-in `chart.bar`: one bar per category from a CSV, horizontal or vertical, with a direct value
// label at the end of each bar, an optional interval whisker and a transient highlight; or, with
// `mode: "waterfall"`, the same rows as contributions stacked into a running total.
//
// Everything on screen is a pure function of (model, view):
//   - the model is computed from props and rows alone (scale domain, ticks, margins, one entry per category);
//   - the view is the moment inside a motion (domain, plot size, bar ends, whisker progress, colours).
// `paint` writes a view into the DOM with keyed joins and sets every attribute it owns on every call (the text,
// which only depends on the model, on the first frame of a motion and in the static view), so the markup
// after settled() is the same whether a state was jumped to or played. Every update ends with the
// static view of the target model (renderStatic); with info.animate it first plays the change from the
// previous model through a single ctx.animate.tween bound to info.signal, so an abort snaps straight to the
// end state. No inline style is ever written: motion only changes attributes.
//
// Scales and slots:
//   - the value domain is the `domain` prop, else [min(0, every y and interval value), max(...)] over every row
//     of the data, shown or not, rounded outward to tick values (`nice`); it moves only when `y`, `interval`
//     or `domain` change, and then it tweens. A waterfall's domain covers the running totals (and whiskers) of every
//     waterfall step of the slide instead (waterfallSpan in ./modes.js, over ctx.stepProps);
//   - categories keep their band whether or not they are shown, in the sorted order (`sort`, through `rank`; the data
//     order without it): every category is ranked, then the hidden ones are hidden, so a hidden category keeps its
//     slot (`slot` on each model bar). A hidden category is laid out at its final length (a waterfall's at no length,
//     on the running total of its slot) and hidden with CSS visibility, so nothing reflows.
// Waterfall: each bar runs from `start` to `end` (the running totals over the shown bars, ./modes.js); dotted
// connectors (`m.links`) join each shown bar's end to the next shown bar, and the last to the total bar (`m.total`,
// key "__total", in the last band; a category of that name is an element error). A slide that is a waterfall at any
// step keeps the total's band, the signed label room on both sides of the plot (the band axis set back by it) and
// margins for every step's axis at every step, so a mode or `total` change never reflows the frame. Value labels are
// signed; their side (past the end, inside against it, or past the start) is chosen once from the model at rest with
// `fit` and kept through a motion; with the label room, every label within the axis lands past its end. Colours: increases the diverging palette's `high` role, decreases its
// `low` role (`invert` swaps them), the total in ink.
// Motion: a category that appears grows from zero and then its whisker is drawn (GROW is the share of the
// motion given to the bar); a category that leaves does it in reverse; a changed value tweens the bar, its
// whisker and its label; a changed `sort` slides every bar, with its band label, whisker and value label, from its old
// band to its new one (a bar's band centre interpolates from its old slot to its new one; a bar that appears is at
// its final slot from the start); `highlight` tweens the other bars to the theme's --sd-color-dim over
// --sd-duration-fast (never opacity, which would lower the contrast of the labels) and draws the highlighted
// bar after (above) them. When a waterfall is involved (either end of the change) every bar's start and end tween
// from where it was to where it goes: a hidden bar is already a point on the running total, so a category that
// appears grows from the running total before it while the later bases move up, and `bars` <-> `waterfall` lifts each
// bar onto its base or sets it back on zero. Connectors follow their bar's end; new ones, and the total, fade in.
// Entrance: the chart owns it (`"x-enter": "own"` in schema.json). With info.entrance.motion "draw" every shown
// bar grows from zero and then draws its whisker (a waterfall grows out of zero as a whole, so it stays joined), over
// info.entrance.duration (else 2 x --sd-duration), while the box stays still. The zero-length bars are written before
// the first await, in the same task as the engine shows the element, so the chart never paints at full length first.
// Any other entrance ("none", or a box motion) renders the end state at once.
// Colors come from ctx.palette("categorical") (the first color), ctx.palette("diverging") and theme tokens; sizes
// from the label token.
import { d3 } from "../../core/d3.js";
import { loadTable, tickFormat, opacityAttr, rank, fit, wrapLabel, frame, whisker, morph, entrance } from "../../core/chart.js";
import { SVG_NS, lerp, clamp01, motion, focusPaint, tweenColor } from "../../core/kit.js";
import { waterfall, waterfallSteps, waterfallDomain, valueOf, categoriesOf, hasTotal } from "./modes.js";

const GROW = 0.6; // share of a motion in which an entering bar grows; its whisker is drawn in the rest
const THICK = 0.65; // bar thickness as a share of its band
const THICK_MAX = 4; // ... and its cap, in label font sizes
const TOTAL = "__total"; // the key of a waterfall's total bar

const lerpNull = (a, b, t) => (a === null || b === null ? b : lerp(a, b, t));
const tokenColor = (tokens, name) => tokens?.[name]?.trim() || null; // a value: var() does not work in a fill attribute

/** Loads the rows and checks the props against them. Throws naming the column or the category. */
async function loadRows(props, ctx) {
  const rows = await loadTable(props, ctx, "chart.bar", [
    ["x", props.x], ["y", props.y], ["interval.lower", props.interval?.lower, true], ["interval.upper", props.interval?.upper, true],
  ]);
  if (props.domain !== undefined && !validDomain(props.domain)) throw new Error("`domain` must be [min, max] with min < max");
  const keys = categoriesOf(rows, props.x).map((r) => String(r[props.x]));
  const seen = new Set();
  for (const key of keys) {
    if (seen.has(key)) throw new Error(`category '${key}' appears more than once in ${props.data} (chart.bar needs one row per category)`);
    seen.add(key);
  }
  const ids = [["shown", Array.isArray(props.shown) ? props.shown : []], ["highlight", props.highlight == null ? [] : [props.highlight]]];
  for (const [prop, list] of ids) {
    for (const id of list) {
      if (!seen.has(String(id))) throw new Error(`category '${id}' in \`${prop}\` not found in ${props.data} (categories: ${keys.join(", ")})`);
    }
  }
  return rows;
}

const validDomain = (d) => Array.isArray(d) && d.length === 2 && d.every((v) => Number.isFinite(v)) && d[0] < d[1];

/** Plain bars' value extent for props `p`: [min(0, every y and interval value), max(...)] over every row. */
function barsExtent(rows, p) {
  const lower = p.interval?.lower;
  const upper = p.interval?.upper;
  const both = Boolean(lower && upper);
  const all = rows.flatMap((r) => [valueOf(r, p.y), both ? valueOf(r, lower) : null, both ? valueOf(r, upper) : null]).filter((v) => v !== null);
  return [Math.min(0, d3.min(all) ?? 0), Math.max(0, d3.max(all) ?? 0)];
}

/** An extent rounded outward to tick values (an empty one first widened to one unit). */
function niceDomain([lo, hi]) {
  return d3.scaleLinear().domain([lo, lo < hi ? hi : lo + 1]).nice(5).domain();
}

/** The format spec with a `+` for positive values (unless it already names a sign), for a waterfall's contributions. */
function signedSpec(spec) {
  const parsed = d3.formatSpecifier(spec);
  if (parsed.sign === "-") parsed.sign = "+";
  return String(parsed);
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

/** The target state, from props and rows alone. Pixel positions are derived from it by `geometry`. */
function buildModel(props, rows, ctx, el) {
  const orient = props.orient === "vertical" ? "vertical" : "horizontal";
  const horizontal = orient === "horizontal";
  const mode = props.mode === "waterfall" ? "waterfall" : "bars";
  const flow = mode === "waterfall";
  const lower = props.interval?.lower;
  const upper = props.interval?.upper;
  const hasInterval = Boolean(lower && upper);
  // A slide that is a waterfall at some step lays out as one at every step (the total's band, signed label room, the
  // margins of every step's axis), so a mode change moves the bars and never the frame.
  const steps = [props, ...(ctx.stepProps ?? [])].filter(Boolean);
  const totalAt = (p) => p.mode === "waterfall" && hasTotal(p.total);
  const flowSlide = steps.some((p) => p.mode === "waterfall");
  const totalProps = totalAt(props) ? props : steps.find(totalAt);
  // The slide's waterfalls over this data (this step's first when it is one: its empty value throws here).
  const flows = flowSlide ? waterfallSteps(rows, props, ctx.stepProps ?? null) : [];

  // The domain covers every row (not only the shown ones) so the axis never moves as categories appear; a waterfall's
  // covers every running total of every waterfall step of the slide. `domain` is used as given (validated by loadRows
  // for this step), never rounded.
  const domainAt = (p) => (p.domain !== undefined ? [p.domain[0], p.domain[1]] : niceDomain(p.mode === "waterfall" ? waterfallDomain(flows) : barsExtent(rows, p)));
  const domain = domainAt(props);
  // The axes the frame is sized for: this step's, or on a waterfall slide every step's over this data.
  const frameDomains = flowSlide ? steps.filter((p) => p.data === props.data && (p.domain === undefined || validDomain(p.domain))).map(domainAt) : [domain];
  const tickValues = d3.scaleLinear().domain(domain).ticks(5);
  const fy = tickFormat(ctx, props.format?.y, tickValues);
  const fv = props.format?.y ? ctx.format(props.format.y) : ctx.format(",~r"); // value labels: as precise as the data
  const fs = flowSlide ? ctx.format(signedSpec(props.format?.y ?? ",~r")) : fv; // a waterfall's contributions, signed
  const fl = flow ? fs : fv;
  const fx = props.format?.x ? ctx.format(props.format.x) : null;
  const ticks = tickValues.map((value) => ({ value, label: fy(value) }));
  const tickLabels = (d) => {
    const values = d3.scaleLinear().domain(d).ticks(5);
    return values.map(tickFormat(ctx, props.format?.y, values));
  };

  const categories = categoriesOf(rows, props.x);
  const shown = new Set(Array.isArray(props.shown) ? props.shown.map(String) : categories.map((r) => String(r[props.x])));
  const colors = ctx.palette?.("categorical")?.colors ?? [];
  const fill = colors[0] ?? tokenColor(ctx.tokens, "--sd-color-accent");
  const ink = tokenColor(ctx.tokens, "--sd-color-ink");
  const muted = tokenColor(ctx.tokens, "--sd-color-muted");
  // A waterfall's increases and decreases: the diverging palette's high and low roles (its last and first colours
  // in a palette without roles), swapped by `invert`.
  const diverging = flow ? ctx.palette?.("diverging") : null;
  const high = diverging?.roles?.high ?? diverging?.colors?.at(-1) ?? fill;
  const low = diverging?.roles?.low ?? diverging?.colors?.[0] ?? fill;
  const [rise, fall] = props.invert === true ? [low, high] : [high, low];
  const made = categories.map((row) => {
    const raw = row[props.x];
    const key = String(raw);
    const value = valueOf(row, props.y);
    const lo = hasInterval ? valueOf(row, lower) : null;
    const hi = hasInterval ? valueOf(row, upper) : null;
    const dim = props.highlight != null && String(props.highlight) !== key;
    const label = fx && typeof raw === "number" ? fx(raw) : key;
    const text = value === null ? "" : fl(value);
    const range = value !== null && lo !== null && hi !== null ? ` (${fl(lo)} – ${fl(hi)})` : "";
    const color = flow ? (value !== null && value < 0 ? fall : rise) : fill;
    return {
      bar: {
        key, label, value, lo: value === null ? null : lo, hi: value === null ? null : hi,
        text, title: `${label}: ${text}${range}`, shown: shown.has(key), dim,
        fill: focusPaint(ctx, color, dim), labelFill: dim && muted ? muted : ink,
      },
      columns: row,
    };
  });
  // The order: every category is ranked, shown or not, so a hidden one keeps its slot. The errors are rank's.
  const byKey = new Map(made.map(({ bar }) => [bar.key, bar]));
  if (totalProps && byKey.has(TOTAL)) throw new Error(`category '${TOTAL}' in ${props.data} is the name the total bar uses: rename it`);
  const bars = rank(made.map(({ bar, columns }) => ({ key: bar.key, value: bar.value, columns })), props.sort).map((key) => byKey.get(key));
  bars.forEach((b, i) => {
    b.slot = i;
  });

  // A waterfall's bars run between running totals over the shown bars (an empty value throws here); its total bar,
  // in the band after the categories, is kept on every step of a slide that shows one at some step.
  let sum = 0;
  if (flow) {
    const stack = waterfall(bars, { total: true });
    stack.bars.forEach((s, i) => Object.assign(bars[i], { start: s.start, end: s.end, up: bars[i].value >= 0 }));
    sum = stack.total.end;
  }
  let total = null;
  if (totalProps) {
    const label = totalProps.total === true ? (ctx.t?.("total") ?? "Total") : String(totalProps.total);
    const dim = props.highlight != null;
    total = {
      key: TOTAL, label, slot: bars.length, value: sum, lo: null, hi: null, start: 0, end: sum, up: sum >= 0,
      text: fv(sum), title: `${label}: ${fv(sum)}`, shown: flow && hasTotal(props.total), dim,
      fill: focusPaint(ctx, ink, dim), labelFill: dim && muted ? muted : ink,
    };
  }
  const bands = total ? [...bars, total] : bars;
  const visible = bars.filter((b) => b.shown);
  const links = !flow ? [] : visible.slice(0, -1).map((b, i) => ({ key: b.key, next: visible[i + 1].key, at: b.end }));
  if (flow && total?.shown && visible.length) links.push({ key: visible.at(-1).key, next: TOTAL, at: visible.at(-1).end });

  // Fixed margins from character counts (not measured text), so layout never depends on font timing.
  // Room for a value label at a bar's end. It must not depend on the current `y`, or the plot would resize (and the
  // fixed axis slide) when `y` switches: use the widest label over every numeric column but the category, and the domain ends.
  // On a waterfall slide every step's axis ends count, signed, and the total of every step that shows one.
  const fw = flowSlide ? fs : fv;
  const columns = rows.length ? Object.keys(rows[0]).filter((c) => c !== props.x) : [];
  const widest = Math.max(
    ...frameDomains.flatMap((d) => [fw(d[0]).length, fw(d[1]).length]),
    ...columns.flatMap((c) => rows.map((r) => valueOf(r, c)).filter((v) => v !== null).map((v) => fw(v).length)),
    ...bars.map((b) => b.text.length),
    ...flows.filter((f) => f.total).map((f) => fv(f.total.end).length),
  );
  const below = frameDomains.some((d) => d[0] < 0);
  const hasX = props.axes?.x != null && String(props.axes.x) !== "";
  const hasY = props.axes?.y != null && String(props.axes.y) !== "";
  const n = Math.max(1, bands.length);
  // The category labels wrap to the room the plot leaves them, and the margin across the bands follows from
  // the wrapped lines, so each orientation sizes one pair of sides, then the plot, then wraps (setting
  // `b.lines`), then sizes the other pair. A waterfall keeps a value label's room on both sides of the plot (a
  // decrease's label points left, or down), with the band axis set back by the room on its side (`labelRoom`), so no
  // label has to go inside its bar.
  let lineH = 0;
  let labelRoom = 0;
  const { w, h, font, charW, margin, pw, ph } = frame(el, ctx, ({ font, charW, w, h }) => {
    lineH = font * 1.15;
    const labelW = widest * charW + font * 0.6;
    if (horizontal) {
      // Category labels left of the plot, value ticks under it, value labels past the bar ends.
      labelRoom = flowSlide ? labelW : 0;
      const top = Math.round(hasX ? font * 1.9 : font * 0.6);
      const bottom = Math.round(hasY ? font * 3.6 : font * 1.9);
      const plotH = Math.max(1, h - top - bottom);
      const maxChars = Math.max(4, Math.floor((w * 0.34 - font * 0.6) / charW));
      const maxLines = Math.max(1, Math.floor((plotH / n) / lineH));
      for (const b of bands) b.lines = wrapLabel(b.label, maxChars, maxLines);
      const chars = Math.max(1, ...bands.flatMap((b) => b.lines.map((l) => l.length)));
      return { top, bottom, left: chars * charW + font * 0.6 + (domain[0] < 0 || flowSlide ? labelW : 0), right: domain[1] > 0 || flowSlide ? labelW : font * 0.6 };
    }
    // Value ticks left of the plot, category labels under it, value labels above the bar ends.
    labelRoom = flowSlide ? font * 1.5 : 0;
    const tickChars = flowSlide ? frameDomains.flatMap((d) => tickLabels(d).map((l) => l.length)) : ticks.map((t) => t.label.length);
    const left = Math.round(Math.max(1, ...tickChars) * charW + font * 0.6);
    const right = Math.round(font * 0.6);
    const plotW = Math.max(1, w - left - right);
    const maxChars = Math.max(3, Math.floor((plotW / n) * 0.95 / charW));
    for (const b of bands) b.lines = wrapLabel(b.label, maxChars, 3);
    const lines = Math.max(1, ...bands.map((b) => b.lines.length));
    return {
      left, right,
      top: hasY ? font * 2.7 : font * 1.9,
      bottom: font * 0.5 + lines * lineH + (hasX ? font * 1.7 : font * 0.4) + (flowSlide ? labelRoom : below ? font * 1.4 : 0),
    };
  });
  if (flow) {
    // The value labels' room along the value axis: the plot and the label room on either side of it (horizontal), or
    // the room above it under the axis title and the room kept below it (vertical).
    const scale = d3.scaleLinear().domain(domain).range(horizontal ? [0, pw] : [ph, 0]);
    const range = horizontal ? [-labelRoom, pw + margin.right] : [-(margin.top - (hasY ? font * 1.2 : 0)), ph + labelRoom];
    for (const b of bands) b.side = sideOf(b, scale, range, (horizontal ? 1 : -1) * (b.up ? 1 : -1), font * 0.4, horizontal ? b.text.length * charW : font);
  }
  return {
    w, h, font, lineH, orient, mode, flowSlide, margin, pw, ph, domain, ticks, bars, total, links, labelRoom, hasInterval,
    axes: { x: hasX ? String(props.axes.x) : "", y: hasY ? String(props.axes.y) : "" },
  };
}

/** Every bar the model draws: the categories in display order, then the total's band when the slide has one. */
const marksOf = (m) => (m.total ? [...m.bars, m.total] : m.bars);

/** Where things sit for a model drawn with this domain and plot size (canvas pixels, plot coordinates). */
function geometry(m, domain, pw, ph) {
  const horizontal = m.orient === "horizontal";
  const scale = d3.scaleLinear().domain(domain).range(horizontal ? [0, pw] : [ph, 0]);
  const step = (horizontal ? ph : pw) / Math.max(1, marksOf(m).length);
  return { horizontal, scale, step, thick: Math.min(step * THICK, m.font * THICK_MAX), zero: scale(0), pw, ph };
}

/** A bar at rest: plain bars stand on zero (`v` is the end, `start` unset); a waterfall's runs from `start`. */
const restOf = (m, b) => (m.mode === "waterfall"
  ? { slot: b.slot, start: b.start, v: b.end, lo: b.lo === null ? null : b.start + b.lo, hi: b.hi === null ? null : b.start + b.hi, side: b.side }
  : { slot: b.slot, v: b.value, lo: b.lo, hi: b.hi });

const staticView = (m) => ({
  domain: m.domain, pw: m.pw, ph: m.ph, margin: { left: m.margin.left, top: m.margin.top },
  ticks: m.ticks.map((t) => ({ ...t, opacity: 1 })),
  bars: new Map(marksOf(m).map((b) => [b.key, { ...restOf(m, b), whisker: 1, visible: b.shown, labelOpacity: 1, fill: b.fill, labelFill: b.labelFill }])),
  links: m.mode === "waterfall" ? m.links.map((l) => ({ key: l.key, a: slotOf(m, l.key), b: slotOf(m, l.next), at: l.at, opacity: 1 })) : null,
});
const slotOf = (m, key) => (key === TOTAL ? m.total.slot : m.bars.find((b) => b.key === key).slot);

/** The start of an entrance: every shown bar at zero length, with no whisker and no label (as a morph's t = 0). */
const emptyView = (m) => {
  const view = staticView(m);
  for (const b of marksOf(m)) if (b.shown) Object.assign(view.bars.get(b.key), { v: 0, whisker: 0, labelOpacity: 0 }, m.mode === "waterfall" ? { start: 0 } : {});
  for (const l of view.links ?? []) Object.assign(l, { at: 0, opacity: 0 });
  return view;
};

export default {
  async mount(el, props, ctx) {
    const doc = el.ownerDocument;
    const svg = d3.select(el).append(() => doc.createElementNS(SVG_NS, "svg")).attr("class", "sd-chart-bar");
    const plot = svg.append("g").attr("class", "sd-plot");
    const gValue = plot.append("g").attr("class", "sd-axis sd-axis-value");
    const gBand = plot.append("g").attr("class", "sd-axis sd-axis-band");
    const gBars = plot.append("g").attr("class", "sd-bars");
    const baseline = plot.append("line").attr("class", "sd-axis-line");
    const bandTitle = svg.append("text").attr("class", "sd-axis-title sd-axis-title-band");
    const valueTitle = svg.append("text").attr("class", "sd-axis-title sd-axis-title-value");

    let last = null; // the last fully applied model
    await loadRows(props, ctx); // fail early (the controller shows the error) when a column or category is wrong

    /**
     * Writes `view` of model `m` into the DOM: every attribute the component owns, on every call. The text
     * depends on the model alone, so a motion writes it on its first frame only (`texts` false after that).
     */
    function paint(m, view, texts = true) {
      const text = (sel, value) => (texts ? sel.text(value) : sel);
      const g = geometry(m, view.domain, view.pw, view.ph);
      const { horizontal, scale, step, thick } = g;
      const f = m.font;
      const marks = marksOf(m);
      svg.attr("width", m.w).attr("height", m.h).attr("viewBox", `0 0 ${m.w} ${m.h}`).attr("data-orient", m.orient)
        .attr("data-mode", m.mode === "bars" ? null : m.mode);
      plot.attr("transform", `translate(${view.margin.left},${view.margin.top})`);

      // Value axis: grid lines and tick labels, keyed by tick value.
      gValue.selectAll("g.tick").data(view.ticks, (d) => d.value).join(
        (enter) => {
          const t = enter.append("g").attr("class", "tick");
          t.append("line").attr("class", "sd-grid-line");
          t.append("text");
          return t;
        },
      )
        .attr("transform", (d) => (horizontal ? `translate(${scale(d.value)},0)` : `translate(0,${scale(d.value)})`))
        .attr("opacity", opacityAttr)
        .order()
        .each(function (d) {
          const sel = d3.select(this);
          sel.select("line").attr("x1", 0).attr("x2", horizontal ? 0 : g.pw).attr("y1", 0).attr("y2", horizontal ? g.ph : 0);
          text(sel.select("text"), d.label)
            .attr("x", horizontal ? 0 : -f * 0.4).attr("y", horizontal ? g.ph + f * 0.5 : 0)
            .attr("dy", horizontal ? "0.71em" : "0.35em").attr("text-anchor", horizontal ? "middle" : "end");
        });
      baseline.attr("x1", horizontal ? g.zero : 0).attr("x2", horizontal ? g.zero : g.pw)
        .attr("y1", horizontal ? 0 : g.zero).attr("y2", horizontal ? g.ph : g.zero).raise();

      // Band axis: one label per category (wrapped), hidden with its bar. A bar sits at its view's `slot`: its index in
      // the sorted order, or a place between two while a re-sort plays.
      const centerOf = (slot) => step * (slot + 0.5);
      gBand.selectAll("text.sd-band-label").data(marks, (d) => d.key).join((enter) => enter.append("text").attr("class", "sd-band-label"))
        .attr("data-key", (d) => d.key)
        .attr("data-visible", (d) => String(view.bars.get(d.key).visible))
        .attr("y", (d) => (horizontal ? centerOf(view.bars.get(d.key).slot) - ((d.lines.length - 1) * m.lineH) / 2 : g.ph + f * 0.5 + m.labelRoom))
        .attr("text-anchor", horizontal ? "end" : "middle")
        .order()
        .each(function (d) {
          const x = horizontal ? -f * 0.4 - m.labelRoom : centerOf(view.bars.get(d.key).slot);
          text(d3.select(this).selectAll("tspan").data(d.lines).join("tspan")
            .attr("x", x).attr("dy", (_l, j) => (j > 0 ? m.lineH : horizontal ? "0.35em" : "0.71em")), (l) => l);
        });

      // Waterfall connectors, under the bars (at a fixed place in the plot, so the markup does not depend on how
      // many frames were painted): each runs straight across the bands from its bar's end to the next bar's edge.
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

      // Bars: rect, whisker and value label per category, keyed by category.
      const groups = gBars.selectAll("g.sd-bar-group").data(marks, (d) => d.key).join((enter) => {
        const bar = enter.append("g").attr("class", "sd-bar-group");
        bar.append("title");
        bar.append("rect").attr("class", "sd-bar");
        bar.append("text").attr("class", "sd-bar-label");
        return bar;
      });
      groups.attr("data-key", (d) => d.key)
        .attr("data-visible", (d) => String(view.bars.get(d.key).visible))
        .attr("data-dim", (d) => String(d.dim))
        .attr("opacity", (d) => {
          const o = view.bars.get(d.key).opacity;
          return o == null || o === 1 ? null : o;
        })
        .order()
        .each(function (d) {
          const s = view.bars.get(d.key);
          const sel = d3.select(this);
          const v = s.v ?? 0;
          const end = scale(v);
          const base = s.start == null ? g.zero : scale(s.start);
          const center = centerOf(s.slot);
          text(sel.select("title"), d.title);
          sel.select("rect")
            .attr("x", horizontal ? Math.min(base, end) : center - thick / 2)
            .attr("y", horizontal ? center - thick / 2 : Math.min(base, end))
            .attr("width", horizontal ? Math.abs(end - base) : thick)
            .attr("height", horizontal ? thick : Math.abs(end - base))
            .attr("fill", s.fill);

          // The whisker grows out of the bar's end: s.whisker 0 = a point at the end, 1 = lower..upper.
          const hasWhisker = d.lo !== null && d.hi !== null && s.lo !== null && s.hi !== null;
          const wg = sel.selectAll("g.sd-whisker").data(hasWhisker ? [d] : []).join((enter) => enter.append("g").attr("class", "sd-whisker"))
            .attr("opacity", s.whisker > 0 ? null : 0);
          if (hasWhisker) {
            whisker(wg, { at: center, lo: scale(lerp(v, s.lo, s.whisker)), hi: scale(lerp(v, s.hi, s.whisker)), cap: thick * 0.45, orient: m.orient });
          }

          const gap = f * 0.4;
          // A label running up from its anchor has no `dy`; on a waterfall slide it gets "0em" instead, so the attribute
          // is never dropped and re-added between steps (that would change its place in the markup).
          const atBaseline = m.flowSlide ? "0em" : null;
          const label = text(sel.select("text"), d.text);
          if (m.mode === "waterfall") {
            // On the side the model chose at rest, following the bar's ends (and whisker) as they move.
            const dir = (horizontal ? 1 : -1) * (d.up ? 1 : -1); // the bar's direction in pixels
            const tip = hasWhisker ? scale(d.up ? Math.max(v, lerp(v, s.hi, s.whisker)) : Math.min(v, lerp(v, s.lo, s.whisker))) : end;
            const side = s.side ?? "end";
            const at = side === "end" ? tip + dir * gap : side === "inside" ? end - dir * gap : base - dir * gap;
            const forward = side === "end" ? dir > 0 : dir < 0; // the text runs towards higher pixel values from `at`
            label
              .attr("x", horizontal ? at : center)
              .attr("y", horizontal ? center : at)
              .attr("dy", horizontal ? "0.35em" : forward ? "0.71em" : atBaseline)
              .attr("text-anchor", horizontal ? (forward ? "start" : "end") : "middle");
          } else {
            // The value label sits past the bar's end, or past the whisker's when there is one.
            const positive = v >= 0;
            const tip = hasWhisker ? scale(positive ? Math.max(v, lerp(v, s.hi, s.whisker)) : Math.min(v, lerp(v, s.lo, s.whisker))) : end;
            label
              .attr("x", horizontal ? tip + (positive ? gap : -gap) : center)
              .attr("y", horizontal ? center : tip + (positive ? -gap : gap))
              .attr("dy", horizontal ? "0.35em" : positive ? atBaseline : "0.71em")
              .attr("text-anchor", horizontal ? (positive ? "start" : "end") : "middle");
          }
          label.attr("fill", s.labelFill).attr("opacity", s.labelOpacity === 1 ? null : s.labelOpacity);
        });
      // The focused bar is drawn after (above) the dimmed ones; the DOM order depends on the model alone.
      groups.filter((d) => !d.dim).raise();

      text(bandTitle, m.axes.x).attr("text-anchor", horizontal ? "start" : "middle")
        .attr("x", horizontal ? 0 : view.margin.left + view.pw / 2)
        .attr("y", horizontal ? f : view.margin.top + view.ph + f * 0.5 + m.labelRoom + (Math.max(1, ...marks.map((b) => b.lines.length)) * m.lineH) + f * 1.2);
      text(valueTitle, m.axes.y).attr("text-anchor", horizontal ? "middle" : "start")
        .attr("x", horizontal ? view.margin.left + view.pw / 2 : 0)
        .attr("y", horizontal ? view.margin.top + view.ph + f * 3.1 : f);
    }

    /** The end state of every update, animated or not. */
    function renderStatic(m) {
      paint(m, staticView(m));
    }

    // The same set of categories and bands; their order may differ (a re-sort moves them).
    const keysOf = (m) => m.bars.map((x) => x.key).sort().join("\n");
    const comparable = (a, b) => a && b && a.orient === b.orient && keysOf(a) === keysOf(b) && Boolean(a.total) === Boolean(b.total);
    const signature = (m) => JSON.stringify([
      m.mode, m.domain, m.pw, m.ph, m.margin, m.bars.map((b) => [b.key, b.value, b.lo, b.hi, b.shown, b.dim, b.fill, b.start, b.end]),
      m.total && [m.total.shown, m.total.end, m.total.label, m.total.dim], m.ticks.map((t) => t.label),
    ]);

    /**
     * Plays `from` -> `to` (from may be null: everything shown grows in, as when the element appears) over
     * `duration`, else the step's transition, else 2 x --sd-duration.
     */
    async function change(from, to, info, enterAll, duration) {
      const prev = new Map((from ? marksOf(from) : []).map((b) => [b.key, b]));
      const ref = from ?? to;
      // A waterfall at either end: every bar tweens its start and end (plain bars keep their grow-from-zero motion).
      const flow = to.mode === "waterfall" || from?.mode === "waterfall";
      // What does not depend on t: the union of the tick sets.
      const before = new Map(ref.ticks.map((k) => [k.value, k]));
      const after = new Map(to.ticks.map((k) => [k.value, k]));
      const tickValues = [...new Set([...(from ? before.keys() : []), ...after.keys()])];
      // Colors change on their own, faster tween (a focus change takes --sd-duration-fast); the frame reads them.
      const live = new Map(marksOf(to).map((b) => [b.key, { fill: (prev.get(b.key) ?? b).fill, labelFill: (prev.get(b.key) ?? b).labelFill }]));
      const fast = motion(info, ctx, { fast: true });
      const recolor = marksOf(to).flatMap((b) => {
        const p = prev.get(b.key);
        const now = live.get(b.key);
        return p ? ["fill", "labelFill"].filter((k) => p[k] !== b[k]).map((k) => tweenColor(ctx, p[k], b[k], (c) => { now[k] = c; }, fast)) : [];
      });
      // A bar's ends at rest, and the point it grows out of (plain bars: zero; a waterfall's: its start).
      const rest = (m, b) => (m.mode === "waterfall" ? [b.start, b.end] : [0, b.value ?? 0]);
      const point = (m, b) => (m.mode === "waterfall" ? [b.start, b.start] : [0, 0]);
      let first = true;
      const paintAt = (t) => {
        const view = {
          domain: [lerp(ref.domain[0], to.domain[0], t), lerp(ref.domain[1], to.domain[1], t)],
          pw: lerp(ref.pw, to.pw, t),
          ph: lerp(ref.ph, to.ph, t),
          margin: { left: lerp(ref.margin.left, to.margin.left, t), top: lerp(ref.margin.top, to.margin.top, t) },
          ticks: [],
          bars: new Map(),
          links: null,
        };
        for (const value of tickValues) {
          const tick = after.get(value) ?? before.get(value);
          view.ticks.push({ ...tick, opacity: before.has(value) && after.has(value) ? 1 : after.has(value) ? (from ? t : 1) : 1 - t });
        }
        view.ticks.sort((a, b) => a.value - b.value);
        for (const b of to.bars) {
          const p = prev.get(b.key) ?? b;
          const wasShown = !enterAll && prev.has(b.key) && p.shown; // a bar that was hidden has no old place: it is at its new one from the start
          const from01 = wasShown ? 1 : 0;
          const to01 = b.shown ? 1 : 0;
          let grow = 1; // 1 = full length (also for a bar that stays hidden: it is laid out at its final length)
          let whisker = 1;
          let labelOpacity = 1;
          if (from01 < to01) {
            grow = clamp01(t / GROW);
            whisker = clamp01((t - GROW) / (1 - GROW));
            labelOpacity = flow ? t : grow;
          } else if (from01 > to01) {
            whisker = 1 - clamp01(t / (1 - GROW));
            grow = 1 - clamp01((t - (1 - GROW)) / GROW);
            labelOpacity = flow ? 1 - t : grow;
          }
          const slot = wasShown ? lerp(p.slot, b.slot, t) : b.slot;
          const live1 = live.get(b.key);
          if (!flow) {
            const v = lerpNull(p.value, b.value, t);
            view.bars.set(b.key, {
              slot, v: v === null ? null : v * grow,
              lo: lerpNull(p.lo, b.lo, t), hi: lerpNull(p.hi, b.hi, t),
              whisker, visible: from01 > 0 || to01 > 0, labelOpacity, ...live1,
            });
            continue;
          }
          // Both ends tween over the whole motion: from its ends (a bar that was hidden: the point it grows out of; an
          // entrance: zero, so the whole waterfall grows out of zero and stays joined) to its new ends (or its point).
          const fromModel = prev.has(b.key) ? from : to;
          const [s0, e0] = enterAll ? [0, 0] : wasShown ? rest(fromModel, p) : point(fromModel, p);
          const [s1, e1] = b.shown ? rest(to, b) : point(to, b);
          const start = lerp(s0, s1, t);
          const lo = lerpNull(p.lo, b.lo, t);
          const hi = lerpNull(p.hi, b.hi, t);
          view.bars.set(b.key, {
            slot, start, v: lerp(e0, e1, t), lo: lo === null ? null : start + lo, hi: hi === null ? null : start + hi,
            whisker, visible: from01 > 0 || to01 > 0, labelOpacity, side: (from01 > to01 ? p.side : b.side) ?? b.side, ...live1,
          });
        }
        if (to.total) {
          // The total stays in its band: it tweens its end while it stays, and fades in or out where it is.
          const a = enterAll ? null : prev.get(TOTAL) ?? null;
          const b = to.total;
          const [was, is] = [Boolean(a?.shown), b.shown];
          let v = b.end;
          let opacity = 1;
          let labelOpacity = 1;
          if (enterAll) [v, labelOpacity] = [b.end * t, t];
          else if (was && is) v = lerp(a.end, b.end, t);
          else if (is) opacity = t;
          else if (was) [v, opacity] = [a.end, 1 - t];
          view.bars.set(TOTAL, {
            slot: b.slot, start: 0, v, lo: null, hi: null, whisker: 1, visible: was || is, labelOpacity, opacity,
            side: was && !is ? a.side : b.side, ...live.get(TOTAL),
          });
        }
        if (flow) {
          // A connector leaves its bar's current end. One that stays turns to its new next bar; a new one fades in, and
          // one that goes fades out.
          const now = (key) => view.bars.get(key);
          const was = new Map((enterAll || !from ? [] : from.links).map((l) => [l.key, l]));
          const is = new Map(to.links.map((l) => [l.key, l]));
          view.links = [];
          for (const [key, l] of is) {
            const o = was.get(key);
            view.links.push({ key, a: now(key).slot, b: o ? lerp(now(o.next).slot, now(l.next).slot, t) : now(l.next).slot, at: now(key).v, opacity: o ? 1 : t });
          }
          for (const [key, o] of was) if (!is.has(key)) view.links.push({ key, a: now(key).slot, b: now(o.next).slot, at: now(key).v, opacity: 1 - t });
        }
        paint(to, view, first);
        first = false;
      };
      // The geometry eases with the theme's --sd-easing, like every other motion.
      await Promise.all([morph(info, ctx, paintAt, { duration }), ...recolor]);
    }

    return {
      async update(props, info = {}) {
        const { draw, duration } = entrance(info, ctx);
        // The start state of the entrance, before the first await: the bars of the last render at zero length.
        if (draw && last) paint(last, emptyView(last));
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
