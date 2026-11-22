// The geography of a map, and `mapKit`: the same pieces, frozen, which every component receives as `ctx.map`. A custom
// component can read boundaries, fit a projection, move between views and line a lon/lat raster up with the regions
// without the built-in `map`. Later pieces (rasters, painters) join the same object.
//
//   boundaries(geojson, { id, name, file })   validate a FeatureCollection of Polygons and MultiPolygons, fix the winding,
//                                             index the regions by id: { features, byId, ids, names }
//   projection(spec, features, [w, h])        the base projection: rotated to the regions' centre longitude, fitted to them
//   view(base, target, [w, h])                a zoom transform { k, x, y } over base-projected pixels
//   applyView(v, [px, py])                    a base-projected point seen through a view
//   lookup(base, v, [w, h], bounds, [cols, rows], { step })
//                                             the raster cell under every canvas pixel (or -1), from a coarse inverse grid
//
// A view is a 2D transform of the base's pixels (d3's fitExtent changes only scale and translate), so a flight between
// two views is affine: a component redraws cached paths with one `setTransform` instead of re-projecting.
//
// The lookup is for one view and one size. A component that asks for the same table often keeps its own cache (per
// element, cleared on destroy and on a size change), because the table's identity is the element's.
import { d3 } from "./d3.js";

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

/**
 * The geography building blocks a component gets as `ctx.map`: one frozen object, the same for every component and child.
 * Its public names are the contract (docs/reference/component-contract.md).
 */
export const mapKit = Object.freeze({ boundaries, projection, view, applyView, lookup });
