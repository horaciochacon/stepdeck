// The `raster` layer kind of `map`: a picture over the land, read from a raster file (a JSON that names a greyscale
// PNG and says what its grey levels mean) and painted with `paintRaster` (core/map-paint.js). It has three looks,
// chosen by the file's `value`:
//   a value raster   linear or log, a continuous ramp or stepped `classes` of the theme's sequential palette, or a
//                    diverging palette around `midpoint`: the same scale props as `areas`, through `colorScale`
//   a class raster   two or more classes, one colour each from the categorical palette, in order
//   a mask           one class, in the layer's `color`, a theme colour role (default `accent`)
// A value or class raster hatches the land beneath it that it has no data for, and the land beyond its bounds, in its own
// picture (`--sd-color-dim` over `--sd-color-surface`, as `areas` does for a region without a value), and the legend
// adds a "no data" row exactly when there is hatch to explain. A mask has no no-data: the cells that are not the class
// stay clear.
//
// A file with `frames` is a time-lapse: the prepared layer has `lapse`, the frames' labels and numbers and the raster
// to decode them from (index.js decodes the frames a step and its run need, a few at a time). A scene shows the frame
// pair of `state.frame`, `{ at, next, mix }` (indexes into the frames): the picture of frame `at`, and, while a run
// crossfades, the picture of `next` over it at `mix`, both at the view of the moment; `state.fromFrame` is the pair the
// old picture of a change of data shows. A raster without `frames` shows its one image whatever the pair.
//
// A raster is clipped to the land outline by default: a coarse cell whose centre is on land stops at the coastline instead
// of sticking out over the sea, whatever it holds (data or hatch), for every look. `clip: false` draws every cell whole,
// for a raster that covers the sea too. `clip` is part of the layer's definition, so a change of it crossfades like a
// change of data.
//
// The interface is that of every layer kind (see ./areas.js). A raster is painted in CSS px with the view's lookup table,
// so its canvas is made with `maxRatio: 1`; the lookup tables (`geo.lookupFor`) and the pictures and land masks
// (`geo.pictures`, a `PictureCache`) are the element's (index.js). A picture is made for one view and drawn at another
// through the affine map between them, so a flight (`state.flight`) draws two pictures only, the one at its start view
// and the one at its end view, both placed at the view of the moment, the wider one (the lower scale) underneath at full
// weight and the other blending over it (`flightDraws`): the raster stays filled as the map zooms in or out, and is
// sharp when it arrives; no picture or lookup table is made for a view in between. A long flight whose path zooms out
// past both ends can leave a thin margin unfilled at its widest moment, where neither picture reaches. While a layer's file, scale or colour changes (`state.from`, `state.change`), the old picture
// is painted on a scratch canvas at 1 - change and the new one on the layer's canvas at change, and the old is added over
// the new with `lighter`: exact where both are opaque (the two shares sum to one), fading where one is clear. At the end
// of a change or a flight the scene is the plain paint of the new picture, whatever way it was reached.
import { signature } from "../../core/canvas.js";
import { colorScale } from "../../core/chart-scale.js";
import { landCells, loadRaster, lut, rasterGaps } from "../../core/map.js";
import { paintRaster } from "../../core/map-paint.js";
import { DEFAULT_ROLE, roleColor, roleNames } from "./colors.js";

/**
 * The pictures and land masks `paintRaster` keeps for an element (its `res.cache`): a Map of at most `limit` entries,
 * the least recently read or written going first when one more comes.
 */
export class PictureCache extends Map {
  constructor(limit) {
    super();
    this.limit = limit;
  }

  get(key) {
    if (!super.has(key)) return undefined;
    const value = super.get(key);
    super.delete(key);
    super.set(key, value);
    return value;
  }

  set(key, value) {
    super.delete(key);
    super.set(key, value);
    while (this.size > this.limit) super.delete(this.keys().next().value);
    return this;
  }
}

/** Every region of a geography as one Path2D, in base-projected px, made once per geography. */
const lands = new WeakMap();
function landOf(geo) {
  if (!lands.has(geo)) {
    const land = new Path2D();
    for (const id of geo.ids) land.addPath(geo.res.path(id));
    lands.set(geo, land);
  }
  return lands.get(geo);
}

/** Whether land has no data in `raster`: asked once per raster and set of features, whatever layers show it. */
const gaps = new WeakMap();
function gapsOf(raster, features) {
  if (!gaps.has(features)) gaps.set(features, new Map());
  const byPath = gaps.get(features);
  if (!byPath.has(raster.path)) byPath.set(raster.path, rasterGaps(raster, features));
  return byPath.get(raster.path);
}

/** The colour of the mask's theme role (`accent`, `alert`, …); throws for a name the theme has no colour for. */
function maskColor(role, ctx, file) {
  const color = roleColor(role, ctx);
  if (!color) throw new Error(`${file}: color '${role}' is not a theme colour (${roleNames(ctx).join(", ")})`);
  return color;
}

/** The canvas the old picture of `canvas` is painted on while a layer changes: a detached twin of it, the same size. */
const scratches = new WeakMap();
function scratchOf(canvas) {
  if (!scratches.has(canvas)) scratches.set(canvas, canvas.ownerDocument.createElement("canvas"));
  const scratch = scratches.get(canvas);
  if (scratch.width !== canvas.width) scratch.width = canvas.width;
  if (scratch.height !== canvas.height) scratch.height = canvas.height;
  scratch.style.width = canvas.style.width;
  scratch.style.height = canvas.style.height;
  return scratch;
}

