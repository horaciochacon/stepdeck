// The geography of a map, and `mapKit`: the same pieces, frozen, which every component receives as `ctx.map`. A custom
// component can read boundaries, fit a projection, move between views and line a lon/lat raster up with the regions
// without the built-in `map`. The painters (core/map-paint.js) join the same object.
//
//   boundaries(geojson, { id, name, file })   validate a FeatureCollection of Polygons and MultiPolygons, fix the winding,
//                                             index the regions by id: { features, byId, ids, names }
//   projection(spec, features, [w, h])        the base projection: rotated to the regions' centre longitude, fitted to them
//   view(base, target, [w, h])                a zoom transform { k, x, y } over base-projected pixels
//   applyView(v, [px, py])                    a base-projected point seen through a view
//   lookup(base, v, [w, h], bounds, [cols, rows], { step })
//                                             the raster cell under every canvas pixel (or -1), from a coarse inverse grid
//   loadRaster(path, ctx)                     a raster file's grids, decoded exactly: { bounds, value, frames, size, grid, decoded }
//   lut(raster, colorOf)                      the 256 colours of a raster's levels, as 1,024 RGBA bytes
//   landCells(raster, features)               the raster cells whose centres are on land
//   rasterGaps(raster, features, { frames })  whether some land has no data in the raster (in those frames) or lies outside it
//   paintAreas, paintBorders, paintRaster, paintPoints, insetFrame, scaleBar
//                                             the painters and the map furniture (core/map-paint.js)
//
// A view is a 2D transform of the base's pixels (d3's fitExtent changes only scale and translate), so a flight between
// two views is affine: a component redraws cached paths with one `setTransform` instead of re-projecting.
//
// The lookup is for one view and one size. A component that asks for the same table often keeps its own cache (per
// element, cleared on destroy and on a size change), because the table's identity is the element's.
import { d3 } from "./d3.js";
import { scratchCanvas } from "./canvas.js";
import { MAX_RASTER_PIXELS, lapsePixelProblems, levelValue, pngProblems, rasterProblems } from "./map-rules.js";
import { paintAreas, paintBorders, paintRaster, paintPoints, insetFrame, scaleBar } from "./map-paint.js";

/** The most regions in one boundaries file. */
export const MAX_REGIONS = 5000;
/** The most coordinate positions (every ring, every polygon) in one boundaries file. */
export const MAX_POINTS = 250000;
/** The projections `projection` knows, by the name a deck uses. */
export const PROJECTIONS = Object.freeze({
  "equal-earth": () => d3.geoEqualEarth(),
  "natural-earth": () => d3.geoNaturalEarth1(),
  mercator: () => d3.geoMercator(),
  "conic-equal-area": () => d3.geoConicEqualArea(),
});
/** The margin around fitted content, as a share of the canvas's smaller side. */
const PADDING = 0.06;
/** The points along each edge of a `{ bounds }` box that `view` projects: the edges curve. */
const EDGE_SAMPLES = 64;

/** The most decoded frames a raster keeps: the least recently used goes. */
export const MAX_DECODED_FRAMES = 12;
/** Slack, in degrees, when `rasterGaps` asks whether the land lies inside a raster's bounds. */
const BOUNDS_SLACK = 1e-6;
/** A PNG is decoded as stored: no colour conversion, no premultiplied alpha. */
const DECODE = Object.freeze({ colorSpaceConversion: "none", premultiplyAlpha: "none" });

const count = d3.format(",");
const isBlank = (v) => v === undefined || v === null || v === "";
const collection = (features) => ({ type: "FeatureCollection", features });
/** The padded box a fit may use: [[x0, y0], [x1, y1]]. */
const paddedBox = ([w, h]) => {
  const pad = PADDING * Math.min(w, h);
  return [[pad, pad], [w - pad, h - pad]];
};

/** Reverses every ring of a polygon, on copies. */
const reversed = (rings) => rings.map((ring) => ring.slice().reverse());

