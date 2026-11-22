// Built-in `map`: the regions of a GeoJSON file and, over them, layers of data (a choropleth of `areas`, a `raster`,
// `points`), highlighted regions, names on the map and a legend, all set per step by props. This file assembles: it
// reads the props, loads the geography and the layers, works out each step's state and plays the change between two of
// them.
// The pieces are elsewhere:
//   ./areas.js    the `areas` layer kind (the interface every kind shares is described there)
//   ./raster.js   the `raster` layer kind: value rasters, class rasters and masks
//   ./points.js   the `points` layer kind: places from longitude and latitude columns, sized and coloured by a column
//   ./stage.js    one view of the map: its canvases in paint order, the borders, the labels
//   ./inset.js    the inset: a second, smaller stage at a corner, with its box on the map, leaders and scale bar
//   ./legend.js   the legend rows in a corner
//   core/map.js, core/map-paint.js, core/chart-scale.js   the public pieces (`ctx.map`, `ctx.chart`) they are built on
//
// The geography (`geo`) is the boundaries fitted in the element: built when the element mounts, and again only when
// `boundaries`, `id`, `name`, `projection` or the element's size changes (a snap). The stage holds a canvas for every
// layer any step of the slide declares (`ctx.stepProps`), so no step adds one.
//
// `view` is a view of the geography (core/map.js `view`): home, fitted to regions, or to a box of longitude and latitude.
// The element keeps the raster lookup tables it builds (one per view, size and raster grid) and a bounded cache of
// raster pictures, both dropped when its size changes and when it is destroyed. At mount it builds the lookup tables of
// every view its slide's steps name (the inset's too, at the inset's size), for the rasters each step declares, for up to
// 2 s, so a flight does not wait for them; the rest are built on first need (a `ctx.mount` child, with no `stepProps`,
// builds them all on first need).
//
// An update writes the end state of its props whatever came before. With info.animate (a forward step by one, the
// element already on screen) it first plays the change in one tween bound to info.signal, so an abort snaps to the
// end: a layer that is shown or hidden fades, and its legend row and the labels that come or go with it, over the
// step's duration (`--sd-duration`, or the step's `transition`); a change of a layer's data or scale crossfades
// its colours over the same time; `highlight` turns the other regions and points to `--sd-color-dim` and outlines its own
// in ink over `--sd-duration-fast`; a change of `view` flies the map there along d3.interpolateZoom over twice the
// step's duration, every vector redrawn through the view at each frame and each raster crossfading from its picture at
// the start view to its picture at the end view, both placed at the view of the moment; the same for `inset.view` on the
// inset alone, with the box on the map following. An inset that comes or goes fades, with its box and leaders. The map
// does not own its entrance: the engine moves its box in.
//
// `inset` is `{ view, at, scale }` or none. The inset is a second stage that shows the same prepared layers, scales,
// highlight and names through its own view (./inset.js); it exists on the page only while the inset is on (or fading), so
// the markup at rest is a function of the props. The step state keeps `inset.at`, where the inset sits, for the panel
// of a time-lapse to keep out of its way.
import { d3 } from "../../core/d3.js";
import { boundaries, loadRaster, lookup, projection, view } from "../../core/map.js";
import { DOT_SIZE } from "../../core/map-paint.js";
import { canAnimate, clamp01, lerp, measureHeight, measureWidth, memoAsync, motion, motionMs } from "../../core/kit.js";
import { createStage, through } from "./stage.js";
import { createInset, insetLayout, CORNERS } from "./inset.js";
import { createLegend } from "./legend.js";
import areas from "./areas.js";
import raster, { PictureCache } from "./raster.js";
import points from "./points.js";

/** The layer kinds, in paint order: areas under rasters, the borders over both, and points over the borders. */
const KINDS = [areas, raster, points];
/** The view that shows the whole map. */
const HOME = Object.freeze({ k: 1, x: 0, y: 0 });
/** How many region ids a "not found" message lists before it stops. */
const HINT = 5;
/** How long a mount spends building the lookup tables of the views its slide names, in ms of `performance.now()`. */
const PREBUILD_MS = 2000;
/** The raster pictures an element keeps besides a picture and a land mask per view its slide names and raster layer. */
const SPARE_PICTURES = 8;

