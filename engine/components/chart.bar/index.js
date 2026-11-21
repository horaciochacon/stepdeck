// Built-in `chart.bar`: one bar per category from a CSV, horizontal or vertical, with a direct value
// label at the end of each bar, an optional interval whisker and a transient highlight (slide kit 1, §5.2).
//
// Everything on screen is a pure function of (model, view):
//   - the model is computed from props and rows alone (scale domain, ticks, margins, one entry per category);
//   - the view is the moment inside a motion (domain, plot size, bar values, whisker progress, colours).
// `paint` writes a view into the DOM with keyed joins and sets every attribute it owns on every call (the text,
// which only depends on the model, on the first frame of a motion and in the static view), so the markup
// after settled() is the same whether a state was jumped to or played. Every update ends with the
// static view of the target model (renderStatic); with info.animate it first plays the change from the
// previous model through a single ctx.animate.tween bound to info.signal, so an abort snaps straight to the
// end state. No inline style is ever written: motion only changes attributes.
//
// Scales and slots (spec §10.4):
//   - the value domain is the `domain` prop, else [min(0, every y and interval value), max(...)] over every row
//     of the data, shown or not, rounded outward to tick values (`nice`); it moves only when `y`, `interval`
//     or `domain` change, and then it tweens;
//   - categories keep their band in data order whether or not they are shown; a hidden category is laid out
//     at its final length and hidden with CSS visibility, so nothing reflows.
// Motion: a category that appears grows from zero and then its whisker is drawn (GROW is the share of the
// motion given to the bar); a category that leaves does it in reverse; a changed value tweens the bar, its
// whisker and its label; `highlight` tweens the other bars to the theme's --sd-color-dim over
// --sd-duration-fast (never opacity, which would lower the contrast of the labels) and draws the highlighted
// bar after (above) them.
// Entrance: the chart owns it (`"x-enter": "own"` in schema.json). With info.entrance.motion "draw" every shown
// bar grows from zero and then draws its whisker, over info.entrance.duration (else 2 x --sd-duration), while the
// box stays still. The zero-length bars are written before the first await, in the same task as the engine shows
// the element, so the chart never paints at full length first. Any other entrance ("none", or a box motion)
// renders the end state at once.
// Colors come from ctx.palette("categorical") (the first color) and theme tokens; sizes from the label token.
import { d3 } from "../../core/d3.js";
import { loadTable, tickFormat, opacityAttr, wrapLabel, frame, whisker, morph, entrance } from "../../core/chart.js";
import { SVG_NS, lerp, clamp01, motion, focusPaint, tweenColor } from "../../core/kit.js";

const GROW = 0.6; // share of a motion in which an entering bar grows; its whisker is drawn in the rest
const THICK = 0.65; // bar thickness as a share of its band
const THICK_MAX = 4; // ... and its cap, in label font sizes

const lerpNull = (a, b, t) => (a === null || b === null ? b : lerp(a, b, t));
const tokenColor = (tokens, name) => tokens?.[name]?.trim() || null; // a value: var() does not work in a fill attribute
const valueOf = (row, col) => (row[col] == null || row[col] === "" ? null : Number.isFinite(Number(row[col])) ? Number(row[col]) : null);