/**
 * Validates `geojson` (a parsed FeatureCollection of Polygon and MultiPolygon features, as `ctx.data` returns it) and
 * indexes its regions. A region's id is `properties[id]`, or the feature's own `id` when no `id` is given, as a string;
 * its name is `properties[name]`, else the id. The input is never mutated.
 *
 * Winding is fixed: GeoJSON files from `sf` and `geopandas` follow RFC 7946 (outer rings counter-clockwise) and d3-geo
 * expects the opposite, so a polygon that d3 measures as more than half the sphere (`geoArea` above 2 pi) has its rings
 * reversed. Rewound polygons are copies; the features returned are new objects.
 *
 * `file` names the file in messages (default "boundaries"). Throws, with `<file>: ` first: `not a FeatureCollection`,
 * `feature 3 has no 'code'` (counting from 1), `region 'North' appears twice`, `only Polygon and MultiPolygon features
 * are supported (found LineString)`, `6,000 regions is more than 5,000`, `300,000 points is more than 250,000`.
 * @param {{ type: string, features?: any[] }} geojson
 * @param {{ id?: string, name?: string, file?: string }} [options]
 * @returns {{ features: any[], byId: Map<string, any>, ids: string[], names: Map<string, string> }}
 */
export function boundaries(geojson, { id, name, file = "boundaries" } = {}) {
  const fail = (message) => { throw new Error(`${file}: ${message}`); };
  if (geojson?.type !== "FeatureCollection" || !Array.isArray(geojson.features)) fail("not a FeatureCollection");
  if (geojson.features.length > MAX_REGIONS) fail(`${count(geojson.features.length)} regions is more than ${count(MAX_REGIONS)}`);

  const features = [], byId = new Map(), names = new Map();
  let points = 0;
  geojson.features.forEach((feature, i) => {
    const key = isBlank(id) ? feature?.id : feature?.properties?.[id];
    if (isBlank(key)) fail(`feature ${i + 1} has no '${id ?? "id"}'`);
    const region = String(key);
    if (byId.has(region)) fail(`region '${region}' appears twice`);
    const geometry = feature.geometry;
    if (geometry?.type !== "Polygon" && geometry?.type !== "MultiPolygon") {
      fail(`only Polygon and MultiPolygon features are supported (found ${geometry?.type ?? "no geometry"})`);
    }

    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    for (const rings of polygons) for (const ring of rings) points += ring.length;
    const wound = polygons.map((rings) => (d3.geoArea({ type: "Polygon", coordinates: rings }) > 2 * Math.PI ? reversed(rings) : rings));
    const copy = { ...feature, geometry: { ...geometry, coordinates: geometry.type === "Polygon" ? wound[0] : wound } };

    features.push(copy);
    byId.set(region, copy);
    const label = name === undefined ? undefined : feature.properties?.[name];
    names.set(region, isBlank(label) ? region : String(label));
  });
  if (points > MAX_POINTS) fail(`${count(points)} points is more than ${count(MAX_POINTS)}`);
  return { features, byId, ids: [...byId.keys()], names };
}

/**
 * The base projection of a map element, fixed for the element's life: the kind `spec` names ("equal-earth",
 * "natural-earth", "mercator" or "conic-equal-area"), rotated to the centre longitude of `features` (the middle of their
 * `d3.geoBounds`, taken across the antimeridian when the box crosses it), fitted to them in a `w` x `h` canvas with a
 * margin of 6% of the smaller side. The conic's two parallels sit a sixth of the latitude span in from each end.
 * @param {"equal-earth" | "natural-earth" | "mercator" | "conic-equal-area"} spec
 * @param {any[]} features  boundaries features (wound for d3)
 * @param {[number, number]} size
 * @returns {any} a d3 geo projection
 */
export function projection(spec, features, size) {
  const make = Object.hasOwn(PROJECTIONS, spec) ? PROJECTIONS[spec] : null;
  if (!make) throw new Error(`unknown projection '${spec}' (use ${Object.keys(PROJECTIONS).slice(0, -1).join(", ")} or ${Object.keys(PROJECTIONS).at(-1)})`);
  if (!features.length) throw new Error("projection needs at least one region");

  const content = collection(features);
  const [[west, south], [east, north]] = d3.geoBounds(content);
  const centre = west > east ? (west + east + 360) / 2 : (west + east) / 2;
  const base = make().rotate([-(((centre + 540) % 360) - 180), 0]);
  if (spec === "conic-equal-area") {
    const span = north - south;
    base.parallels([south + span / 6, south + (5 * span) / 6]);
  }
  // d3 measures the content at its default scale; resampling then differs a little at the final one, so the fit is exact
  // to about a pixel (the margin absorbs it).
  return base.fitExtent(paddedBox(size), content);
}

