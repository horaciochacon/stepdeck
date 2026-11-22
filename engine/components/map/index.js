// Built-in `map`: the regions of a GeoJSON file and, over them, layers of data (a choropleth of `areas`, a `raster`),
// highlighted regions, names on the map and a legend, all set per step by props. This file assembles: it reads the
// props, loads the geography and the layers, works out each step's state and plays the change between two of them.
// The pieces are elsewhere:
//   ./areas.js    the `areas` layer kind (the interface every kind shares is described there)
//   ./raster.js   the `raster` layer kind: value rasters, class rasters and masks
//   ./stage.js    one view of the map: its canvases in paint order, the borders, the labels
//   ./legend.js   the legend rows in a corner
//   core/map.js, core/map-paint.js, core/chart-scale.js   the public pieces (`ctx.map`, `ctx.chart`) they are built on
//
// The geography (`geo`) is the boundaries fitted in the element: built when the element mounts, and again only when
// `boundaries`, `id`, `name`, `projection` or the element's size changes (a snap). The stage holds a canvas for every
// layer any step of the slide declares (`ctx.stepProps`), so no step adds one.
//
// An update writes the end state of its props whatever came before. With info.animate (a forward step by one, the
// element already on screen) it first plays the change in one tween bound to info.signal, so an abort snaps to the
// end: a layer that is shown or hidden fades, and its legend row and the labels that come or go with it, over the
// step's duration (`--sd-duration`, or the step's `transition`); a change of an areas layer's data or scale crossfades
// its colours over the same time (a raster layer shows its new picture at once); `highlight` turns the other regions to `--sd-color-dim` and outlines its own in ink over
// `--sd-duration-fast`. The map does not own its entrance: the engine moves its box in.
import { d3 } from "../../core/d3.js";
import { boundaries, projection } from "../../core/map.js";
import { DOT_SIZE } from "../../core/map-paint.js";
import { canAnimate, clamp01, lerp, measureHeight, measureWidth, memoAsync, motion, motionMs } from "../../core/kit.js";
import { createStage } from "./stage.js";
import { createLegend } from "./legend.js";
import areas from "./areas.js";
import raster from "./raster.js";

/** The layer kinds, in paint order: areas under rasters, and the borders over both. */
const KINDS = [areas, raster];
/** The view that shows the whole map. */
const HOME = Object.freeze({ k: 1, x: 0, y: 0 });
/** How many region ids a "not found" message lists before it stops. */
const HINT = 5;

