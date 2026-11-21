// gallery.slope: a slope chart. One line per category from its `left` value to its `right` value, a dot at each end
// and a direct label beside each dot. Built only from what the engine hands every component (ctx.chart, ctx.motion,
// ctx.palette, ctx.tokens, ctx.stepProps, ctx.format, ctx.d3, ctx.animate): it imports nothing, so it runs wherever the
// engine's files live. The scale covers `left` and `right` of every step (extentOf over ctx.stepProps), so it never
// moves. A played column change is one morph: dots slide, lines tilt, values count, labels slide to their new rank
// (rank, then spread). `highlight` tweens the others to the theme's dim colour (focusPaint, tweenColor). The lines draw
// in as the chart's own entrance ("x-enter": "own"). Every update ends by writing the whole state from the props.
const SVG = "http://www.w3.org/2000/svg";
const SIDES = ["left", "right"];
// A blank cell is a missing value: no dot, no label, no line, never a zero.
const num = (v) => (v === null || v === undefined || String(v).trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));
// A column's heading: its name without a letter prefix before a number ("y2010" reads 2010).
const heading = (column) => String(column).replace(/^[A-Za-z_]+(?=\d)/, "");

export default {
  mount(el, props, ctx) {
    const { chart: C, d3 } = ctx;
    const token = (name) => String(ctx.tokens[name] ?? "").trim();
    const [ink, muted, background] = ["ink", "muted", "background"].map((n) => token(`--sd-color-${n}`));
    const grid = token("--sd-color-grid") || token("--sd-color-rule");
    const colors = ctx.palette("categorical")?.colors ?? [];
    const svg = d3.select(el).append(() => el.ownerDocument.createElementNS(SVG, "svg")).attr("display", "block").attr("overflow", "visible");
    const plot = svg.append("g").attr("font-family", token("--sd-font-body")).attr("font-variant", "tabular-nums");
    const [gAxes, gLines, gDots, gLabels] = ["axes", "lines", "dots", "labels"].map((layer) => plot.append("g").attr("data-layer", layer));
    let last = null; // the model drawn now: where a played change starts

    /** The frame, the scale, and per category its colours, values and label places, for these props. */
    function model(rows, props) {
      const steps = (ctx.stepProps ?? [props]).filter(Boolean); // a step that failed (null) is skipped
      const domain = C.extentOf(rows, steps.flatMap((p) => [p.left, p.right])); // one scale for every step
      const ticks = d3.scaleLinear().domain(domain).ticks(5);
      const text = (p, side, r) => (num(r[p[side]]) === null ? "" : `${r[p.category]} ${C.tickFormat(ctx, p.format, ticks)(num(r[p[side]]))}`);
      // Margins from character counts over every step, so the axes stay put while the labels change.
      const chars = Math.max(4, ...steps.flatMap((p) => rows.flatMap((r) => SIDES.map((side) => text(p, side, r).length))));
      const f = C.frame(el, ctx, ({ font, charW }) => ({ left: chars * charW + font * 1.2, right: chars * charW + font * 1.2, top: font * 2.2, bottom: font }));
      const y = d3.scaleLinear().domain(domain).range([f.ph, 0]);
      const marks = rows.map((r, i) => {
        const color = colors.length ? colors[i % colors.length] : ink; // one colour per category, in data order
        const dim = props.highlight != null && String(props.highlight) !== String(r[props.category]);
        return { key: String(r[props.category]), left: num(r[props.left]), right: num(r[props.right]), dim, at: {},
          paint: C.focusPaint(ctx, color, dim), text: dim ? muted : C.textColor(color, background) };
      });
      for (const side of SIDES) {
        const shown = new Map(marks.filter((d) => d[side] !== null).map((d) => [d.key, d]));
        const keys = C.rank([...shown.values()].map((d) => ({ key: d.key, value: d[side] })), "-value"); // top to bottom
        const ys = C.spread(keys.map((k) => y(shown.get(k)[side])), f.font * 1.15, [0, f.ph]);
        keys.forEach((k, i) => (shown.get(k).at[side] = ys[i]));
      }
      marks.sort((a, b) => b.dim - a.dim); // the highlighted category last, so it is drawn on top
      const heads = { left: heading(props.left), right: heading(props.right) };
      return { f, y, marks, heads, fmt: C.tickFormat(ctx, props.format, ticks), byKey: new Map(marks.map((d) => [d.key, d])) };
    }

    /** The keyed joins: axes by side, lines by category, dots and labels by category and side. */
    function join(m) {
      const ends = SIDES.flatMap((side) => m.marks.filter((d) => d[side] !== null).map((d) => ({ id: `${d.key}|${side}`, side, d })));
      const tag = (s) => s.attr("data-key", (e) => e.d.key).attr("data-side", (e) => e.side);
      C.keyed(gAxes.selectAll("g"), SIDES, (s) => s, (enter) => enter.append("g").call((g) => { g.append("line").attr("data-axis", (s) => s); g.append("text"); }));
      C.keyed(gLines.selectAll("path"), m.marks.filter((d) => d.left !== null && d.right !== null), (d) => d.key, (enter) => enter.append("path").attr("data-key", (d) => d.key));
      C.keyed(gDots.selectAll("circle"), ends, (e) => e.id, (enter) => enter.append("circle").call(tag));
      C.keyed(gLabels.selectAll("text"), ends, (e) => e.id, (enter) => enter.append("text").call(tag));
    }

    /** Writes every attribute, `t` of the way from the last model to `m`; `tone` gives a category's colours now. */
    function place(m, t, tone = (d) => d) {
      const { f, y } = m;
      const lerp = (a, b) => (t >= 1 || a == null || b == null ? b : a + (b - a) * t);
      const value = (d, side) => lerp(last?.byKey.get(d.key)?.[side], d[side]);
      const spot = (d, side) => lerp(last?.byKey.get(d.key)?.at[side], d.at[side]);
      const x = (side) => (side === "left" ? 0 : f.pw);
      svg.attr("width", f.w).attr("height", f.h);
      plot.attr("transform", `translate(${f.margin.left},${f.margin.top})`).attr("font-size", f.font);
      gAxes.selectAll("line").attr("x1", x).attr("x2", x).attr("y1", 0).attr("y2", f.ph).attr("stroke", grid).attr("stroke-width", 2);
      gAxes.selectAll("text").attr("x", x).attr("y", -f.font).attr("text-anchor", "middle").attr("fill", ink).text((s) => m.heads[s]);
      gLines.selectAll("path:not(.sd-exiting)").attr("d", (d) => `M0,${y(value(d, "left"))}L${f.pw},${y(value(d, "right"))}`)
        .attr("fill", "none").attr("stroke", (d) => tone(d).paint).attr("stroke-width", f.font / 7).attr("stroke-linecap", "round");
      const dots = gDots.selectAll("circle:not(.sd-exiting)").attr("cx", (e) => x(e.side)).attr("cy", (e) => y(value(e.d, e.side)));
      C.dot(dots, { r: f.font * 0.3, color: (e) => tone(e.d).paint });
      const labels = gLabels.selectAll("text:not(.sd-exiting)").attr("x", (e) => x(e.side) + (e.side === "left" ? -0.6 : 0.6) * f.font)
        .attr("y", (e) => spot(e.d, e.side)).attr("dy", "0.35em").attr("text-anchor", (e) => (e.side === "left" ? "end" : "start"))
        .attr("font-weight", 600).attr("fill", (e) => tone(e.d).text)
        .text((e) => (e.side === "left" ? `${e.d.key} ${m.fmt(value(e.d, "left"))}` : `${m.fmt(value(e.d, "right"))} ${e.d.key}`));
      C.halo(labels); // a background outline, so a label reads over a line
    }

    return {
      async update(props, info = {}) {
        const e = C.entrance(info, ctx); // { draw, duration, ease, signal }
        // The entrance's start state, written before the first await: the element is shown in this same task.
        if (e.draw) gLines.selectAll("path").each(function () { C.undraw(this); });
        const m = model(await C.loadTable(props, ctx, "gallery.slope", [["category", props.category], ["left", props.left], ["right", props.right]]), props);
        join(m); // the joins first: they mark the leavers
        if (e.draw) {
          C.settle(svg.node());
          place(m, 1); // the end state; drawPath then starts each line undrawn, and they draw while the box stays still
          await Promise.all(gLines.selectAll("path").nodes().map((p) => ctx.animate.drawPath(p, e)));
        } else if (info.animate && last && !info.entered && !info.signal?.aborted) {
          // The geometry morphs only when a column changed; colours tween on their own, faster clock.
          const moved = (info.changed ?? []).some((k) => k !== "highlight");
          let at = moved ? 0 : 1;
          const tones = new Map(m.marks.map((d) => [d.key, { ...(last.byKey.get(d.key) ?? d) }]));
          const tone = (d) => tones.get(d.key);
          const fast = ctx.motion.timing(info, { fast: true });
          const recolor = m.marks.flatMap((d) => ["paint", "text"].filter((k) => tone(d)[k] !== d[k])
            .map((k) => C.tweenColor(ctx, tone(d)[k], d[k], (c) => { tone(d)[k] = c; place(m, at, tone); }, fast)));
          await Promise.all([moved && C.morph(info, ctx, (t) => place(m, (at = t), tone)), ...recolor]);
        }
        C.settle(svg.node()); // removes the leavers and whatever the motion left
        place(m, 1); // the end state, every attribute, however the step ended
        last = m;
      },
      destroy: () => svg.remove(),
    };
  },
};