/** The projected box of a lon/lat box `[west, south, east, north]`: its edges are sampled, since they curve. */
function projectedBox(base, [west, south, east, north]) {
  const reach = east < west ? east + 360 : east;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const take = (lon, lat) => {
    const at = base([lon, lat]);
    if (!at || !at.every(Number.isFinite)) return;
    x0 = Math.min(x0, at[0]); x1 = Math.max(x1, at[0]);
    y0 = Math.min(y0, at[1]); y1 = Math.max(y1, at[1]);
  };
  for (let i = 0; i <= EDGE_SAMPLES; i++) {
    const lon = west + ((reach - west) * i) / EDGE_SAMPLES, lat = south + ((north - south) * i) / EDGE_SAMPLES;
    take(lon, south); take(lon, north); take(west, lat); take(reach, lat);
  }
  return [[x0, y0], [x1, y1]];
}

/**
 * A view over `base`: `{ k, x, y }`, a scale and a translation of base-projected pixels (see `applyView`). `target` is
 * `null` for the home view `{ k: 1, x: 0, y: 0 }`, an array of features (fitted by the projected bounds of their
 * collection), or `{ bounds: [west, south, east, north] }` in degrees (a box may cross the antimeridian: west > east).
 * The target is centred in the canvas and fitted with a 6% margin of the smaller side; a target that is a single point
 * keeps the scale 1.
 * @param {any} base
 * @param {null | any[] | { bounds: [number, number, number, number] }} target
 * @param {[number, number]} size
 * @returns {{ k: number, x: number, y: number }}
 */
export function view(base, target, size) {
  if (target === null || target === undefined) return { k: 1, x: 0, y: 0 };
  let box;
  if (Array.isArray(target)) {
    if (!target.length) throw new Error("view: no regions to fit");
    box = d3.geoPath(base).bounds(collection(target));
  } else {
    box = projectedBox(base, target.bounds);
  }
  const [[x0, y0], [x1, y1]] = box;
  if (![x0, y0, x1, y1].every(Number.isFinite)) throw new Error("view: the target cannot be projected");
  const [[left, top], [right, bottom]] = paddedBox(size);
  const [bw, bh] = [x1 - x0, y1 - y0];
  const fit = Math.min(bw > 0 ? (right - left) / bw : Infinity, bh > 0 ? (bottom - top) / bh : Infinity);
  const k = Number.isFinite(fit) ? fit : 1;
  return { k, x: size[0] / 2 - (k * (x0 + x1)) / 2, y: size[1] / 2 - (k * (y0 + y1)) / 2 };
}

/**
 * A base-projected point seen through a view: `[k * px + x, k * py + y]`.
 * @param {{ k: number, x: number, y: number }} v
 * @param {[number, number]} point
 * @returns {[number, number]}
 */
export function applyView(v, [px, py]) {
  return [v.k * px + v.x, v.k * py + v.y];
}

/**
 * The raster cell under every pixel of a `w` x `h` canvas seen through view `v`: an `Int32Array` of `w * h`, row-major from
 * the top-left pixel, holding `row * cols + col` or -1 where the pixel is outside the raster (or outside the projection).
 * Rows run north to south and columns west to east; `bounds` `[west, south, east, north]` are the outer edges of the
 * edge cells. The projection is inverted at the nodes of a grid `step` pixels apart (default 8) and lon/lat is
 * interpolated bilinearly between them, so building a table costs a few thousand inverts, not one per pixel; a pixel's
 * position is its centre. A node the projection cannot invert makes the cells around it -1. Longitudes are unwrapped
 * within a cell, so a raster can sit on the antimeridian's far side.
 * @param {any} base
 * @param {{ k: number, x: number, y: number }} v
 * @param {[number, number]} size
 * @param {[number, number, number, number]} bounds
 * @param {[number, number]} grid  [cols, rows] of the raster
 * @param {{ step?: number }} [options]
 * @returns {Int32Array}
 */