const kindOf = (def) => KINDS.find((kind) => def?.[kind.kind] !== undefined);
const words = (list) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} or ${list.at(-1)}` : list[0]);
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const sameView = (a, b) => a.k === b.k && a.x === b.x && a.y === b.y;
/** The region ids a `view` names: its id, or its list of them; none for a box or home. */
const viewIds = (target) => (typeof target === "string" || Array.isArray(target) ? [target].flat() : []);

/**
 * The geography of an element: the regions of `props.boundaries` fitted in `size`, each with its path and its anchor
 * (the centroid of its largest polygon: where its dot and its label sit) in base-projected px, the theme's colours,
 * and `key`, which names the geometry (file, projection, size) in every scene's `source`, so signatures see it. A
 * region is a dot when its projected box is under `DOT_SIZE` across in both directions at the view. `caches` are the
 * element's: `lookups`, the raster lookup tables by `file|projection|k,x,y|w×h|bounds|cols×rows`, and `pictures`.
 */
async function buildGeo(props, ctx, size, caches) {
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
  const [w, h] = size.map(Math.round);
  return {
    file, base, size, features, byId, ids, names,
    key: `${file}|${kind}|${size[0]}×${size[1]}`, // the geometry, first in every scene's source
    colors: { surface: token("--sd-color-surface"), rule, ink: token("--sd-color-ink"), background: token("--sd-color-background"), dim: token("--sd-color-dim") || rule },
    anchor: (id) => anchors.get(id),
    isDot: (id, k) => spans.get(id).every((span) => span * k < DOT_SIZE),
    res: { path: (id) => paths.get(id), centroid: (id) => anchors.get(id) },
    prepared: new Map(), // the layers prepared on this geography, by kind and definition
    views: new Map(), // the views of this geography, by `view` target (viewOf)
    /** The lookup table of `raster` at view `at` for a canvas of `px` CSS px (the element's size; an inset's is its own), built once for the element. */
    lookupFor(at, { bounds, size: [cols, rows] }, px = [w, h]) {
      const id = `${file}|${kind}|${at.k},${at.x},${at.y}|${px[0]}×${px[1]}|${bounds}|${cols}×${rows}`;
      if (!caches.lookups.has(id)) caches.lookups.set(id, lookup(base, at, px, bounds, [cols, rows]));
      return caches.lookups.get(id);
    },
    pictures: caches.pictures, // the raster pictures of the element (raster.js)
  };
}

const fail = (message) => {
  throw new Error(message);
};

/** What a `view` other than null is fitted to: the regions it names, or its box. Throws `region 'X' not found`, and what `view` takes. */
function fitOf(geo, target) {
  if (typeof target === "string" || Array.isArray(target)) return viewIds(target).map((id) => geo.byId.get(id) ?? fail(`region '${id}' not found`));
  const box = target?.bounds;
  if (Array.isArray(box) && box.length === 4 && box.every(Number.isFinite)) return { bounds: box };
  return fail("`view` must be a region id, a list of them, `{ bounds: [west, south, east, north] }` or null");
}

/**
 * The view a `view` prop asks for on `geo`: home for null, else fitted to a region id, a list of them, or
 * `{ bounds: [west, south, east, north] }`. One object per geography and target, so the lookup tables built for it are
 * found again.
 */
function viewOf(geo, target = null) {
  const key = JSON.stringify(target);
  if (!geo.views.has(key)) geo.views.set(key, target === null ? HOME : view(geo.base, fitOf(geo, target), geo.size));
  return geo.views.get(key);
}

/**
 * The inset a step asks for on `geo`: `{ view, at, scale }` with the view fitted as a map's own is (to the element's
 * size: the inset shows what the element would at that view, smaller), or null for none. `checkView` throws for a
 * region that is not one. Throws what `inset` takes.
 */
function insetOf(geo, spec, checkView) {
  if (spec === undefined || spec === null) return null;
  if (typeof spec !== "object" || Array.isArray(spec)) fail("`inset` must be `{ view, at, scale }` or null");
  const at = spec.at ?? CORNERS[0];
  if (!CORNERS.includes(at)) fail(`inset \`at\` must be ${words(CORNERS.map((corner) => `"${corner}"`))}`);
  if (spec.scale !== undefined && typeof spec.scale !== "boolean") fail("inset `scale` must be true or false");
  checkView(spec.view);
  return { view: viewOf(geo, spec.view ?? null), at, scale: spec.scale ?? true };
}