/** Loads the rows and checks the props against them. Throws naming the column or the category. */
async function loadRows(props, ctx) {
  const rows = await loadTable(props, ctx, "chart.bar", [
    ["x", props.x], ["y", props.y], ["interval.lower", props.interval?.lower, true], ["interval.upper", props.interval?.upper, true],
  ]);
  if (props.domain !== undefined && !validDomain(props.domain)) throw new Error("`domain` must be [min, max] with min < max");
  const keys = categoriesOf(rows, props).map((r) => String(r[props.x]));
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
const categoriesOf = (rows, props) => rows.filter((r) => r[props.x] != null && r[props.x] !== "");

/** The target state, from props and rows alone. Pixel positions are derived from it by `geometry`. */
function buildModel(props, rows, ctx, el) {
  const orient = props.orient === "vertical" ? "vertical" : "horizontal";
  const horizontal = orient === "horizontal";
  const lower = props.interval?.lower;
  const upper = props.interval?.upper;
  const hasInterval = Boolean(lower && upper);

  // The domain covers every row (not only the shown ones) so the axis never moves as categories appear.
  const all = rows.flatMap((r) => [valueOf(r, props.y), hasInterval ? valueOf(r, lower) : null, hasInterval ? valueOf(r, upper) : null]).filter((v) => v !== null);
  let domain;
  if (props.domain !== undefined) {
    domain = [props.domain[0], props.domain[1]]; // validated by loadRows; used as given, never rounded
  } else {
    domain = [Math.min(0, d3.min(all) ?? 0), Math.max(0, d3.max(all) ?? 0)];
    if (!(domain[0] < domain[1])) domain[1] = domain[0] + 1;
    domain = d3.scaleLinear().domain(domain).nice(5).domain();
  }
  const tickValues = d3.scaleLinear().domain(domain).ticks(5);
  const fy = tickFormat(ctx, props.format?.y, tickValues);
  const fv = props.format?.y ? ctx.format(props.format.y) : ctx.format(",~r"); // value labels: as precise as the data
  const fx = props.format?.x ? ctx.format(props.format.x) : null;
  const ticks = tickValues.map((value) => ({ value, label: fy(value) }));

  const categories = categoriesOf(rows, props);
  const shown = new Set(Array.isArray(props.shown) ? props.shown.map(String) : categories.map((r) => String(r[props.x])));
  const colors = ctx.palette?.("categorical")?.colors ?? [];
  const fill = colors[0] ?? tokenColor(ctx.tokens, "--sd-color-accent");
  const ink = tokenColor(ctx.tokens, "--sd-color-ink");
  const muted = tokenColor(ctx.tokens, "--sd-color-muted");
  const bars = categories.map((row) => {
    const raw = row[props.x];
    const key = String(raw);
    const value = valueOf(row, props.y);
    const lo = hasInterval ? valueOf(row, lower) : null;
    const hi = hasInterval ? valueOf(row, upper) : null;
    const dim = props.highlight != null && String(props.highlight) !== key;
    const label = fx && typeof raw === "number" ? fx(raw) : key;
    const text = value === null ? "" : fv(value);
    const range = value !== null && lo !== null && hi !== null ? ` (${fv(lo)} – ${fv(hi)})` : "";
    return {
      key, label, value, lo: value === null ? null : lo, hi: value === null ? null : hi,
      text, title: `${label}: ${text}${range}`, shown: shown.has(key), dim,
      fill: focusPaint(ctx, fill, dim), labelFill: dim && muted ? muted : ink,
    };
  });

  // Fixed margins from character counts (not measured text), so layout never depends on font timing.
  // Room for a value label at a bar's end. It must not depend on the current `y`, or the plot would resize (and the
  // fixed axis slide) when `y` switches: use the widest label over every numeric column but the category, and the domain ends.
  const columns = rows.length ? Object.keys(rows[0]).filter((c) => c !== props.x) : [];
  const widest = Math.max(
    fv(domain[0]).length, fv(domain[1]).length,
    ...columns.flatMap((c) => rows.map((r) => valueOf(r, c)).filter((v) => v !== null).map((v) => fv(v).length)),
    ...bars.map((b) => b.text.length),
  );
  const hasX = props.axes?.x != null && String(props.axes.x) !== "";
  const hasY = props.axes?.y != null && String(props.axes.y) !== "";
  const n = Math.max(1, bars.length);
  // The category labels wrap to the room the plot leaves them, and the margin across the bands follows from
  // the wrapped lines, so each orientation sizes one pair of sides, then the plot, then wraps (setting
  // `b.lines`), then sizes the other pair.
  const { w, h, font, margin, pw, ph } = frame(el, ctx, ({ font, charW, w, h }) => {
    const lineH = font * 1.15;
    const labelW = widest * charW + font * 0.6;
    if (horizontal) {
      // Category labels left of the plot, value ticks under it, value labels past the bar ends.
      const top = Math.round(hasX ? font * 1.9 : font * 0.6);
      const bottom = Math.round(hasY ? font * 3.6 : font * 1.9);
      const ph = Math.max(1, h - top - bottom);
      const maxChars = Math.max(4, Math.floor((w * 0.34 - font * 0.6) / charW));
      const maxLines = Math.max(1, Math.floor((ph / n) / lineH));
      for (const b of bars) b.lines = wrapLabel(b.label, maxChars, maxLines);
      const chars = Math.max(1, ...bars.flatMap((b) => b.lines.map((l) => l.length)));
      return { top, bottom, left: chars * charW + font * 0.6 + (domain[0] < 0 ? labelW : 0), right: domain[1] > 0 ? labelW : font * 0.6 };
    }
    // Value ticks left of the plot, category labels under it, value labels above the bar ends.
    const left = Math.round(Math.max(1, ...ticks.map((t) => t.label.length)) * charW + font * 0.6);
    const right = Math.round(font * 0.6);
    const pw = Math.max(1, w - left - right);
    const maxChars = Math.max(3, Math.floor((pw / n) * 0.95 / charW));
    for (const b of bars) b.lines = wrapLabel(b.label, maxChars, 3);
    const lines = Math.max(1, ...bars.map((b) => b.lines.length));
    return {
      left, right,
      top: hasY ? font * 2.7 : font * 1.9,
      bottom: font * 0.5 + lines * lineH + (hasX ? font * 1.7 : font * 0.4) + (domain[0] < 0 ? font * 1.4 : 0),
    };
  });
  const lineH = font * 1.15;
  return {
    w, h, font, lineH, orient, margin, pw, ph, domain, ticks, bars, hasInterval,
    axes: { x: hasX ? String(props.axes.x) : "", y: hasY ? String(props.axes.y) : "" },
  };
}

/** Where things sit for a model drawn with this domain and plot size (canvas pixels, plot coordinates). */
function geometry(m, domain, pw, ph) {
  const horizontal = m.orient === "horizontal";
  const scale = d3.scaleLinear().domain(domain).range(horizontal ? [0, pw] : [ph, 0]);
  const step = (horizontal ? ph : pw) / Math.max(1, m.bars.length);
  return { horizontal, scale, step, thick: Math.min(step * THICK, m.font * THICK_MAX), zero: scale(0), pw, ph };
}

const staticView = (m) => ({
  domain: m.domain, pw: m.pw, ph: m.ph, margin: { left: m.margin.left, top: m.margin.top },
  ticks: m.ticks.map((t) => ({ ...t, opacity: 1 })),
  bars: new Map(m.bars.map((b) => [b.key, { v: b.value, lo: b.lo, hi: b.hi, whisker: 1, visible: b.shown, labelOpacity: 1, fill: b.fill, labelFill: b.labelFill }])),
});

/** The start of an entrance: every shown bar at zero length, with no whisker and no label (as a morph's t = 0). */
const emptyView = (m) => {
  const view = staticView(m);
  for (const b of m.bars) if (b.shown) Object.assign(view.bars.get(b.key), { v: 0, whisker: 0, labelOpacity: 0 });
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
      svg.attr("width", m.w).attr("height", m.h).attr("viewBox", `0 0 ${m.w} ${m.h}`).attr("data-orient", m.orient);
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

      // Band axis: one label per category (wrapped), hidden with its bar.
      const centerOf = (i) => step * (i + 0.5);
      gBand.selectAll("text.sd-band-label").data(m.bars, (d) => d.key).join((enter) => enter.append("text").attr("class", "sd-band-label"))
        .attr("data-key", (d) => d.key)
        .attr("data-visible", (d) => String(view.bars.get(d.key).visible))
        .attr("y", (d, i) => (horizontal ? centerOf(i) - ((d.lines.length - 1) * m.lineH) / 2 : g.ph + f * 0.5))
        .attr("text-anchor", horizontal ? "end" : "middle")
        .order()
        .each(function (d, i) {
          const x = horizontal ? -f * 0.4 : centerOf(i);
          text(d3.select(this).selectAll("tspan").data(d.lines).join("tspan")
            .attr("x", x).attr("dy", (_l, j) => (j > 0 ? m.lineH : horizontal ? "0.35em" : "0.71em")), (l) => l);
        });

      // Bars: rect, whisker and value label per category, keyed by category.
      const groups = gBars.selectAll("g.sd-bar-group").data(m.bars, (d) => d.key).join((enter) => {
        const bar = enter.append("g").attr("class", "sd-bar-group");
        bar.append("title");
        bar.append("rect").attr("class", "sd-bar");
        bar.append("text").attr("class", "sd-bar-label");
        return bar;
      });
      groups.attr("data-key", (d) => d.key)
        .attr("data-visible", (d) => String(view.bars.get(d.key).visible))
        .attr("data-dim", (d) => String(d.dim))
        .order()
        .each(function (d, i) {
          const s = view.bars.get(d.key);
          const sel = d3.select(this);
          const v = s.v ?? 0;
          const end = scale(v);
          const center = centerOf(i);
          text(sel.select("title"), d.title);
          sel.select("rect")
            .attr("x", horizontal ? Math.min(g.zero, end) : center - thick / 2)
            .attr("y", horizontal ? center - thick / 2 : Math.min(g.zero, end))
            .attr("width", horizontal ? Math.abs(end - g.zero) : thick)
            .attr("height", horizontal ? thick : Math.abs(end - g.zero))
            .attr("fill", s.fill);

          // The whisker grows out of the bar's end: s.whisker 0 = a point at the end, 1 = lower..upper.
          const hasWhisker = d.lo !== null && d.hi !== null && s.lo !== null && s.hi !== null;
          const wg = sel.selectAll("g.sd-whisker").data(hasWhisker ? [d] : []).join((enter) => enter.append("g").attr("class", "sd-whisker"))
            .attr("opacity", s.whisker > 0 ? null : 0);
          if (hasWhisker) {
            whisker(wg, { at: center, lo: scale(lerp(v, s.lo, s.whisker)), hi: scale(lerp(v, s.hi, s.whisker)), cap: thick * 0.45, orient: m.orient });
          }

          // The value label sits past the bar's end, or past the whisker's when there is one.
          const positive = v >= 0;
          const tip = hasWhisker ? scale(positive ? Math.max(v, lerp(v, s.hi, s.whisker)) : Math.min(v, lerp(v, s.lo, s.whisker))) : end;
          const gap = f * 0.4;
          text(sel.select("text"), d.text)
            .attr("x", horizontal ? tip + (positive ? gap : -gap) : center)
            .attr("y", horizontal ? center : tip + (positive ? -gap : gap))
            .attr("dy", horizontal ? "0.35em" : positive ? null : "0.71em")
            .attr("text-anchor", horizontal ? (positive ? "start" : "end") : "middle")
            .attr("fill", s.labelFill)
            .attr("opacity", s.labelOpacity === 1 ? null : s.labelOpacity);
        });
      // The focused bar is drawn after (above) the dimmed ones; the DOM order depends on the model alone.
      groups.filter((d) => !d.dim).raise();

      text(bandTitle, m.axes.x).attr("text-anchor", horizontal ? "start" : "middle")
        .attr("x", horizontal ? 0 : view.margin.left + view.pw / 2)
        .attr("y", horizontal ? f : view.margin.top + view.ph + f * 0.5 + (Math.max(1, ...m.bars.map((b) => b.lines.length)) * m.lineH) + f * 1.2);
      text(valueTitle, m.axes.y).attr("text-anchor", horizontal ? "middle" : "start")
        .attr("x", horizontal ? view.margin.left + view.pw / 2 : 0)
        .attr("y", horizontal ? view.margin.top + view.ph + f * 3.1 : f);
    }

    /** The end state of every update, animated or not. */
    function renderStatic(m) {
      paint(m, staticView(m));
    }

    const comparable = (a, b) => a && b && a.orient === b.orient && a.bars.map((x) => x.key).join("\n") === b.bars.map((x) => x.key).join("\n");
    const signature = (m) => JSON.stringify([m.domain, m.pw, m.ph, m.margin, m.bars.map((b) => [b.value, b.lo, b.hi, b.shown, b.dim]), m.ticks.map((t) => t.label)]);

    /**
     * Plays `from` -> `to` (from may be null: everything shown grows in, as when the element appears) over
     * `duration`, else the step's transition, else 2 x --sd-duration.
     */
    async function change(from, to, info, enterAll, duration) {
      const prev = new Map((from?.bars ?? []).map((b) => [b.key, b]));
      const ref = from ?? to;
      // What does not depend on t: the union of the tick sets.
      const before = new Map(ref.ticks.map((k) => [k.value, k]));
      const after = new Map(to.ticks.map((k) => [k.value, k]));
      const tickValues = [...new Set([...(from ? before.keys() : []), ...after.keys()])];
      // Colors change on their own, faster tween (a focus change takes --sd-duration-fast); the frame reads them.
      const live = new Map(to.bars.map((b) => [b.key, { fill: (prev.get(b.key) ?? b).fill, labelFill: (prev.get(b.key) ?? b).labelFill }]));
      const fast = motion(info, ctx, { fast: true });
      const recolor = to.bars.flatMap((b) => {
        const p = prev.get(b.key);
        const now = live.get(b.key);
        return p ? ["fill", "labelFill"].filter((k) => p[k] !== b[k]).map((k) => tweenColor(ctx, p[k], b[k], (c) => { now[k] = c; }, fast)) : [];
      });
      let first = true;
      const paintAt = (t) => {
        const view = {
          domain: [lerp(ref.domain[0], to.domain[0], t), lerp(ref.domain[1], to.domain[1], t)],
          pw: lerp(ref.pw, to.pw, t),
          ph: lerp(ref.ph, to.ph, t),
          margin: { left: lerp(ref.margin.left, to.margin.left, t), top: lerp(ref.margin.top, to.margin.top, t) },
          ticks: [],
          bars: new Map(),
        };
        for (const value of tickValues) {
          const tick = after.get(value) ?? before.get(value);
          view.ticks.push({ ...tick, opacity: before.has(value) && after.has(value) ? 1 : after.has(value) ? (from ? t : 1) : 1 - t });
        }
        view.ticks.sort((a, b) => a.value - b.value);
        for (const b of to.bars) {
          const p = prev.get(b.key) ?? b;
          const from01 = enterAll || !prev.has(b.key) ? 0 : p.shown ? 1 : 0;
          const to01 = b.shown ? 1 : 0;
          let grow = 1; // 1 = full length (also for a bar that stays hidden: it is laid out at its final length)
          let whisker = 1;
          let labelOpacity = 1;
          if (from01 < to01) {
            grow = clamp01(t / GROW);
            whisker = clamp01((t - GROW) / (1 - GROW));
            labelOpacity = grow;
          } else if (from01 > to01) {
            whisker = 1 - clamp01(t / (1 - GROW));
            grow = 1 - clamp01((t - (1 - GROW)) / GROW);
            labelOpacity = grow;
          }
          const v = lerpNull(p.value, b.value, t);
          view.bars.set(b.key, {
            v: v === null ? null : v * grow,
            lo: lerpNull(p.lo, b.lo, t), hi: lerpNull(p.hi, b.hi, t),
            whisker, visible: from01 > 0 || to01 > 0, labelOpacity,
            ...live.get(b.key),
          });
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
