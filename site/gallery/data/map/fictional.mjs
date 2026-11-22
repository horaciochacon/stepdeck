// A fictional country for the map examples and test fixtures, and the seeded pieces its data is made of. Nothing here
// comes from a real place: the repository never holds a real country's talk data, so every map example is generated.
//
// The pieces, all deterministic for a given seed:
//   rng(seed)                       mulberry32: a function that returns the next number in [0, 1)
//   country({ seed, cells })        { regions, land }: a seeded Voronoi over BOX (open ocean); the cells whose site falls
//                                   inside a seeded blob are the regions, so the coast is their outer edges, and two tiny
//                                   triangle islands sit offshore. `regions` is a FeatureCollection with `code` and `name`
//                                   properties, counter-clockwise (RFC 7946, as `sf` writes it); `land` is one MultiPolygon
//                                   feature made of the same polygons (not dissolved)
//   field({ seed, bounds, cols, rows, bumps })
//                                   a smooth surface of seeded bumps, 0 to 1, as a Float64Array
//   timelapse({ ... })              rising fields as raster frames, with a people count each
//
// Raster orientation, matching the raster format: `bounds` are [west, south, east, north], the outer edges of the edge
// cells; rows run north to south (row 0 is the northern edge) and columns west to east; each pixel is sampled at its
// centre.
//
// Small helpers the two generators share: centroid, onLand, landOf, extent, landGrid, levelImage, jsonText, csvText,
// geojsonText.

import { d3 } from "../../../../engine/core/d3.js";

/** The ocean the country sits in: [west, south, east, north], in degrees. */
export const BOX = [-20, -32, -8, -22];

/** mulberry32: a small seeded generator. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (x, digits = 4) => Math.round(x * 10 ** digits) / 10 ** digits;

// --- the country -----------------------------------------------------------------------------------------------------

/** Fixed generic names; the northernmost region is "North". None is a real region. */
const NAMES = [
  "North", "Eastport", "Lowmarsh", "Highfield", "Westmere", "Southmouth", "Redcliff", "Greenvale", "Stoneford",
  "Pinewold", "Clearmere", "Ashvale", "Brightwater", "Larkmoor", "Marshby", "Ironridge", "Saltbay", "Windmere",
  "Thornfield", "Foxdale", "Heronsgate", "Cragmoor", "Sunhollow", "Mistvale",
];
const ISLAND_NAMES = ["Outer Skerry", "Little Holm"];

const signedArea = (ring) => {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return sum / 2;
};

/** The planar centroid of a closed ring. */
function ringCentroid(ring) {
  const area = signedArea(ring);
  let x = 0;
  let y = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const cross = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    x += (ring[i][0] + ring[i + 1][0]) * cross;
    y += (ring[i][1] + ring[i + 1][1]) * cross;
  }
  return [x / (6 * area), y / (6 * area)];
}

const counterClockwise = (ring) => (signedArea(ring) >= 0 ? ring : [...ring].reverse());

/**
 * The planar centroid [lon, lat] of a feature's first polygon (a point inside it for the convex regions made here).
 * @param {{ geometry: { type: string, coordinates: number[][][] | number[][][][] } }} feature
 * @returns {[number, number]}
 */
export function centroid(feature) {
  const { type, coordinates } = feature.geometry;
  return ringCentroid(type === "MultiPolygon" ? coordinates[0][0] : coordinates[0]);
}

/**
 * The country: a Voronoi of `cells` sites over BOX, relaxed twice so the cells are even. The cells whose site is inside
 * a blob (a circle-ish shape with a few seeded harmonics) are the regions. Region polygons are counter-clockwise,
 * rounded to four decimals, and carry `code` (a compass side and a number: "N1", "E2") and `name`.
 * @param {{ seed: number, cells: number }} options `cells` is the number of Voronoi cells in the whole box, sea included
 * @returns {{ regions: object, land: object }}
 */
