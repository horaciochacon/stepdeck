// gallery.where: a bar chart that carries a "you are here" copy of a process in its top-right corner. The bars are drawn
// with ctx.chart (loadTable, frame, extentOf, tickFormat, axis, keyed, settle, morph, lerp); the copy is the built-in
// `diagram` mounted with ctx.mount, compact and lit at the stage the step names, from the same definition the gallery's
// process slides bind (`process`, data/process.json). It imports nothing, so it runs wherever the engine's files live.
// The copy lives in an HTML element of its own beside the chart's SVG: the chart's settle clears every inline style inside
// that SVG, which the compact diagram writes. Its caption is never empty, so its band, and with it the grid, never moves
// between steps (a child has no step list to look ahead in). One value scale covers every step; a played change of `y`
// is one morph of the bars, and every update ends by writing the whole state from the props.
const SVG = "http://www.w3.org/2000/svg";
const COPY = { w: 440, h: 240 }; // the compact diagram's box, in canvas pixels
// A blank cell is a missing value: no bar, never a zero.
const num = (v) => (v === null || v === undefined || String(v).trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export default {
  async mount(el, props, ctx) {
    const { chart: C, d3 } = ctx;
    const doc = el.ownerDocument;
    const token = (name) => String(ctx.tokens[name] ?? "").trim();
    const palette = ctx.palette("categorical");
    const one = ctx.format(",.1f"); // the values over the bars
    const fill = palette?.roles?.accent ?? palette?.colors?.[0] ?? token("--sd-color-ink");

    /** What the compact copy gets for these props: the whole process, lit at the stage, with a caption that never goes empty. */
    function view(p) {
      const node = p.process.nodes.find((n) => n.id === p.stage);
      if (!node) throw new Error(`gallery.where: stage "${p.stage}" is not a node of the process`);
      return { ...p.process, compact: true, caption: `Stage: ${node.label}`, highlight: [node.id] };
    }

    // The copy goes in its own element, in the corner and with a size; the chart's SVG goes beside it, not around it.
    const copy = el.appendChild(doc.createElement("div"));
    copy.dataset.part = "copy";
    Object.assign(copy.style, { position: "absolute", top: "0", right: "0", width: `${COPY.w}px`, height: `${COPY.h}px` });
    const diagram = await ctx.mount("diagram", copy, view(props));
    const svg = d3.select(el).append(() => doc.createElementNS(SVG, "svg")).attr("display", "block").attr("overflow", "visible");
    const plot = svg.append("g").attr("font-family", token("--sd-font-body")).attr("font-variant", "tabular-nums");
    const [gAxis, gBars, gValues, gNames] = ["axis", "bars", "values", "names"].map((layer) => plot.append("g").attr("data-layer", layer));
    let last = null; // the model drawn now: where a played change starts

    /** The frame, the scales and one mark per row for these props: bars with a value, names for every row. */
    function model(rows, p) {
      const steps = (ctx.stepProps ?? [p]).filter(Boolean); // a step that failed (null) is skipped
      const scale = d3.scaleLinear().domain(C.extentOf(rows, steps.map((s) => s.y), { zero: true })).nice(); // one scale for every step
      const ticks = scale.ticks(5);
      const fmt = C.tickFormat(ctx, undefined, ticks);
      const chars = Math.max(3, ...ticks.map((t) => fmt(t).length)); // margins from character counts, as the built-ins' are
      const f = C.frame(el, ctx, ({ font, charW }) => ({ left: chars * charW + font * 0.8, right: font, top: COPY.h + font * 1.6, bottom: font * 2 }));
      const y = scale.range([f.ph, 0]);
      const x = d3.scaleBand().domain(rows.map((r) => String(r[p.x]))).range([0, f.pw]).padding(0.25);
      const marks = rows.map((r) => ({ key: String(r[p.x]), value: num(r[p.y]) }));
      return { f, y, x, ticks, fmt, marks, byKey: new Map(marks.map((d) => [d.key, d])) };
    }

    /** The keyed joins: bars and their values by row, names by row. */
    function join(m) {
      const shown = m.marks.filter((d) => d.value !== null);
      C.keyed(gBars.selectAll("rect"), shown, (d) => d.key, (enter) => enter.append("rect").attr("data-key", (d) => d.key));
      C.keyed(gValues.selectAll("text"), shown, (d) => d.key, (enter) => enter.append("text").attr("data-key", (d) => d.key));
      C.keyed(gNames.selectAll("text"), m.marks, (d) => d.key, (enter) => enter.append("text").attr("class", "sd-axis-label").attr("data-key", (d) => d.key));
    }

    /** Writes every attribute, `t` of the way from the last model to `m`. */
    function place(m, t) {
      const { f, y, x } = m;
      const value = (d) => C.lerp(last?.byKey.get(d.key)?.value, d.value, t);
      svg.attr("width", f.w).attr("height", f.h);
      plot.attr("transform", `translate(${f.margin.left},${f.margin.top})`).attr("font-size", f.font);
      C.axis(gAxis, { scale: y, length: f.pw, ticks: m.ticks, format: m.fmt });
      gBars.selectAll("rect:not(.sd-exiting)").attr("x", (d) => x(d.key)).attr("width", x.bandwidth())
        .attr("y", (d) => y(value(d))).attr("height", (d) => f.ph - y(value(d))).attr("fill", fill);
      gValues.selectAll("text:not(.sd-exiting)").attr("x", (d) => x(d.key) + x.bandwidth() / 2).attr("y", (d) => y(value(d)) - f.font * 0.4)
        .attr("text-anchor", "middle").attr("font-weight", 600).attr("fill", token("--sd-color-ink")).text((d) => one(value(d)));
      gNames.selectAll("text").attr("x", (d) => x(d.key) + x.bandwidth() / 2).attr("y", f.ph).attr("dy", "1.2em").attr("text-anchor", "middle").text((d) => d.key);
    }

    return {
      async update(p, info = {}) {
        const to = view(p); // before anything is drawn: an unknown stage fails the element
        const m = model(await C.loadTable(p, ctx, "gallery.where", [["x", p.x], ["y", p.y]]), p);
        join(m); // the joins first: they mark the leavers
        const runs = [diagram.update(to, info)]; // the lit stage tweens on its own clock
        if (info.animate && last && !info.entered && !info.signal?.aborted && (info.changed ?? []).includes("y")) {
          runs.push(C.morph(info, ctx, (t) => place(m, t)));
        }
        await Promise.all(runs);
        C.settle(svg.node()); // removes the leavers and whatever the motion left
        place(m, 1); // the end state, every attribute, however the step ended
        last = m;
      },
      destroy() {
        svg.remove();
        copy.remove();
      },
    };
  },
};