/** The frame pair of a moment that rests on frame `i`. */
export const still = (i) => ({ at: i, next: i, mix: 0 });
const FIRST = still(0);

/** Whether a raster from `loadRaster` is a time-lapse: a file with `frames`, each labelled (one `src` has one frame, labelled ""). */
export const isLapse = (raster) => raster.frames[0].label !== "";

/**
 * The scene of a prepared layer at `view`, drawn at `alpha`: the picture of frame `pair.at` at `view`, or, during
 * `flight`, its pictures at the flight's two ends (`flightDraws`); while a run crossfades (`pair.mix` above 0), the
 * picture of `pair.next` over it at its share. A run never plays during a flight.
 */
const sceneOf = (prepared, view, alpha, flight, pair) => {
  const { at, next, mix } = prepared.lapse && pair ? pair : FIRST;
  const draws = flight ? flightDraws(flight, alpha, at) : [{ frame: at, at: view, alpha }];
  if (mix > 0 && next !== at) draws.push({ frame: next, at: view, alpha: alpha * mix });
  return { source: prepared.source, lut: prepared.lutName, view, hatch: prepared.hatch, clip: prepared.clip, draws };
};

/**
 * The draws of a flight, of frame `frame`: the picture of the wider end (the lower scale, which covers more of the
 * element at any view between) under the other, at `alpha`, and the other over it at its share of the way, so the two
 * blend as the flight goes from the start's picture to the end's. Zooming in, the start's is under and the end's comes
 * in at `t`; zooming out, the end's is under and the start's goes at `1 - t`. Wherever the lower one reaches, the raster
 * stays filled.
 */
function flightDraws({ from, to, t }, alpha, frame) {
  if (to.k < from.k) return [{ frame, at: to, alpha }, { frame, at: from, alpha: alpha * (1 - t) }];
  return [{ frame, at: from, alpha }, { frame, at: to, alpha: alpha * t }];
}

/** A short name for a colour table: equal exactly when the tables are. */
function tableName(table) {
  const sig = signature();
  for (const byte of table) sig.char(byte);
  return sig.hex();
}

export default {
  kind: "raster",
  maxRatio: 1,

  /**
   * Reads `layer.raster`, decodes its first frame and builds the layer's colour table, hatch and legend, and for a
   * time-lapse `lapse`: `{ labels, numbers, raster }`, the frames' labels and numbers in file order and the raster
   * whose `grid(i)` decodes frame `i`. Throws the raster loader's errors (each starts with the file's path), the
   * scale's, and `data/mask.json: color 'teal' is not a theme colour (accent, alert, …)`.
   */
  async prepare(layer, props, ctx, geo) {
    const raster = await loadRaster(layer.raster, ctx);
    await raster.grid(0);
    const { value } = raster;
    const mask = value.classes?.length === 1;
    const palettes = { sequential: ctx.palette?.("sequential"), diverging: ctx.palette?.("diverging"), categorical: ctx.palette?.("categorical") };
    const spec = value.classes
      ? { categories: value.classes, color: mask ? maskColor(layer.color ?? DEFAULT_ROLE, ctx, layer.raster) : undefined }
      : { classes: layer.classes, midpoint: layer.midpoint, domain: layer.domain, log: value.scale === "log", values: [value.min, value.max] };
    const scale = colorScale(spec, palettes, { format: ctx.format(",") });
    const lutData = lut(raster, (v) => scale.color(v));

    const hatch = mask ? null : { line: geo.colors.dim, background: geo.colors.surface };
    const res = {
      raster, lutData, cache: geo.pictures,
      land: landOf(geo),
      landCells: hatch ? landCells(raster, geo.features) : null,
      lookupFor: (at, size) => geo.lookupFor(at, raster, size), // a table serves every raster with these bounds and this grid, in every frame; `size` is the canvas's (the inset's is not the element's)
    };
    const lapse = isLapse(raster) ? { labels: raster.frames.map((f) => f.label), numbers: raster.frames.map((f) => f.numbers), raster } : null;
    return { source: `${geo.key}|${raster.path}`, title: layer.label, clip: layer.clip !== false, legend: scale.legend, noData: hatch ? await gapsOf(raster, geo.features) : false, hatch, lutName: tableName(lutData), res, geo, lapse };
  },

  scene(prepared, { view, flight, alpha, from, change, frame, fromFrame }) {
    // At the end of a change the scene is the plain one: what a jump paints.
    if (!from || change >= 1) return sceneOf(prepared, view, alpha, flight, frame);
    return { ...sceneOf(prepared, view, alpha * change, flight, frame), was: { scene: sceneOf(from, view, alpha * (1 - change), flight, fromFrame), res: from.res } };
  },

  paint(canvas, scene, prepared) {
    const sig = paintRaster(canvas, scene, prepared.res);
    if (!scene.was) return sig;
    const g = canvas.getContext("2d");
    const scratch = g ? scratchOf(canvas) : canvas; // a canvas that cannot paint only signs, the old picture too
    const hash = signature();
    hash.text(`${sig}|${paintRaster(scratch, scene.was.scene, scene.was.res)}`);
    if (g) {
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = "lighter";
      g.drawImage(scratch, 0, 0);
      g.restore();
    }
    return hash.hex();
  },

  legend(prepared) {
    return { title: prepared.title, legend: prepared.legend, noData: prepared.noData };
  },
};
