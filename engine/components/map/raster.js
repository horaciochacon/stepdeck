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
// stay clear. A file with `frames` shows its first frame; the others are not decoded.
//
// The interface is that of every layer kind (see ./areas.js). A raster is painted in CSS px with the view's lookup table,
// so its canvas is made with `maxRatio: 1`; the pictures, lookup tables and land mask of a geography are cached for it.
// While a layer's file, scale or colour changes (`state.from`, `state.change`), the old picture is painted on a scratch
// canvas at 1 - change and the new one on the layer's canvas at change, and the old is added over the new with
// `lighter`: exact where both are opaque (the two shares sum to one), fading where one is clear. At the end of the
// change the scene is the plain paint of the new picture, whatever way it was reached.
import { signature } from "../../core/canvas.js";
import { colorScale } from "../../core/chart-scale.js";
import { landCells, loadRaster, lookup, lut, rasterGaps } from "../../core/map.js";
import { paintRaster } from "../../core/map-paint.js";

const COLOR = "--sd-color-";
/** The theme colour role a mask takes when the layer names none. */
const DEFAULT_ROLE = "accent";

/** What each geography keeps for its rasters: the lookup tables, the pictures `paintRaster` builds, and the land as one path. */
const perGeo = new WeakMap();
function cachesOf(geo) {
  if (!perGeo.has(geo)) perGeo.set(geo, { lookups: new Map(), pictures: new Map(), land: null });
  return perGeo.get(geo);
}

/** Every region of `geo` as one Path2D, in base-projected px. */
function landOf(geo) {
  const caches = cachesOf(geo);
  if (!caches.land) {
    caches.land = new Path2D();
    for (const id of geo.ids) caches.land.addPath(geo.res.path(id));
  }
  return caches.land;
}

/** Whether land has no data in `raster`: asked once per raster and set of features, whatever layers show it. */
const gaps = new WeakMap();
function gapsOf(raster, features) {
  if (!gaps.has(features)) gaps.set(features, new Map());
  const byPath = gaps.get(features);
  if (!byPath.has(raster.path)) byPath.set(raster.path, rasterGaps(raster, features));
  return byPath.get(raster.path);
}

/** The colour of theme role `role` (`accent`, `alert`, …), resolved; throws for a name the theme has no colour for. */
function roleColor(role, ctx, file) {
  const color = ctx.tokens?.[`${COLOR}${role}`]?.trim();
  if (color) return color;
  const roles = Object.keys(ctx.tokens ?? {}).filter((name) => name.startsWith(COLOR)).map((name) => name.slice(COLOR.length));
  throw new Error(`${file}: color '${role}' is not a theme colour (${roles.join(", ")})`);
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

/** The plain scene of a prepared layer at `view`, drawn at `alpha`. */
const sceneOf = (prepared, view, alpha) => ({ source: prepared.source, lut: prepared.lutName, view, hatch: prepared.hatch, draws: [{ frame: 0, at: view, alpha }] });

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
   * Reads `layer.raster`, decodes its first frame and builds the layer's colour table, hatch and legend. Throws the
   * raster loader's errors (each starts with the file's path), the scale's, and
   * `data/mask.json: color 'teal' is not a theme colour (accent, alert, …)`.
   */
  async prepare(layer, props, ctx, geo) {
    const raster = await loadRaster(layer.raster, ctx);
    await raster.grid(0);
    const { value } = raster;
    const mask = value.classes?.length === 1;
    const palettes = { sequential: ctx.palette?.("sequential"), diverging: ctx.palette?.("diverging"), categorical: ctx.palette?.("categorical") };
    const spec = value.classes
      ? { categories: value.classes, color: mask ? roleColor(layer.color ?? DEFAULT_ROLE, ctx, layer.raster) : undefined }
      : { classes: layer.classes, midpoint: layer.midpoint, domain: layer.domain, log: value.scale === "log", values: [value.min, value.max] };
    const scale = colorScale(spec, palettes, { format: ctx.format(",") });
    const lutData = lut(raster, (v) => scale.color(v));

    const [w, h] = geo.size.map(Math.round);
    const { lookups, pictures } = cachesOf(geo);
    const hatch = mask ? null : { line: geo.colors.dim, background: geo.colors.surface };
    const res = {
      raster, lutData, cache: pictures,
      land: hatch ? landOf(geo) : null,
      landCells: hatch ? landCells(raster, geo.features) : null,
      // a table serves every raster with these bounds and this grid, in every frame
      lookupFor: (at) => {
        const key = `${raster.bounds}|${raster.size}|${at.k}|${at.x}|${at.y}`;
        if (!lookups.has(key)) lookups.set(key, lookup(geo.base, at, [w, h], raster.bounds, raster.size));
        return lookups.get(key);
      },
    };
    return { source: `${geo.key}|${raster.path}`, title: layer.label, legend: scale.legend, noData: hatch ? await gapsOf(raster, geo.features) : false, hatch, lutName: tableName(lutData), res, geo };
  },

  scene(prepared, { view, alpha, from, change }) {
    // At the end of a change the scene is the plain one: what a jump paints.
    if (!from || change >= 1) return sceneOf(prepared, view, alpha);
    return { ...sceneOf(prepared, view, alpha * change), was: { scene: sceneOf(from, view, alpha * (1 - change)), res: from.res } };
  },

  paint(canvas, scene, prepared) {
    const sig = paintRaster(canvas, scene, prepared.res);
    if (!scene.was) return sig;
    const scratch = scratchOf(canvas);
    const hash = signature();
    hash.text(`${sig}|${paintRaster(scratch, scene.was.scene, scene.was.res)}`);
    const g = canvas.getContext("2d");
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
