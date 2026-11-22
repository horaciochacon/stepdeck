// gallery.swipe: a before/after swipe of a map raster. Two frames of one raster lie over each other on two canvases, the
// second clipped from the divider to the right edge by a CSS clip-path; a third canvas draws the regions' borders over
// both, and a thin line marks the divider. Built only from what the engine hands every component (ctx.map, ctx.chart,
// ctx.data, ctx.palette, ctx.tokens): it imports nothing. The pictures never move, so a played change of `at` is one
// ctx.chart.morph of the clip and the line. Every update ends by writing the whole state from its props, so a played
// step ends where a jump does, and each canvas carries what it shows in data-* (frame, at, sig) for `check --played`.
// The stage is built at the first update, not at mount: ctx.size is measured before the slide's other elements have
// settled the box, so the size is read from the element then, when every element has mounted.
const SVG = "http://www.w3.org/2000/svg";

export default {
  async mount(el, props, ctx) {
    const { map: M, chart: C, d3 } = ctx;
    const doc = el.ownerDocument;
    const token = (name) => ctx.tokens[name].trim();
    // The regions are fixed for the element's life (a feature's `code` is its id).
    const { features, ids, byId } = M.boundaries(await ctx.data(props.boundaries), { id: "code", file: props.boundaries });
    const palettes = { sequential: ctx.palette("sequential"), diverging: ctx.palette("diverging"), categorical: ctx.palette("categorical") };
    let stage = null; // built at the first update: canvases, the divider and its labels, the legend, the geometry at the box's size
    let last = null; // the divider position the swipe ended at: where a played step starts

    /** The stage for the box as it is now: the base projection and one view (a swipe never zooms), a Path2D per region. */
    function build() {
      const [w, h] = [el.offsetWidth, el.offsetHeight];
      const base = M.projection("equal-earth", features, [w, h]);
      const path = d3.geoPath(base);
      const paths = new Map(ids.map((id) => [id, new Path2D(path(byId.get(id)))]));
      const land = new Path2D(); // every region together: land the raster has no data for is hatched
      for (const region of paths.values()) land.addPath(region);
      const layer = (name, opts) => C.canvasLayer(el, { left: 0, top: 0, pw: w, ph: h, name, ...opts });
      const [before, after] = ["before", "after"].map((name) => layer(name, { maxRatio: 1 })); // painted per pixel
      const borders = layer("borders"); // made last: over both rasters
      const home = M.view(base, null, [w, h]);
      borders.setAttribute("data-sig", M.paintBorders(borders, { source: props.boundaries, view: home,
        items: ids.map((id) => ({ id, stroke: token("--sd-color-rule"), width: 1, alpha: 1, dot: false })) },
      { path: (id) => paths.get(id), centroid: (id) => path.centroid(byId.get(id)) }));
      // The divider and the two frame labels: an SVG appended after the canvases paints over them.
      const svg = d3.select(el).append(() => doc.createElementNS(SVG, "svg")).attr("width", w).attr("height", h).attr("display", "block");
      const lines = svg.selectAll("line").data([["--sd-color-background", 10], ["--sd-color-ink", 4]]).join("line")
        .attr("y1", 0).attr("y2", h).attr("stroke", ([name]) => token(name)).attr("stroke-width", ([, width]) => width);
      const font = parseFloat(token("--sd-font-size-label"));
      const labels = svg.selectAll("text").data([24, w - 24]).join("text").attr("x", (x) => x).attr("y", font * 1.4)
        .attr("text-anchor", (x) => (x < w / 2 ? "start" : "end")).attr("font-size", font).attr("font-weight", 600)
        .attr("font-family", token("--sd-font-body")).attr("fill", token("--sd-color-ink"));
      C.halo(labels); // a background outline, so a label reads over the raster
      const legend = el.appendChild(doc.createElement("div"));
      legend.className = "sd-map-legend"; // the core's legend panel, on the background colour
      legend.dataset.at = "bottom-left";
      return { w, h, base, home, land, paths, before, after, borders, svg, lines, labels, legend, lookups: new Map(), pictures: new Map() };
    }

    return {
      async update(next, info = {}) {
        stage ??= build();
        const { w, h, base, home, land, before, after, lines, labels, legend } = stage;
        const raster = await M.loadRaster(next.raster, ctx);
        const shown = [next.before, next.after].map((label) => {
          const frame = raster.frames.findIndex((f) => f.label === String(label));
          if (frame < 0) throw new Error(`${next.raster}: no frame '${label}' (${raster.frames.map((f) => f.label).join(", ")})`);
          return frame;
        });
        await Promise.all(shown.map((frame) => raster.grid(frame))); // the painter reads decoded frames only
        // One colour table for both pictures: the sequential palette over the raster's value range.
        const { min, max, scale: kind } = raster.value;
        const colors = C.colorScale({ domain: [min, max], log: kind === "log" }, palettes);
        const { lookups } = stage;
        const res = { raster, lutData: M.lut(raster, (value) => colors.color(value)), land, cache: stage.pictures,
          landCells: M.landCells(raster, features),
          lookupFor: () => lookups.get(raster) ?? lookups.set(raster, M.lookup(base, home, [w, h], raster.bounds, raster.size)).get(raster) };
        const hatch = { line: token("--sd-color-dim"), background: token("--sd-color-surface") };
        [before, after].forEach((canvas, side) => {
          const sig = M.paintRaster(canvas, { source: next.raster, lut: "swipe", view: home, hatch, clip: true,
            draws: [{ frame: shown[side], at: home, alpha: 1 }] }, res);
          canvas.dataset.frame = raster.frames[shown[side]].label; // after the painter, so the attributes always come in one order
          canvas.setAttribute("data-sig", sig);
        });
        labels.text((x) => (x < w / 2 ? next.before : next.after));
        legend.replaceChildren(C.legendRow(doc, colors.legend, { title: raster.value.unit, t: ctx.t }));

        /** Writes the divider at `at`: the clip of the second raster, its data-at, and the line. */
        const place = (at) => {
          after.style.clipPath = `inset(0 0 0 ${(at * 100).toFixed(1)}%)`;
          after.dataset.at = at.toFixed(3);
          lines.attr("x1", at * w).attr("x2", at * w);
        };
        const at = next.at ?? 0.5;
        if (info.animate && last !== null && last !== at && !info.entered && !info.signal?.aborted) {
          await C.morph(info, ctx, (t) => place(C.lerp(last, at, t)));
        }
        place(at); // the end state, however the step ended
        last = at;
      },
      destroy() {
        if (stage) for (const node of [stage.before, stage.after, stage.borders, stage.svg.node(), stage.legend]) node.remove();
      },
    };
  },
};