export function lookup(base, v, [w, h], [west, south, east, north], [cols, rows], { step = 8 } = {}) {
  const nodesX = Math.ceil(w / step) + 1, nodesY = Math.ceil(h / step) + 1;
  const lon = new Float64Array(nodesX * nodesY), lat = new Float64Array(nodesX * nodesY);
  for (let j = 0; j < nodesY; j++) {
    for (let i = 0; i < nodesX; i++) {
      const at = base.invert([(i * step - v.x) / v.k, (j * step - v.y) / v.k]);
      const n = j * nodesX + i;
      [lon[n], lat[n]] = at && Number.isFinite(at[0]) && Number.isFinite(at[1]) ? at : [NaN, NaN];
    }
  }

  const out = new Int32Array(w * h).fill(-1);
  const [spanX, spanY] = [east - west, north - south];
  for (let cj = 0; cj < nodesY - 1; cj++) {
    for (let ci = 0; ci < nodesX - 1; ci++) {
      const a = cj * nodesX + ci, b = a + 1, c = a + nodesX, d = c + 1;
      if (Number.isNaN(lon[a] + lon[b] + lon[c] + lon[d])) continue;
      // Longitudes within 180 degrees of the first corner: a cell on the antimeridian interpolates across it.
      const unwrap = (x) => x - 360 * Math.round((x - lon[a]) / 360);
      const [la, lb, lc, ld] = [lon[a], unwrap(lon[b]), unwrap(lon[c]), unwrap(lon[d])];
      for (let py = cj * step; py < Math.min(h, (cj + 1) * step); py++) {
        const fy = (py + 0.5 - cj * step) / step;
        for (let px = ci * step; px < Math.min(w, (ci + 1) * step); px++) {
          const fx = (px + 0.5 - ci * step) / step;
          const top = 1 - fx, left = 1 - fy;
          const lonHere = la * top * left + lb * fx * left + lc * top * fy + ld * fx * fy;
          const latHere = lat[a] * top * left + lat[b] * fx * left + lat[c] * top * fy + lat[d] * fx * fy;
          const along = (((lonHere - west) % 360) + 360) % 360; // degrees east of the raster's west edge
          const down = north - latHere;
          if (along > spanX || down < 0 || down > spanY) continue;
          const col = Math.min(cols - 1, Math.floor((along / spanX) * cols)), row = Math.min(rows - 1, Math.floor((down / spanY) * rows));
          out[py * w + px] = row * cols + col;
        }
      }
    }
  }
  return out;
}

// --- rasters ---------------------------------------------------------------------------------------------------------

/**
 * One PNG as grids: `levels` (the grey of each pixel) and `data` (1 where the pixel has data, 0 where its alpha is below
 * 128), row-major from the top-left pixel. The level under a pixel with no data is 0. `name` is the image's deck path,
 * for messages; `first` is the first frame's `[cols, rows]`, or null when this is the first frame.
 */
async function decodeImage(url, name, first) {
  const response = await fetch(url).catch(() => null);
  if (!response?.ok) throw new Error(`${name}: not found`);
  const bitmap = await createImageBitmap(await response.blob(), DECODE).catch((cause) => {
    throw new Error(`${name}: not a PNG the browser can read`, { cause });
  });
  const [cols, rows] = [bitmap.width, bitmap.height];
  const fail = (message) => {
    bitmap.close();
    throw new Error(message);
  };
  if (cols * rows > MAX_RASTER_PIXELS) fail(pngProblems({ width: cols, height: rows, bitDepth: 8, colorType: 4, chunks: [] }, name)[0]);
  if (first && (cols !== first[0] || rows !== first[1])) fail(`${name}: ${cols}×${rows} does not match the first frame (${first[0]}×${first[1]})`);

  const canvas = scratchCanvas(cols, rows);
  const g = canvas.getContext("2d", { willReadFrequently: true });
  g.drawImage(bitmap, 0, 0);
  bitmap.close();
  const rgba = g.getImageData(0, 0, cols, rows).data;
  const levels = new Uint8Array(cols * rows), data = new Uint8Array(cols * rows);
  for (let i = 0; i < levels.length; i++) {
    if (rgba[i * 4 + 3] < 128) continue;
    data[i] = 1;
    levels[i] = rgba[i * 4];
  }
  return { cols, rows, levels, data };
}