/**
 * The flight from view `a` to view `b` in an element of `size`: a function of `t` (0..1) that gives
 * `{ from: a, to: b, t, view }`, the view of the moment by d3.interpolateZoom over each view's centre and width in
 * base-projected px (as d3-zoom measures a view: by the larger side), and exactly `a` and `b` at the ends.
 */
function flightOf(a, b, [w, h]) {
  const side = Math.max(w, h);
  const centre = (v) => [(w / 2 - v.x) / v.k, (h / 2 - v.y) / v.k, side / v.k];
  const zoom = d3.interpolateZoom(centre(a), centre(b));
  return (t) => {
    if (t <= 0) return { from: a, to: b, t: 0, view: a };
    if (t >= 1) return { from: a, to: b, t: 1, view: b };
    const [cx, cy, width] = zoom(t);
    const k = side / width;
    return { from: a, to: b, t, view: { k, x: w / 2 - k * cx, y: h / 2 - k * cy } };
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
 * The state of a moment between two step states `a` and `b`: fades at `f` (0..1), highlight colours at `c`, and the
 * view of `flight` (a moment of `flightOf`), or `b.view` without one; `flight` stays in the state while it is under
 * way, for the rasters. The inset is the same: `inset` is `{ at, scale, alpha, view, flight }` (null when neither state has
 * one), its alpha going with `f` and its view that of `insetFlight`, or of the state that has one. With `a === b`, both at 1
 * and no flight it is `b` at rest, with the exact colours a jump writes.
 */
function between(a, b, f, c, flight = null, insetFlight = null) {
  const was = new Set(a.highlight), now = new Set(b.highlight);
  const dimIn = (set, id) => (set.size > 0 && !set.has(id) ? 1 : 0);
  return {
    view: flight ? flight.view : b.view,
    flight: flight && flight.t < 1 ? flight : null,
    frame: null,
    frameMix: 0,
    inset: insetBetween(a.inset, b.inset, f, insetFlight),
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

/** The inset of a moment between insets `a` and `b` (each `{ view, at, scale }` or null) at fade `f`; see `between`. */
function insetBetween(a, b, f, flight) {
  const now = b ?? a;
  if (!now) return null;
  return { at: now.at, scale: now.scale, alpha: lerp(a ? 1 : 0, b ? 1 : 0, f), view: flight ? flight.view : now.view, flight: flight && flight.t < 1 ? flight : null };
}

/** Whether insets `a` and `b` (each `{ view, ... }` or null) are both on, or both off, and at one view. */
const sameInset = (a, b) => (a && b ? sameView(a.view, b.view) : !a && !b);

/** Whether going from step state `a` to `b` changes anything on screen that motion would show. */
const moves = (a, b) =>
  !sameView(a.view, b.view) || !sameInset(a.inset, b.inset) || !sameList(a.highlight, b.highlight) || !sameList(a.labels, b.labels) ||
  a.layers.some((from, i) => from.alpha !== b.layers[i].alpha || (from.alpha > 0 && from.prepared !== b.layers[i].prepared));

export default {
  async mount(el, props, ctx) {
    const geos = new Map();
    const fromSteps = (ctx.stepProps ?? []).filter(Boolean);
    const legend = createLegend(el, ctx);
    let stage = null; // the stage on screen: { geo, key, slots, view, inset }, `view` from createStage, `inset` from createInset (or null)
    const dropStage = () => {
      stage?.inset?.destroy();
      stage?.view.destroy();
    };
    let last = null; // the last state written

    // The caches of the element, for every geography it builds: what a picture costs is bounded by the views the slide
    // names (a picture and a land mask each, per raster layer), plus a few for views it does not name.
    const viewsOf = (list) => new Set(list.map((p) => JSON.stringify([p.boundaries, p.projection, p.view ?? null]))).size;
    const views = viewsOf(fromSteps);
    const insetViews = viewsOf(fromSteps.filter((p) => p.inset).map((p) => ({ ...p, view: p.inset.view })));
    const rasters = slotsOf(fromSteps).filter((slot) => slot.module === raster).length;
    const caches = { lookups: new Map(), pictures: new PictureCache(2 * (Math.max(1, views) + insetViews) * Math.max(1, rasters) + SPARE_PICTURES) };
    let measured = null; // the size the caches are for

    const sizeOf = () => [Math.max(1, measureWidth(el, ctx)), Math.max(1, measureHeight(el, ctx))];
    /** The geography of `p` at the element's size; a new size drops the geographies and caches of the old one. */
    function geoFor(p) {
      const size = sizeOf();
      if (measured && (measured[0] !== size[0] || measured[1] !== size[1])) {
        geos.clear();
        caches.lookups.clear();
        caches.pictures.clear();
      }
      measured = size;
      return memoAsync(geos, JSON.stringify([p.boundaries, p.id, p.name, p.projection, size]), () => buildGeo(p, ctx, size, caches));
    }

    /**
     * Builds the lookup tables of the view each of the slide's steps names, and of its inset's (for the inset's size),
     * for the rasters that step declares, until `PREBUILD_MS` have gone; what is left is built on first need. A step
     * whose props fail is passed over: its own update reports the error.
     */
    async function prebuild() {
      const until = performance.now() + PREBUILD_MS;
      for (const p of fromSteps) {
        const files = new Set(Object.values(p.layers ?? {}).filter((def) => kindOf(def) === raster).map((def) => def.raster));
        if (files.size === 0) continue;
        try {
          const geo = await geoFor(p);
          const wanted = [{ at: viewOf(geo, p.view ?? null), size: undefined }];
          if (p.inset) {
            const { size, scale } = insetLayout(geo.size, CORNERS[0]);
            wanted.push({ at: through(viewOf(geo, p.inset.view ?? null), scale), size });
          }
          for (const file of files) {
            for (const { at, size } of wanted) {
              if (performance.now() > until) return;
              geo.lookupFor(at, await loadRaster(file, ctx), size);
            }
          }
        } catch {
          // that step's own update reports it
        }
      }
    }

    /** The state `props` asks for, on a stage that has every canvas it needs. Throws the element's errors. */
    async function stateOf(p) {
      const geo = await geoFor(p);
      const slots = slotsOf([...fromSteps, p]);
      const key = slots.map((slot) => `${slot.kind}:${slot.id}`).join("|");
      if (stage?.geo !== geo || stage.key !== key) {
        dropStage();
        legend.destroy(); // written again, after the new canvases
        stage = { geo, key, slots, view: createStage(el, { name: "main", size: geo.size, geo, layers: slots }), inset: null };
      }

      const defs = p.layers ?? {};
      const ids = Object.keys(defs);
      for (const [id, def] of Object.entries(defs)) {
        if (!kindOf(def)) throw new Error(`layer '${id}' needs ${words(KINDS.map((kind) => `\`${kind.kind}\``))}`);
      }
      const shown = p.shown ?? [];
      for (const id of shown) if (!Object.hasOwn(defs, id)) throw new Error(`layer '${id}' not found (layers: ${ids.join(", ") || "none"})`);
      const layers = await Promise.all(stage.slots.map(async ({ id, module }) => {
        const def = defs[id];
        if (kindOf(def) !== module) return { prepared: null, alpha: 0 };
        const prepared = await memoAsync(geo.prepared, `${module.kind}:${JSON.stringify(def)}`, () => module.prepare(def, p, ctx, geo));
        return { prepared, alpha: shown.includes(id) ? 1 : 0 };
      }));

      // `labels` name regions; `highlight` names regions, and the points of the layers this step declares
      const idLists = stage.slots.flatMap(({ module }, i) => (layers[i].prepared && module.ids ? [module.ids(layers[i].prepared)] : []));
      const named = new Set(idLists.flat());
      const list = (all) => `${all.slice(0, HINT).join(", ")}${all.length > HINT ? ", …" : ""}`;
      const hint = list([...geo.ids].sort());
      for (const id of p.highlight ?? []) {
        if (geo.byId.has(id) || named.has(id)) continue;
        throw new Error(idLists.length > 0 ? `'${id}' not found (regions: ${hint}; points: ${list([...named].sort())})` : `region '${id}' not found (regions: ${hint})`);
      }
      for (const id of p.labels ?? []) if (!geo.byId.has(id)) throw new Error(`region '${id}' not found (regions: ${hint})`);
      // `view` names regions only: a point's id says so
      const checkView = (target) => {
        for (const id of viewIds(target)) {
          if (geo.byId.has(id)) continue;
          throw new Error(named.has(id) ? `'${id}' is a point: \`view\` names regions only (regions: ${hint})` : `region '${id}' not found (regions: ${hint})`);
        }
      };
      checkView(p.view);
      return { stage, view: viewOf(geo, p.view ?? null), inset: insetOf(geo, p.inset, checkView), highlight: [...(p.highlight ?? [])], labels: [...(p.labels ?? [])], legend: p.legend ?? "bottom-left", layers };
    }

    /** Paints `moment` (a `between` state) of step state `s`, and its legend; `moving` for a frame of a tween. */
    function draw(s, moment, moving = false) {
      const { inset } = moment;
      s.stage.view.paint({ ...moment, cover: inset && { rect: insetLayout(s.stage.geo.size, inset.at).rect, alpha: inset.alpha } }, moment.layers, { moving });
      if (inset) {
        s.stage.inset ??= createInset(el, { main: s.stage.view, geo: s.stage.geo, slots: s.stage.slots, ctx });
        s.stage.inset.paint(moment, moment.layers, { moving });
      } else if (s.stage.inset) {
        s.stage.inset.destroy();
        s.stage.inset = null;
      }
      const rows = s.stage.slots.flatMap(({ id, module }, i) => {
        const { prepared, alpha } = moment.layers[i];
        const row = alpha > 0 ? module.legend(prepared, moment) : null;
        return row ? [{ id, ...row, opacity: alpha }] : [];
      });
      legend.write(s.legend, rows);
    }

    /**
     * Plays `from` -> `to` in one tween: fades over the step's duration (the inset's too), highlight colours over the
     * fast one, and the flights of the map and of the inset over twice the step's duration.
     */
    function play(from, to, info) {
      const fadeMs = motionMs(info, ctx, 1);
      const { duration: colorMs } = motion(info, ctx, { fast: true });
      const fly = sameView(from.view, to.view) ? null : flightOf(from.view, to.view, to.stage.geo.size);
      const insetFly = from.inset && to.inset && !sameView(from.inset.view, to.inset.view) ? flightOf(from.inset.view, to.inset.view, to.stage.geo.size) : null;
      const flightMs = fly || insetFly ? motionMs(info, ctx, 2) : 0;
      const { ease } = motion(info, ctx);
      const total = Math.max(fadeMs, colorMs, flightMs);
      const part = (u, ms) => (ms > 0 ? ease(clamp01((u * total) / ms)) : 1);
      const frame = (u) => draw(to, between(from, to, part(u, fadeMs), part(u, colorMs), fly?.(part(u, flightMs)), insetFly?.(part(u, flightMs))), true);
      return ctx.animate.tween(0, 1, frame, { duration: total, signal: info.signal, ease: (u) => u });
    }

    await stateOf(props); // fail early: the boundaries, the layers' data, unknown ids
    await prebuild();
    Object.defineProperty(el, "sdMapLookups", { value: () => caches.lookups.size, configurable: true }); // for tests: never an attribute
    return {
      async update(p, info = {}) {
        const target = await stateOf(p);
        if (canAnimate(info) && !info.entered && last?.stage === target.stage && moves(last, target)) await play(last, target, info);
        draw(target, between(target, target, 1, 1));
        last = target;
      },
      destroy() {
        dropStage();
        legend.destroy();
        geos.clear();
        caches.lookups.clear();
        caches.pictures.clear();
        delete el.sdMapLookups;
      },
    };
  },
};