export function country({ seed, cells }) {
  const rand = rng(seed);
  const [west, south, east, north] = BOX;
  let sites = Array.from({ length: cells }, () => [west + rand() * (east - west), south + rand() * (north - south)]);
  const voronoi = () => d3.Delaunay.from(sites).voronoi(BOX);
  for (let pass = 0; pass < 2; pass++) {
    const v = voronoi();
    sites = sites.map((site, i) => {
      const cell = v.cellPolygon(i);
      return cell ? ringCentroid(cell) : site;
    });
  }

  const harmonics = [2, 3, 4].map((k) => ({ k, amplitude: (0.06 + 0.1 * rand()) / (k - 1), phase: rand() * 2 * Math.PI }));
  const centre = [(west + east) / 2 + (rand() - 0.5), (south + north) / 2 + (rand() - 0.5)];
  const radius = 0.25 * Math.min(east - west, north - south);
  const inside = ([x, y]) => {
    const dx = (x - centre[0]) / 1.15;
    const dy = y - centre[1];
    const angle = Math.atan2(dy, dx);
    const edge = radius * (1 + harmonics.reduce((sum, h) => sum + h.amplitude * Math.cos(h.k * angle + h.phase), 0));
    return Math.hypot(dx, dy) < edge;
  };

  const v = voronoi();
  const land = [];
  sites.forEach((site, i) => {
    if (inside(site)) land.push({ ring: counterClockwise(v.cellPolygon(i).map(([x, y]) => [round(x), round(y)])) });
  });
  for (const cell of land) {
    cell.centre = ringCentroid(cell.ring);
    const angle = Math.atan2(cell.centre[1] - centre[1], cell.centre[0] - centre[0]) * (180 / Math.PI);
    cell.side = angle >= 45 && angle < 135 ? "N" : angle >= -45 && angle < 45 ? "E" : angle >= -135 && angle < -45 ? "S" : "W";
  }
  land.sort((a, b) => b.centre[1] - a.centre[1] || a.centre[0] - b.centre[0]);
  if (land.length > NAMES.length) throw new Error(`${land.length} regions: more than the name list holds`);
  const count = {};
  const features = land.map((cell, i) => {
    count[cell.side] = (count[cell.side] ?? 0) + 1;
    return polygonFeature(`${cell.side}${count[cell.side]}`, NAMES[i], [cell.ring]);
  });

  // two tiny triangles, each in a far corner of the box (the blob stays well clear of them)
  const corners = [[west + 1.6, north - 2.2], [east - 2.4, south + 1.7]];
  corners.forEach(([x, y], i) => {
    const r = 0.22 + 0.1 * rand();
    const turn = rand() * 2 * Math.PI;
    const ring = [0, 1, 2, 0].map((k) => [round(x + r * Math.cos(turn + (k * 2 * Math.PI) / 3)), round(y + r * Math.sin(turn + (k * 2 * Math.PI) / 3))]);
    features.push(polygonFeature(`I${i + 1}`, ISLAND_NAMES[i], [counterClockwise(ring)]));
  });

  const regions = { type: "FeatureCollection", features };
  return { regions, land: landOf(regions) };
}

function polygonFeature(code, name, rings) {
  return { type: "Feature", properties: { code, name }, geometry: { type: "Polygon", coordinates: rings } };
}

/**
 * One MultiPolygon feature made of every polygon in a FeatureCollection (the polygons are kept apart: shared edges stay).
 * @param {{ features: object[] }} regions
 */
export function landOf(regions) {
  const coordinates = regions.features.flatMap(({ geometry }) => (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates));
  return { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates } };
}

/** Whether the planar point is inside a ring (even-odd rule). */
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Whether the point is on the land. A planar test, which is right for this country (small, far from the antimeridian).
 * @param {{ geometry: { coordinates: number[][][][] } }} land the MultiPolygon feature of `landOf`
 */
export function onLand(land, lon, lat) {
  return land.geometry.coordinates.some(([outer]) => inRing([lon, lat], outer));
}

/** The box of the regions, widened outward to whole half degrees: [west, south, east, north]. */
export function extent(regions) {
  const xs = regions.features.flatMap((f) => f.geometry.coordinates.flat().map((p) => p[0]));
  const ys = regions.features.flatMap((f) => f.geometry.coordinates.flat().map((p) => p[1]));
  return [Math.floor(Math.min(...xs) * 2) / 2, Math.floor(Math.min(...ys) * 2) / 2, Math.ceil(Math.max(...xs) * 2) / 2, Math.ceil(Math.max(...ys) * 2) / 2];
}

// --- rasters ---------------------------------------------------------------------------------------------------------

/**
 * A smooth surface: the sum of `bumps` seeded Gaussian bumps sampled at the pixel centres, rescaled so its lowest
 * pixel is 0 and its highest 1. Rows run north to south.
 * @param {{ seed: number, bounds: number[], cols: number, rows: number, bumps: number }} options
 * @returns {Float64Array} `cols` x `rows` values
 */