/** The decoders of the rasters `loadRaster` made: `rasterGaps` reads frames through them without touching a raster's own cache. */
const decoders = new WeakMap();

async function readRaster(path, ctx) {
  if (typeof ctx.assetUrl !== "function") throw new Error("loadRaster needs ctx.assetUrl");
  const json = await ctx.data(path);
  const problems = rasterProblems(json, path);
  if (problems.length > 0) throw new Error(problems[0]);

  // An image is named relative to the JSON's folder, and must be a path inside the deck by the rules of `ctx.data`.
  const folder = path.slice(0, path.lastIndexOf("/") + 1);
  const lapse = Array.isArray(json.frames);
  const frames = (lapse ? json.frames : [{ src: json.src }]).map((entry) => {
    try {
      ctx.assetUrl(entry.src);
    } catch (error) {
      // the loader's own rule, as ctx.data states it ("data path must be relative to the deck root: ..."); nothing else is rewritten
      if (!/^data path /.test(error?.message ?? "")) throw error;
      throw new Error(`${path}: '${entry.src}' is not a path inside the deck`);
    }
    return { label: lapse ? String(entry.label) : "", numbers: { ...entry.numbers }, src: folder + entry.src };
  });
  const urls = frames.map(({ src }) => ctx.assetUrl(src));

  const firstGrid = await decodeImage(urls[0], frames[0].src, null);
  const size = [firstGrid.cols, firstGrid.rows];
  // A time-lapse is decoded a few frames at a time: refuse one too big to show before any other frame is read.
  const [tooBig] = lapse ? lapsePixelProblems(frames.length, size, path) : [];
  if (tooBig) throw new Error(tooBig);
  const decode = (i) => decodeImage(urls[i], frames[i].src, size);

  // Decoded frames, least recently used first. An entry is its promise at once, and its grid when that settles.
  const cache = new Map([[0, { promise: Promise.resolve(firstGrid), grid: firstGrid }]]);
  const touch = (i, entry) => {
    cache.delete(i);
    cache.set(i, entry);
    while (cache.size > MAX_DECODED_FRAMES) cache.delete(cache.keys().next().value);
  };
  const raster = {
    path,
    bounds: [...json.bounds],
    value: json.value,
    frames,
    size,
    grid(i) {
      if (!Number.isInteger(i) || i < 0 || i >= frames.length) return Promise.reject(new Error(`${path}: there is no frame ${i}`));
      const entry = cache.get(i) ?? {};
      entry.promise ??= decode(i).then(
        (grid) => (entry.grid = grid),
        (error) => {
          if (cache.get(i) === entry) cache.delete(i);
          throw error;
        },
      );
      touch(i, entry);
      return entry.promise;
    },
    decoded(i) {
      const entry = cache.get(i);
      if (!entry?.grid) return undefined;
      touch(i, entry);
      return entry.grid;
    },
  };
  decoders.set(raster, decode);
  return raster;
}

const rasters = new WeakMap();