const kindOf = (def) => KINDS.find((kind) => def?.[kind.kind] !== undefined);
const words = (list) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} or ${list.at(-1)}` : list[0]);
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The geography of an element: the regions of `props.boundaries` fitted in `size`, each with its path and its anchor
 * (the centroid of its largest polygon: where its dot and its label sit) in base-projected px, the theme's colours,
 * and `key`, which names the geometry (file, projection, size) in every scene's `source`, so signatures see it. A
 * region is a dot when its projected box is under `DOT_SIZE` across in both directions at the view.
 */
async function buildGeo(props, ctx, size) {
  const file = props.boundaries;
  if (typeof file !== "string" || file === "") throw new Error("map needs a `boundaries` path");
  const { features, byId, ids, names } = boundaries(await ctx.data(file), { id: props.id, name: props.name, file });
  const kind = props.projection ?? "equal-earth";
  const base = projection(kind, features, size);
  const path = d3.geoPath(base);
  const paths = new Map(), anchors = new Map(), spans = new Map();
  for (const [id, feature] of byId) {
    paths.set(id, new Path2D(path(feature) ?? ""));
    const [[x0, y0], [x1, y1]] = path.bounds(feature);
    spans.set(id, [x1 - x0, y1 - y0]);
    const { type, coordinates } = feature.geometry;
    const polygons = (type === "Polygon" ? [coordinates] : coordinates).map((rings) => ({ type: "Polygon", coordinates: rings }));
    anchors.set(id, path.centroid(polygons.reduce((a, b) => (path.area(b) > path.area(a) ? b : a))));
  }
  const token = (name) => ctx.tokens?.[name]?.trim();
  const rule = token("--sd-color-rule");
  return {
    file, base, size, features, byId, ids, names,
    key: `${file}|${kind}|${size[0]}×${size[1]}`, // the geometry, first in every scene's source
    colors: { surface: token("--sd-color-surface"), rule, ink: token("--sd-color-ink"), background: token("--sd-color-background"), dim: token("--sd-color-dim") || rule },
    anchor: (id) => anchors.get(id),
    isDot: (id, k) => spans.get(id).every((span) => span * k < DOT_SIZE),
    res: { path: (id) => paths.get(id), centroid: (id) => anchors.get(id) },
    prepared: new Map(), // the layers prepared on this geography, by kind and definition
  };
}

/** The layer slots of a list of props: `{ kind, id, module }` for every layer any of them declares, by kind, then by first appearance. */
function slotsOf(propsList) {
  const found = new Map();
  for (const props of propsList) {
    for (const [id, def] of Object.entries(props?.layers ?? {})) {
      const module = kindOf(def);
      if (module && !found.has(`${module.kind}:${id}`)) found.set(`${module.kind}:${id}`, { kind: module.kind, id, module });
    }
  }
  return KINDS.flatMap((module) => [...found.values()].filter((slot) => slot.module === module));
}

/**
 * The state of a moment between two step states `a` and `b`: fades at `f` (0..1), highlight colours at `c`. With
 * `a === b` and both at 1 it is `b` at rest, with the exact colours a jump writes.
 */
function between(a, b, f, c) {
  const was = new Set(a.highlight), now = new Set(b.highlight);
  const dimIn = (set, id) => (set.size > 0 && !set.has(id) ? 1 : 0);
  return {
    view: b.view,
    frame: null,
    frameMix: 0,
    highlight: {
      ids: b.highlight,
      dim: (id) => lerp(dimIn(was, id), dimIn(now, id), c),
      ring: (id) => lerp(was.has(id) ? 1 : 0, now.has(id) ? 1 : 0, c),
    },
    labels: [
      ...b.labels.map((id) => ({ id, opacity: a.labels.includes(id) ? 1 : f })),
      ...a.labels.filter((id) => !b.labels.includes(id)).map((id) => ({ id, opacity: 1 - f })),
    ],
    layers: b.layers.map((to, i) => {
      const from = a.layers[i];
      const alpha = lerp(from.alpha, to.alpha, f);
      // A layer going away shows what it showed; one that stays and changes crossfades from its old data.
      if (to.alpha === 0) return { prepared: from.prepared, alpha, from: null, change: 1 };
      return { prepared: to.prepared, alpha, from: from.alpha > 0 && from.prepared !== to.prepared ? from.prepared : null, change: f };
    }),
  };
}

/** Whether going from step state `a` to `b` changes anything on screen that motion would show. */
const moves = (a, b) =>
  !sameList(a.highlight, b.highlight) || !sameList(a.labels, b.labels) ||
  a.layers.some((from, i) => from.alpha !== b.layers[i].alpha || (from.alpha > 0 && from.prepared !== b.layers[i].prepared));

export default {
  async mount(el, props, ctx) {
    const geos = new Map();
    const fromSteps = (ctx.stepProps ?? []).filter(Boolean);
    const legend = createLegend(el, ctx);
    let stage = null; // the stage on screen: { geo, key, slots, view }, `view` from createStage
    let last = null; // the last state written

    const sizeOf = () => [Math.max(1, measureWidth(el, ctx)), Math.max(1, measureHeight(el, ctx))];
    const geoFor = (p, size) => memoAsync(geos, JSON.stringify([p.boundaries, p.id, p.name, p.projection, size]), () => buildGeo(p, ctx, size));

    /** The state `props` asks for, on a stage that has every canvas it needs. Throws the element's errors. */
    async function stateOf(p) {
      const geo = await geoFor(p, sizeOf());
      const slots = slotsOf([...fromSteps, p]);
      const key = slots.map((slot) => `${slot.kind}:${slot.id}`).join("|");
      if (stage?.geo !== geo || stage.key !== key) {
        stage?.view.destroy();
        stage = { geo, key, slots, view: createStage(el, { name: "main", size: geo.size, geo, layers: slots }) };
      }

      const defs = p.layers ?? {};
      const ids = Object.keys(defs);
      for (const [id, def] of Object.entries(defs)) {
        if (!kindOf(def)) throw new Error(`layer '${id}' needs ${words(KINDS.map((kind) => `\`${kind.kind}\``))}`);
      }
      const shown = p.shown ?? [];
      for (const id of shown) if (!Object.hasOwn(defs, id)) throw new Error(`layer '${id}' not found (layers: ${ids.join(", ") || "none"})`);
      const regions = [...geo.ids].sort();
      const hint = `${regions.slice(0, HINT).join(", ")}${regions.length > HINT ? ", …" : ""}`;
      for (const id of [...(p.highlight ?? []), ...(p.labels ?? [])]) {
        if (!geo.byId.has(id)) throw new Error(`region '${id}' not found (regions: ${hint})`);
      }

      const layers = await Promise.all(stage.slots.map(async ({ id, module }) => {
        const def = defs[id];
        if (kindOf(def) !== module) return { prepared: null, alpha: 0 };
        const prepared = await memoAsync(geo.prepared, `${module.kind}:${JSON.stringify(def)}`, () => module.prepare(def, p, ctx, geo));
        return { prepared, alpha: shown.includes(id) ? 1 : 0 };
      }));
      return { stage, view: HOME, highlight: [...(p.highlight ?? [])], labels: [...(p.labels ?? [])], legend: p.legend ?? "bottom-left", layers };
    }

    /** Paints `moment` (a `between` state) of step state `s`, and its legend. */
    function draw(s, moment) {
      s.stage.view.paint(moment, moment.layers);
      const rows = s.stage.slots.flatMap(({ id, module }, i) => {
        const { prepared, alpha } = moment.layers[i];
        const row = alpha > 0 ? module.legend(prepared, moment) : null;
        return row ? [{ id, ...row, opacity: alpha }] : [];
      });
      legend.write(s.legend, rows);
    }

    /** Plays `from` -> `to` in one tween: fades over the step's duration, highlight colours over the fast one. */
    function play(from, to, info) {
      const fadeMs = motionMs(info, ctx, 1);
      const { duration: colorMs } = motion(info, ctx, { fast: true });
      const { ease } = motion(info, ctx);
      const total = Math.max(fadeMs, colorMs);
      const part = (u, ms) => (ms > 0 ? ease(clamp01((u * total) / ms)) : 1);
      return ctx.animate.tween(0, 1, (u) => draw(to, between(from, to, part(u, fadeMs), part(u, colorMs))), { duration: total, signal: info.signal, ease: (u) => u });
    }

    await stateOf(props); // fail early: the boundaries, the layers' data, unknown ids
    return {
      async update(p, info = {}) {
        const target = await stateOf(p);
        if (canAnimate(info) && !info.entered && last?.stage === target.stage && moves(last, target)) await play(last, target, info);
        draw(target, between(target, target, 1, 1));
        last = target;
      },
      destroy() {
        stage?.view.destroy();
        legend.destroy();
      },
    };
  },
};
