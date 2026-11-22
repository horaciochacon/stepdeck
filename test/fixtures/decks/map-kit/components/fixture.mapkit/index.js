// fixture.mapkit: regions, a raster, dots, points, an inset frame and a scale bar, drawn only through `ctx.map` (no
// imports). A pure function of props: `update` clears the canvases and paints the end state, whatever step it arrives
// from. Colours come from the theme: the palette, the ink, the background, and the dim and surface tokens for the hatch.
// The raster is coloured from the first palette colour (level 0) to the second (the top of its scale).
const SVG = "http://www.w3.org/2000/svg";

export default {
  async mount(el, props, ctx) {
    const { map: M, d3, tokens } = ctx;
    const { w, h } = ctx.size;
    const doc = el.ownerDocument;
    const { features, byId, ids } = M.boundaries(await ctx.data(props.data), { id: "code", file: props.data });
    const base = M.projection(props.projection, features, [w, h]);
    const path = d3.geoPath(base);
    const paths = new Map(features.map((f) => [f.properties.code, new Path2D(path(f))]));
    const res = { path: (id) => paths.get(id), centroid: (id) => path.centroid(byId.get(id)) };
    const token = (name) => tokens[name].trim();
    const colors = ctx.palette("categorical").colors;
    const land = new Path2D();
    for (const region of paths.values()) land.addPath(region);
    const images = new Map(); // the pictures paintRaster builds, shared by every paint
    const lookups = new Map();
    const svg = d3.select(el).append(() => doc.createElementNS(SVG, "svg")).attr("class", "fixture-mapkit")
      .attr("width", w).attr("height", h).attr("viewBox", `0 0 ${w} ${h}`).attr("display", "block").node();

    /** The view that zooms by `zoom` about `p.about` (the middle of the element when omitted). */
    const viewOf = (p, zoom = 1) => {
      const [ax, ay] = p.about ? base(p.about) : [w / 2, h / 2];
      return { k: zoom, x: ax * (1 - zoom), y: ay * (1 - zoom) };
    };

    /** Paints the raster layer of `p`, or clears it: its frames are decoded first, so the painter can read them. */
    async function paintRaster(p, view) {
      const layer = el.querySelector(":scope > canvas[data-layer=raster]");
      if (!p.raster && !layer) return;
      const canvas = layer ?? ctx.chart.canvasLayer(el, { left: 0, top: 0, pw: w, ph: h, name: "raster", maxRatio: 1 });
      const draws = p.raster ? (p.rasterDraws ?? [{ frame: 0 }]).map((d) => ({ frame: d.frame, at: viewOf(p, d.zoom), alpha: d.alpha ?? 1 })) : [];
      const raster = p.raster ? await M.loadRaster(p.raster, ctx) : null;
      if (raster) await Promise.all(draws.map((d) => raster.grid(d.frame)));
      const scale = raster ? d3.scaleLinear().domain([raster.value.min, raster.value.max]).range([colors[0], colors[1]]) : null;
      const lutData = raster ? M.lut(raster, (value) => scale(value)) : null;
      const res = {
        raster, lutData, land, cache: images,
        lookupFor: (at) => {
          const key = `${at.k}|${at.x}|${at.y}`;
          if (!lookups.has(key)) lookups.set(key, M.lookup(base, at, [w, h], raster.bounds, raster.size));
          return lookups.get(key);
        },
      };
      const hatch = p.rasterHatch === false ? null : { line: token("--sd-color-dim"), background: token("--sd-color-surface") };
      canvas.setAttribute("data-sig", M.paintRaster(canvas, { source: p.raster ?? "", lut: colors.slice(0, 2).join(), view, hatch, draws }, res));
    }

    function paint(p) {
      const zoom = p.zoom ?? 1;
      const view = viewOf(p, zoom);
      const hatch = new Set(p.hatch ?? []), dots = new Set(p.dots ?? []);
      const fillOf = (id, i) => {
        if (hatch.has(id)) return null;
        if (p.fills === "background") return token("--sd-color-background");
        return colors[(i + (p.fills === "shifted" ? 1 : 0)) % colors.length];
      };
      const items = ids.map((id, i) => ({ id, fill: fillOf(id, i), stroke: token(dots.has(id) ? "--sd-color-background" : "--sd-color-ink"), width: dots.has(id) ? 1.5 : 1, dot: dots.has(id) }));
      const scene = { source: p.data, view, alpha: 1, hatch: { line: token("--sd-color-dim"), background: token("--sd-color-surface") }, items };

      const layer = (name) => ctx.chart.canvasLayer(el, { left: 0, top: 0, pw: w, ph: h, name });
      const areas = layer("areas");
      areas.setAttribute("data-sig", M.paintAreas(areas, scene, res));

      const points = layer("points");
      const [px, py] = path.centroid(features[0]);
      const marks = p.points ? [{ id: "p", x: px, y: py, r: 12, fill: colors[0], stroke: null }] : [];
      points.setAttribute("data-sig", M.paintPoints(points, { view, alpha: 1, items: marks }));

      if (p.inset) M.insetFrame(svg, { box: [w * 0.2, h * 0.2, w * 0.3, h * 0.3], frame: [w * 0.6, h * 0.55, w * 0.95, h * 0.95] });
      else svg.querySelector(".sd-map-inset")?.remove();
      if (p.scale) M.scaleBar(svg, { base, view, at: [w * 0.05, h * 0.95], maxWidth: w * 0.2, format: ctx.format(",.0f") });
      else svg.querySelector(".sd-map-scale")?.remove();
    }

    paint(props);
    await paintRaster(props, viewOf(props, props.zoom));
    return {
      async update(next) {
        paint(next);
        await paintRaster(next, viewOf(next, next.zoom));
      },
      destroy() {
        svg.remove();
        for (const canvas of el.querySelectorAll(":scope > canvas.sd-canvas-layer")) canvas.remove();
      },
    };
  },
};
