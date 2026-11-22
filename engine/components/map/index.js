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
//   ./panel.js    the corner panel of a time-lapse: the frame's label and the numbers
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
// of a time-lapse to keep out of its way: the panel sits at the top-left, or the top-right when the inset is there.
//
// A raster layer whose file has `frames` is a time-lapse. `frame` names the frame on screen by its label (the first
// without it), one value for the whole map, so every time-lapse layer the step declares must have the same labels; the
// panel (./panel.js) shows the label and the `numbers` the step names, each from the one time-lapse layer whose frames
// have its key, formatted with `ctx.format`. A played step that changes `frame` plays in two phases. First everything
// else together, as above, at the frame it starts from; then the run, at the end view: one tween, linear in time, of
// `pace` ms per frame moved, through every frame between the two in list order (backward when the new one comes first,
// core/map-rules.js `frameRun`). At progress u over n moves the frames on screen are run[⌊u·n⌋] and the next, which
// crossfades in at the fractional part while the panel's numbers go linearly from one frame's value to the next; the
// label (and `data-frame`) shows the frame the crossfade heads to once it is half way. Before either phase the frames
// the run starts with are decoded, `READ_AHEAD` past the first (the rest follow as it plays, never all at once), and
// the update calls `info.expect` with the two phases' length, so the engine's watchdog allows the run (a run past
// MAX_RUN_MS is that element's error). The first phase lasts twice the step's duration when `view` or `inset.view`
// changes, once when anything else on screen does, and nothing otherwise. Jumped, backward or aborted (a click, a
// hidden page, leaving the slide), the step's frame and its numbers are drawn at once.
import { d3 } from "../../core/d3.js";
import { boundaries, loadRaster, lookup, projection, view } from "../../core/map.js";
import { DOT_SIZE } from "../../core/map-paint.js";
import { DEFAULT_PACE, frameRun } from "../../core/map-rules.js";
import { canAnimate, clamp01, lerp, measureHeight, measureWidth, memoAsync, motion, motionMs } from "../../core/kit.js";
import { createStage, through } from "./stage.js";
import { createInset, insetLayout, CORNERS } from "./inset.js";
import { createLegend } from "./legend.js";
import { createPanel } from "./panel.js";
import areas from "./areas.js";
import raster, { PictureCache, isLapse, still } from "./raster.js";
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
/** How many frames past the one on screen a run decodes, in its direction. */
const READ_AHEAD = 4;
/** The `pace` a map takes, ms per frame moved. */
const PACES = [100, 2000];

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
 * one), its alpha going with `f` and its view that of `insetFlight`, or of the state that has one. Each layer shows the
 * frame of its state (`frame`, a still pair: a layer going away keeps `a`'s, and the old picture of a change of data
 * shows `a`'s as `fromFrame`); `frame` is the label `b` is at, and `panel` the corner panel (`panelBetween`). With
 * `a === b`, both at 1 and no flight it is `b` at rest, with the exact colours a jump writes.
 */
function between(a, b, f, c, flight = null, insetFlight = null) {
  const was = new Set(a.highlight), now = new Set(b.highlight);
  const dimIn = (set, id) => (set.size > 0 && !set.has(id) ? 1 : 0);
  const [aFrame, bFrame] = [still(a.lapse?.index ?? 0), still(b.lapse?.index ?? 0)];
  const layers = b.layers.map((to, i) => {
    const from = a.layers[i];
    const alpha = lerp(from.alpha, to.alpha, f);
    // A layer going away shows what it showed; one that stays and changes crossfades from its old data.
    if (to.alpha === 0) return { prepared: from.prepared, alpha, from: null, change: 1, frame: aFrame };
    return { prepared: to.prepared, alpha, from: from.alpha > 0 && from.prepared !== to.prepared ? from.prepared : null, change: f, frame: bFrame, fromFrame: aFrame };
  });
  const lapse = b.lapse ?? a.lapse;
  return {
    view: flight ? flight.view : b.view,
    flight: flight && flight.t < 1 ? flight : null,
    frame: lapse ? lapse.labels[lapse.index] : null,
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
    layers,
    panel: panelBetween(a.lapse, b.lapse, f, layers),
  };
}

/** Whether two `numbers` rows of a step state's time-lapse show the same thing. */
const sameRow = (a) => (b) => a.key === b.key && a.label === b.label && a.format === b.format;

/**
 * The corner panel of a moment between time-lapses `a` and `b` (a step state's `lapse`, or null) at fade `f`, over
 * `layers`, the moment's: the label of `b`'s frame (or `a`'s, while `b` has none) and each of its numbers at that frame,
 * a row that `numbers` gains or loses fading in or out, the whole at the opacity of the time-lapse layers on screen
 * (`alpha`, 0 when none is shown); null when neither has a time-lapse.
 */
function panelBetween(a, b, f, layers) {
  const lapse = b ?? a;
  if (!lapse) return null;
  const was = a?.numbers ?? [], is = b?.numbers ?? [];
  const row = (number, at, opacity) => ({ key: number.key, label: number.label, text: number.fmt(number.values[at]), opacity });
  return {
    label: lapse.labels[lapse.index],
    alpha: Math.max(0, ...layers.filter((layer) => layer.prepared?.lapse).map((layer) => layer.alpha)),
    rows: [
      ...is.map((number) => row(number, b.index, was.some(sameRow(number)) ? 1 : f)),
      ...was.filter((number) => !is.some(sameRow(number))).map((number) => row(number, a.index, 1 - f)),
    ],
  };
}

/**
 * The moment of a run of step state `s` at frame pair `pair` ({ at, next, mix }): `rest`, the state at rest, with its
 * time-lapse layers on the pair, the panel's numbers between the values of its two frames, and the label of the frame
 * the crossfade heads to once it is half way.
 */
function runMoment(rest, s, pair) {
  const label = s.lapse.labels[pair.mix >= 0.5 ? pair.next : pair.at];
  const text = (number) => number.fmt(lerp(number.values[pair.at], number.values[pair.next], pair.mix));
  return {
    ...rest,
    frame: label,
    layers: rest.layers.map((layer) => ({ ...layer, frame: pair })),
    panel: { ...rest.panel, label, rows: rest.panel.rows.map((r, i) => ({ ...r, text: text(s.lapse.numbers[i]) })) },
  };
}

/**
 * The run of a step from state `a` to `b`: the frame indexes it shows, `a`'s frame to `b`'s inclusive (`frameRun`), or
 * null for none: the frame stays, a state has no time-lapse or `b` shows none of its layers, or the two have different
 * frame labels (their layers then crossfade, as any change of data does).
 */
function runOf(a, b) {
  if (!a.lapse || !b.lapse || a.lapse.index === b.lapse.index || !sameList(a.lapse.labels, b.lapse.labels)) return null;
  if (!b.layers.some((layer) => layer.alpha > 0 && layer.prepared?.lapse)) return null;
  const { labels } = b.lapse;
  return frameRun(labels, labels[a.lapse.index], labels[b.lapse.index]);
}

/** The rasters of the time-lapse layers a step state declares. */
const lapseRasters = (s) => [...new Set(s.layers.flatMap(({ prepared }) => (prepared?.lapse ? [prepared.lapse.raster] : [])))];
/** Decodes frame `i` (default: the step's own) of every time-lapse layer of step state `s`, so it can be painted. */
const decodeFrame = (s, i = s.lapse?.index) => Promise.all(lapseRasters(s).map((r) => r.grid(i)));

/**
 * The time-lapse of a step: null when none of the layers it declares (`slots`, with `layers` prepared for them) is a
 * time-lapse; else `{ labels, index, pace, numbers }`: their frame labels, the index of the one `frame` names (the first
 * without it), the step's `pace`, and for each entry of `numbers` `{ key, label, format, fmt, values }`, `fmt` the
 * formatter of `format` and `values` the key's value in each frame. Throws `time-lapse layers 'a' and 'b' have different
 * frame labels`, `frame '1999' not found (frames: …)`, what `pace` takes, and for a `numbers` key that is not in exactly
 * one time-lapse layer, or comes without a `format`.
 */
function lapseOf(p, slots, layers, ctx) {
  const found = slots.flatMap(({ id }, i) => (layers[i].prepared?.lapse ? [{ id, ...layers[i].prepared.lapse }] : []));
  if (found.length === 0) return null;
  const [first] = found;
  const other = found.find((layer) => !sameList(layer.labels, first.labels));
  if (other) fail(`time-lapse layers '${first.id}' and '${other.id}' have different frame labels`);
  const index = p.frame === undefined || p.frame === null ? 0 : frameRun(first.labels, p.frame, p.frame)[0];
  const pace = p.pace ?? DEFAULT_PACE;
  if (typeof pace !== "number" || !(pace >= PACES[0] && pace <= PACES[1])) fail(`\`pace\` must be ${PACES[0]} to ${PACES[1]} ms a frame`);
  const keys = [...new Set(found.flatMap((layer) => Object.keys(layer.numbers[0])))];
  const numbers = (p.numbers ?? []).map(({ key, label = "", format } = {}) => {
    const holders = found.filter((layer) => Object.hasOwn(layer.numbers[0], key));
    if (holders.length === 0) fail(`\`numbers\` key '${key}' is in no time-lapse layer (keys: ${keys.join(", ") || "none"})`);
    if (holders.length > 1) fail(`\`numbers\` key '${key}' is in time-lapse layers ${holders.map((layer) => `'${layer.id}'`).join(" and ")}`);
    if (typeof format !== "string" || format === "") fail(`\`numbers\` key '${key}' needs a \`format\` (a d3-format string such as ",.0f")`);
    return { key, label, format, fmt: ctx.format(format), values: holders[0].numbers.map((n) => n[key]) };
  });
  return { labels: first.labels, index, pace, numbers };
}

/** The inset of a moment between insets `a` and `b` (each `{ view, at, scale }` or null) at fade `f`; see `between`. */
function insetBetween(a, b, f, flight) {
  const now = b ?? a;
  if (!now) return null;
  return { at: now.at, scale: now.scale, alpha: lerp(a ? 1 : 0, b ? 1 : 0, f), view: flight ? flight.view : now.view, flight: flight && flight.t < 1 ? flight : null };
}

/** Whether insets `a` and `b` (each `{ view, ... }` or null) are both on, or both off, and at one view. */
const sameInset = (a, b) => (a && b ? sameView(a.view, b.view) : !a && !b);

/** The `numbers` rows of a step state, as text: equal when the panel shows the same rows. */
const rowsOf = (s) => (s.lapse?.numbers ?? []).map(({ key, label, format }) => `${key}|${label}|${format}`).join("\n");

/** Whether going from step state `a` to `b` changes anything on screen that motion would show, a run aside. */
const moves = (a, b) =>
  !sameView(a.view, b.view) || !sameInset(a.inset, b.inset) || !sameList(a.highlight, b.highlight) || !sameList(a.labels, b.labels) ||
  rowsOf(a) !== rowsOf(b) ||
  a.layers.some((from, i) => from.alpha !== b.layers[i].alpha || (from.alpha > 0 && from.prepared !== b.layers[i].prepared));

/**
 * How many raster layers of `propsList` show a time-lapse at some step. A file that fails to load does not count: the
 * step that shows it reports it.
 */
async function lapseLayers(propsList, ctx) {
  const files = new Map(); // layer id -> the raster files it names
  for (const p of propsList) {
    for (const [id, def] of Object.entries(p.layers ?? {})) {
      if (kindOf(def) === raster && typeof def.raster === "string") files.set(id, new Set([...(files.get(id) ?? []), def.raster]));
    }
  }
  const lapse = (file) => loadRaster(file, ctx).then(isLapse, () => false);
  const found = await Promise.all([...files.values()].map(async (names) => (await Promise.all([...names].map(lapse))).some(Boolean)));
  return found.filter(Boolean).length;
}

export default {
  async mount(el, props, ctx) {
    const geos = new Map();
    const fromSteps = (ctx.stepProps ?? []).filter(Boolean);
    const legend = createLegend(el, ctx);
    const panel = createPanel(el);
    let stage = null; // the stage on screen: { geo, key, slots, view, inset }, `view` from createStage, `inset` from createInset (or null)
    const dropStage = () => {
      stage?.inset?.destroy();
      stage?.view.destroy();
    };
    let last = null; // the last state written
    let gone = false; // destroyed: an update still under way paints nothing more

    // The caches of the element, for every geography it builds: what a picture costs is bounded by the views the slide
    // names (a picture and a land mask each, per raster layer), plus a few for views it does not name, plus, for each
    // time-lapse layer, the pictures of the frames a run has decoded ahead and the pair on screen.
    const viewsOf = (list) => new Set(list.map((p) => JSON.stringify([p.boundaries, p.projection, p.view ?? null]))).size;
    const views = viewsOf(fromSteps);
    const insetViews = viewsOf(fromSteps.filter((p) => p.inset).map((p) => ({ ...p, view: p.inset.view })));
    const rasters = slotsOf(fromSteps).filter((slot) => slot.module === raster).length;
    const frames = (READ_AHEAD + 2) * (await lapseLayers(fromSteps, ctx));
    const caches = { lookups: new Map(), pictures: new PictureCache(2 * (Math.max(1, views) + insetViews) * Math.max(1, rasters) + SPARE_PICTURES + frames) };
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
        panel.destroy();
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
      const s = { stage, view: viewOf(geo, p.view ?? null), inset: insetOf(geo, p.inset, checkView), highlight: [...(p.highlight ?? [])], labels: [...(p.labels ?? [])], legend: p.legend ?? "bottom-left", layers, lapse: lapseOf(p, stage.slots, layers, ctx) };
      await decodeFrame(s);
      return s;
    }

    /** Paints `moment` (a `between` state) of step state `s`, its legend and its panel; `moving` for a frame of a tween. */
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
      const at = s.inset?.at === "top-left" ? "top-right" : "top-left";
      panel.write(moment.panel?.alpha > 0 ? { ...moment.panel, at } : null);
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

    /**
     * Plays the run `run` (frame indexes) of step state `s` in one tween, linear in time, `s.lapse.pace` ms a move (see
     * the top of this file). The frames `READ_AHEAD` past the one on screen are asked for as it goes; a pair still being
     * decoded is not painted (the moment before stays on screen), and a frame that cannot be decoded fails the update.
     */
    async function playRun(s, run, info) {
      const n = run.length - 1;
      const decoders = lapseRasters(s);
      const rest = between(s, s, 1, 1);
      let failed = null;
      let asked = READ_AHEAD; // the run's places up to here are decoded or on their way (playStep decoded the first ones)
      const frame = (u) => {
        if (failed) throw failed;
        if (info.signal?.aborted) return; // the end state is painted next
        const k = Math.min(n - 1, Math.floor(u * n));
        while (asked < Math.min(n, k + READ_AHEAD)) {
          asked += 1;
          for (const r of decoders) r.grid(run[asked]).catch((error) => (failed ??= error));
        }
        const pair = { at: run[k], next: run[k + 1], mix: Math.min(1, u * n - k) };
        if (decoders.some((r) => !r.decoded(pair.at) || !r.decoded(pair.next))) return;
        draw(s, runMoment(rest, s, pair), true);
      };
      await ctx.animate.tween(0, 1, frame, { duration: n * s.lapse.pace, signal: info.signal, ease: (u) => u });
      if (failed) throw failed;
    }

    /**
     * Plays the change from step state `from` to `to`: everything that changes on screen together (`play`), at the frame
     * it starts from, then the run of a changed `frame` (`playRun`). For a run, the frames it starts with are decoded
     * first and `info.expect` is told the length of both phases, before either plays.
     */
    async function playStep(from, to, info) {
      const run = runOf(from, to);
      const start = run ? { ...to, lapse: { ...to.lapse, index: run[0] } } : to;
      const changes = moves(from, start);
      if (run) {
        await Promise.all(run.slice(0, READ_AHEAD + 1).map((i) => decodeFrame(to, i)));
        const flies = !sameView(from.view, to.view) || (from.inset && to.inset && !sameView(from.inset.view, to.inset.view));
        const first = flies ? motionMs(info, ctx, 2) : changes ? motionMs(info, ctx, 1) : 0;
        info.expect?.(first + (run.length - 1) * to.lapse.pace);
      }
      if (changes) await play(from, start, info);
      if (run && canAnimate(info)) await playRun(to, run, info);
    }

    await stateOf(props); // fail early: the boundaries, the layers' data, unknown ids
    await prebuild();
    Object.defineProperty(el, "sdMapLookups", { value: () => caches.lookups.size, configurable: true }); // for tests: never an attribute
    return {
      async update(p, info = {}) {
        const target = await stateOf(p);
        if (canAnimate(info) && !info.entered && last?.stage === target.stage) await playStep(last, target, info);
        await decodeFrame(target); // a long run may have pushed it out of the frames the raster keeps
        if (gone) return;
        draw(target, between(target, target, 1, 1));
        last = target;
      },
      destroy() {
        gone = true;
        dropStage();
        legend.destroy();
        panel.destroy();
        geos.clear();
        caches.lookups.clear();
        caches.pictures.clear();
        delete el.sdMapLookups;
      },
    };
  },
};