export function field({ seed, bounds, cols, rows, bumps }) {
  const rand = rng(seed);
  const [west, south, east, north] = bounds;
  const size = Math.min(east - west, north - south);
  const list = Array.from({ length: bumps }, () => ({
    x: west + rand() * (east - west),
    y: south + rand() * (north - south),
    sigma: size * (0.07 + 0.15 * rand()),
    weight: 0.4 + 0.6 * rand(),
  }));
  const values = new Float64Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    const lat = north - ((row + 0.5) * (north - south)) / rows;
    for (let col = 0; col < cols; col++) {
      const lon = west + ((col + 0.5) * (east - west)) / cols;
      let sum = 0;
      for (const b of list) sum += b.weight * Math.exp(-((lon - b.x) ** 2 + (lat - b.y) ** 2) / (2 * b.sigma ** 2));
      values[row * cols + col] = sum;
    }
  }
  const low = values.reduce((m, v) => Math.min(m, v), Infinity);
  const high = values.reduce((m, v) => Math.max(m, v), -Infinity);
  return values.map((v) => (v - low) / (high - low));
}

/**
 * The land as pixels: 1 where a pixel's centre is on the land.
 * @param {{ land: object, bounds: number[], cols: number, rows: number }} options
 * @returns {Uint8Array}
 */
export function landGrid({ land, bounds, cols, rows }) {
  const [west, south, east, north] = bounds;
  const grid = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    const lat = north - ((row + 0.5) * (north - south)) / rows;
    for (let col = 0; col < cols; col++) {
      grid[row * cols + col] = onLand(land, west + ((col + 0.5) * (east - west)) / cols, lat) ? 1 : 0;
    }
  }
  return grid;
}

/**
 * A grey + alpha image for `encodePng`: `levels` (0 to 255 each) where `valid` is 1, transparent where it is 0.
 * @param {number} cols
 * @param {number} rows
 * @param {ArrayLike<number>} levels
 * @param {ArrayLike<number>} valid
 */
export function levelImage(cols, rows, levels, valid) {
  const data = new Uint8Array(cols * rows * 2);
  for (let i = 0; i < cols * rows; i++) {
    data[i * 2] = valid[i] ? levels[i] : 0;
    data[i * 2 + 1] = valid[i] ? 255 : 0;
  }
  return { width: cols, height: rows, channels: 2, data };
}

/**
 * Time-lapse frames: a density that rises year by year (a base pattern fills in, a second one grows), over the land.
 * Each frame is the image and its people count: the density each pixel's level stands for, times the pixel's area.
 * @param {{ seed: number, bounds: number[], land: object, cols: number, rows: number, labels: string[], max: number }} options
 *   `max` is the density a level of 255 stands for (the sidecar's `value.max`)
 * @returns {Array<{ label: string, image: object, people: number }>}
 */
export function timelapse({ seed, bounds, land, cols, rows, labels, max }) {
  const [west, south, east, north] = bounds;
  const valid = landGrid({ land, bounds, cols, rows });
  const base = field({ seed, bounds, cols, rows, bumps: 8 });
  const growth = field({ seed: seed + 1, bounds, cols, rows, bumps: 6 });
  const degrees = ((north - south) / rows) * ((east - west) / cols);
  const km2 = (row) => degrees * 111.32 * 110.57 * Math.cos((((north - ((row + 0.5) * (north - south)) / rows)) * Math.PI) / 180);
  return labels.map((label, k) => {
    const progress = labels.length > 1 ? k / (labels.length - 1) : 1;
    const levels = Uint8Array.from(base, (b, i) => Math.round(255 * (0.55 * b + 0.45 * progress * growth[i])));
    let people = 0;
    for (let i = 0; i < levels.length; i++) if (valid[i]) people += (levels[i] / 255) * max * km2(Math.floor(i / cols));
    return { label, image: levelImage(cols, rows, levels, valid), people: Math.round(people) };
  });
}

// --- text files ------------------------------------------------------------------------------------------------------

const scalar = (v) => v === null || typeof v !== "object";

/** JSON with two-space indents and a fixed key order (the order given), arrays of plain values on one line, `\n` ending. */
export function jsonText(value) {
  const write = (v, indent) => {
    if (scalar(v)) return JSON.stringify(v);
    const next = `${indent}  `;
    if (Array.isArray(v)) {
      if (v.every(scalar)) return `[${v.map((x) => JSON.stringify(x)).join(", ")}]`;
      return `[\n${v.map((x) => next + write(x, next)).join(",\n")}\n${indent}]`;
    }
    const entries = Object.entries(v);
    return `{\n${entries.map(([k, x]) => `${next}${JSON.stringify(k)}: ${write(x, next)}`).join(",\n")}\n${indent}}`;
  };
  return `${write(value, "")}\n`;
}

/** A GeoJSON FeatureCollection with one feature per line. */
export function geojsonText(collection) {
  return `{"type":"FeatureCollection","features":[\n${collection.features.map((f) => JSON.stringify(f)).join(",\n")}\n]}\n`;
}

/** A CSV: `header` names the columns, `rows` are objects. */
export function csvText(header, rows) {
  return `${[header.join(","), ...rows.map((row) => header.map((h) => row[h]).join(","))].join("\n")}\n`;
}