/**
 * Reads the raster file at `path` (a deck path to the JSON of the raster format) and its first image. `ctx` is a
 * component's `ctx`: `ctx.data` reads the JSON, `ctx.assetUrl` locates the images. Each image's `src` is read relative
 * to the JSON's folder (`data/a/b.json` with `f/1.png` names `data/a/f/1.png`) and must be a path inside the deck, by the
 * rules of `ctx.data`. The raster is cached per `ctx.data` and path (a failure is not kept, so a fixed file loads on a
 * retry), so every layer and element that names the file shares one.
 *
 * Resolves to `{ path, bounds, value, frames, size, grid, decoded }`:
 * - `bounds`, `value`: as in the file; `frames`: `[{ label, numbers, src }]`, one per frame in file order (`src` is the
 *   image's deck path; a file with a single `src` has one frame, labelled "" and with no numbers); `size`: `[cols, rows]`;
 * - `grid(i)`: a Promise of frame `i` as `{ cols, rows, levels, data }`, two `Uint8Array`s of `cols * rows`, row-major
 *   from the north-west pixel. `levels` is the grey of the pixel (the exact byte: no colour conversion happens) and
 *   `data` is 1 where its alpha is at least 128, else 0. The level under a pixel with no data is 0.
 * - `decoded(i)`: the grid of frame `i` if it is decoded now, else `undefined` (a synchronous read, for painters).
 *
 * Frames are decoded when asked for, and a raster keeps at most 12 decoded frames, the least recently used going first
 * (reading one with `grid` or `decoded` uses it). The first frame is decoded here, since it gives `size`.
 *
 * Throws `loadRaster needs ctx.assetUrl` when `ctx` has none, and otherwise, with the file's path first: the problems `rasterProblems` finds in the JSON, `data/f/1.png: not found`,
 * `data/wide.json: '../x.png' is not a path inside the deck`, `data/f/9.png: 2400×1800 is more than 2,000×2,000
 * pixels`, `data/big.json: 101 frames of 1000×1000 is 101 million pixels, more than 100 million; use fewer or smaller
 * frames` (once the first frame gives the size, before another is decoded), and, from `grid(i)`, `data/f/2.png: 9×6
 * does not match the first frame (8×6)`.
 * @param {string} path
 * @param {{ data: (path: string) => Promise<any>, assetUrl: (path: string) => string }} ctx
 * @returns {Promise<{ path: string, bounds: number[], value: any, frames: { label: string, numbers: Record<string, number>, src: string }[], size: [number, number], grid(i: number): Promise<{ cols: number, rows: number, levels: Uint8Array, data: Uint8Array }>, decoded(i: number): { cols: number, rows: number, levels: Uint8Array, data: Uint8Array } | undefined }>}
 */
export function loadRaster(path, ctx) {
  if (!rasters.has(ctx.data)) rasters.set(ctx.data, new Map());
  const byPath = rasters.get(ctx.data);
  if (!byPath.has(path)) {
    const loading = readRaster(path, ctx);
    byPath.set(path, loading);
    loading.catch(() => {
      if (byPath.get(path) === loading) byPath.delete(path);
    });
  }
  return byPath.get(path);
}

/**
 * The colours of a raster's 256 levels as RGBA bytes, `level * 4` on: `colorOf(value, level)` is called with each level's
 * data value (`levelValue`: a number, or the class name) and returns a CSS colour, or null for a level with no colour. A
 * level past the end of a class list, and a level `colorOf` gives null, are transparent.
 * @param {{ value: any }} raster
 * @param {(value: number | string, level: number) => string | null | undefined} colorOf
 * @returns {Uint8ClampedArray} 1,024 bytes
 * @throws {Error} `lut: 'x' is not a colour` for a colour d3 cannot read
 */
export function lut(raster, colorOf) {
  const table = new Uint8ClampedArray(256 * 4);
  for (let level = 0; level < 256; level++) {
    const value = levelValue(level, raster.value);
    const css = value === null ? null : colorOf(value, level);
    if (css === null || css === undefined) continue;
    const colour = d3.rgb(css);
    if (Number.isNaN(colour.r + colour.g + colour.b + colour.opacity)) throw new Error(`lut: '${css}' is not a colour`);
    table.set([colour.r, colour.g, colour.b, colour.opacity * 255], level * 4);
  }
  return table;
}

/** The polygons of `features` as ring lists, whatever each feature's geometry type. */
const polygonsOf = (features) => features.flatMap(({ geometry }) => (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates));

const landGrids = new WeakMap();

/**
 * The land cells of a raster: a `Uint8Array` of `cols * rows` (row-major from the north-west cell) holding 1 where the
 * cell's centre is on land and 0 elsewhere. This is the one definition of land for a raster: a raster made by marking
 * the cells whose centres are on land has data on every land cell, and a cell whose centre is in the sea is not land
 * even where it covers some. The land is `features` (from `boundaries`), read as plain lon/lat (the raster is a grid of
 * degrees, so edges are straight), a polygon at a time with the even-odd rule so holes stay holes, and the polygons
 * joined. Only `bounds` and `size` of `raster` are read. The grid is cached per `features` array and raster geometry,
 * so keep passing the array `boundaries` returned; it is shared, and must not be changed.
 * @param {{ bounds: number[], size: [number, number] }} raster
 * @param {{ geometry: { type: string, coordinates: number[][][] | number[][][][] } }[]} features
 * @returns {Uint8Array}
 */
