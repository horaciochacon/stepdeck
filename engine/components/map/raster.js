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
// A layer that changes its file or scale shows the new one at once (only a layer's own opacity fades).
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

  scene(prepared, { view, alpha }) {
    return { source: prepared.source, lut: prepared.lutName, view, hatch: prepared.hatch, draws: [{ frame: 0, at: view, alpha }] };
  },

  paint(canvas, scene, prepared) {
    return paintRaster(canvas, scene, prepared.res);
  },

  legend(prepared) {
    return { title: prepared.title, legend: prepared.legend, noData: prepared.noData };
  },
};