export function landCells({ bounds, size }, features) {
  const key = `${bounds}|${size}`;
  if (!landGrids.has(features)) landGrids.set(features, new Map());
  const cached = landGrids.get(features);
  if (cached.has(key)) return cached.get(key);

  const [west, south, east, north] = bounds, [cols, rows] = size;
  const [dx, dy] = [(east - west) / cols, (north - south) / rows];
  const cells = new Uint8Array(cols * rows);
  for (const rings of polygonsOf(features)) {
    // where each row's centre line crosses the polygon's edges: a cell is inside between a crossing and the next
    const crossings = new Map();
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const [[x1, y1], [x2, y2]] = [ring[i], ring[(i + 1) % ring.length]];
        if (y1 === y2) continue;
        const [low, high] = y1 < y2 ? [y1, y2] : [y2, y1];
        const first = Math.max(0, Math.floor((north - high) / dy - 0.5) - 1), last = Math.min(rows - 1, Math.ceil((north - low) / dy - 0.5) + 1);
        for (let row = first; row <= last; row++) {
          const lat = north - (row + 0.5) * dy;
          if (y1 > lat === y2 > lat) continue;
          if (!crossings.has(row)) crossings.set(row, []);
          crossings.get(row).push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));
        }
      }
    }
    for (const [row, xs] of crossings) {
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        // the cells whose centres are in [xs[k], xs[k + 1])
        const from = Math.max(0, Math.ceil((xs[k] - west) / dx - 0.5)), to = Math.min(cols, Math.ceil((xs[k + 1] - west) / dx - 0.5));
        cells.fill(1, row * cols + from, row * cols + Math.max(from, to));
      }
    }
  }
  cached.set(key, cells);
  return cells;
}

/**
 * Whether some land has no data in `raster`: true when a land cell (see `landCells`) has no data in one of `frames`
 * (frame indexes; every frame by default), or when any of the land lies outside the raster's bounds. These are the
 * places a painter hatches, so a legend shows its "No data" row exactly when there is hatch to explain. A coastal cell
 * whose centre is in the sea is not a gap. Frames are decoded one at a time, apart from the raster's cache, and the
 * search stops at the first gap; it costs a pass over each frame it looks at, so a caller keeps the answer. A map
 * that shows a few frames of a long time-lapse names them, rather than decoding them all.
 * @param {{ path: string, bounds: number[], size: [number, number], frames: any[] }} raster a raster from `loadRaster`
 * @param {{ geometry: { type: string, coordinates: number[][][] | number[][][][] } }[]} features from `boundaries`
 * @param {{ frames?: number[] }} [options]
 * @returns {Promise<boolean>}
 * @throws {Error} `data/a.json: there is no frame 9` for an index outside the frames
 */
export async function rasterGaps(raster, features, { frames } = {}) {
  const decode = decoders.get(raster);
  if (!decode) throw new Error("rasterGaps: the raster must be one `loadRaster` returned");
  const indexes = frames ?? raster.frames.map((_, i) => i);
  for (const i of indexes) {
    if (!Number.isInteger(i) || i < 0 || i >= raster.frames.length) throw new Error(`${raster.path}: there is no frame ${i}`);
  }
  if (features.length === 0) return false;
  const [west, south, east, north] = raster.bounds;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const rings of polygonsOf(features)) {
    for (const ring of rings) {
      for (const [lon, lat] of ring) {
        x0 = Math.min(x0, lon); x1 = Math.max(x1, lon);
        y0 = Math.min(y0, lat); y1 = Math.max(y1, lat);
      }
    }
  }
  if (x0 < west - BOUNDS_SLACK || x1 > east + BOUNDS_SLACK || y0 < south - BOUNDS_SLACK || y1 > north + BOUNDS_SLACK) return true;

  const land = landCells(raster, features);
  for (const i of indexes) {
    const { data } = await decode(i);
    for (let p = 0; p < data.length; p++) if (land[p] && !data[p]) return true;
  }
  return false;
}

/**
 * The geography building blocks a component gets as `ctx.map`: one frozen object, the same for every component and child.
 * Its public names are the contract (docs/reference/component-contract.md).
 */
export const mapKit = Object.freeze({
  boundaries, projection, view, applyView, lookup, loadRaster, lut, landCells, rasterGaps, paintAreas, paintBorders, paintRaster, paintPoints, insetFrame, scaleBar,
});
