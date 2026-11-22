// Generates the map fixtures' synthetic data: a small fictional country, its values and rasters, and the odd shapes the
// map code must survive. Deterministic (seeded): run `node test/fixtures/decks/map/data/make-data.mjs` to rebuild every
// file it writes, or pass `--out DIR` to write them under DIR/map and DIR/map-broken instead (the tests compare the two).
//
// Clean files, in this folder (the `map` deck validates clean with them):
//   regions.geojson, rates.csv, change.csv, sites.csv   a country of 7 regions and 2 islands, and values for them
//   density, cover, wells                               small rasters (.json + .png), as in the gallery
//   half.json + half.png                                20×30 px over the west half of the land: the east half is outside its bounds
//   log.json                                            density.png read on a log scale, 1 to 1,000
//   years.json + years/                                 12 frames, 2010 to 2021, 16×12 px, each with `numbers: { people }`
//   years19.json + years19/                             19 frames, 8×6 px: 18 moves, 12.6 s at the default pace
//   gaps.json + gaps/                                   2 frames, 16×12 px, one level: `whole` has data on every land
//                                                       cell, `holed` lacks it on a block of land in the middle
//   square-cw.geojson, square-ccw.geojson               one square region, both windings
//   antimeridian.geojson                                one region on both sides of 180°, split at the meridian
//   tiny.geojson                                        one region about 0.01° across
//   levels.json + levels.png                            4×1 px, grey + alpha: levels 0, 1, 254, 255, the second transparent
// Broken files, in ../../map-broken/data (kept apart, as the points fixtures are, so `map` stays clean):
//   regions.geojson, rates.csv                          copies of the clean ones
//   sites.csv, sites-ok.csv                             the clean sites with the fourth row's lon blank, and whole
//   twice.csv                                           rates.csv with the first region's row given twice
//   years30.json + years30/                             30 frames, 8×6 px: 29 moves, 20.3 s, longer than a run may be
//   wide.json + wide.png                                2001×2000 px at one level: over the pixel limit
//   mismatch.json + mismatch/                           two frames; the second is a different size
//   mask.json + mask.png                                a one-class mask, for a layer that names a colour that is not a theme colour
//
// Rasters follow the raster format: rows run north to south, columns west to east (see fictional.mjs).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "../../../../../cli/png.js";
import {
  centroid, country, csvText, extent, field, geojsonText, jsonText, landGrid, levelImage, timelapse, valueFiles,
} from "../../../../../site/gallery/data/map/fictional.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : null;
const clean = root ? join(root, "map") : here;
const broken = root ? join(root, "map-broken") : join(here, "../../map-broken/data");
const writeTo = (dir) => (name, content) => {
  mkdirSync(dirname(join(dir, name)), { recursive: true });
  writeFileSync(join(dir, name), content);
};
const write = writeTo(clean);
const writeBroken = writeTo(broken);

const { regions, land } = country({ seed: 3, cells: 38 });
const bounds = extent(regions);
const mainland = regions.features.filter((f) => !f.properties.code.startsWith("I"));

const regionsText = geojsonText(regions);
write("regions.geojson", regionsText);
writeBroken("regions.geojson", regionsText);

// --- values and rasters ----------------------------------------------------------------------------------------

const COLS = 40;
const ROWS = 30;
const files = valueFiles({
  regions,
  land,
  bounds,
  cols: COLS,
  rows: ROWS,
  bumps: { density: 6, cover: 8, wells: 6 },
  missing: [2], // the third region has no rate
  wellsAbove: 0.7,
  patch: (col, row) => col > 18 && col < 23 && row > 13 && row < 17, // land with no data
});
for (const [name, content] of Object.entries(files)) write(name, content);
writeBroken("rates.csv", files["rates.csv"]);
// the same rates with the first region's row given twice
const rateLines = files["rates.csv"].trimEnd().split("\n");
writeBroken("twice.csv", `${[...rateLines, rateLines[1]].join("\n")}\n`);

// half: the cells of density's west half, on a surface of their own; the land east of -14.5° is outside its bounds
{
  const west = [bounds[0], bounds[1], -14.5, bounds[3]];
  const [cols, rows] = [COLS / 2, ROWS];
  const surface = field({ seed: 21, bounds: west, cols, rows, bumps: 6 });
  const valid = landGrid({ land, bounds: west, cols, rows });
  write("half.png", encodePng(levelImage(cols, rows, Array.from(surface, (v) => Math.round(255 * v)), valid)));
  write("half.json", jsonText({ bounds: west, value: { scale: "linear", min: 0, max: 800, unit: "people per km²" }, src: "half.png" }));
}
// the density image on a log scale
write("log.json", jsonText({ bounds, value: { scale: "log", min: 1, max: 1000, unit: "people per km²" }, src: "density.png" }));

const SITE_COLUMNS = ["id", "lon", "lat", "beds", "kind"];
const sites = mainland.map((f, i) => {
  const [lon, lat] = centroid(f);
  return { id: `S${i + 1}`, lon: lon.toFixed(3), lat: lat.toFixed(3), beds: 10 * (i + 1), kind: ["clinic", "hospital"][i % 2] };
});
write("sites.csv", csvText(SITE_COLUMNS, sites));
// the same sites, one with no lon (row 4), and the same sites whole, for a slide whose only fault is elsewhere
writeBroken("sites.csv", csvText(SITE_COLUMNS, sites.map((site, i) => (i === 3 ? { ...site, lon: "" } : site))));
writeBroken("sites-ok.csv", csvText(SITE_COLUMNS, sites));

// levels: the four levels the decoding formulas must get exactly right, the second pixel with no data
write("levels.png", encodePng({ width: 4, height: 1, channels: 2, data: Uint8Array.of(0, 255, 1, 0, 254, 255, 255, 255) }));
write("levels.json", jsonText({ bounds: [-16, -28, -12, -27], value: { scale: "linear", min: 0, max: 255 }, src: "levels.png" }));

// --- time-lapses -----------------------------------------------------------------------------------------------

const years = (from, count, cols, rows, folder, writer, file) => {
  const labels = Array.from({ length: count }, (_, i) => String(from + i));
  const frames = timelapse({ seed: 61, bounds, land, cols, rows, labels, max: 800 });
  for (const f of frames) writer(`${folder}/${f.label}.png`, encodePng(f.image));
  writer(file, jsonText({
    bounds,
    value: { scale: "linear", min: 0, max: 800, unit: "people per km²" },
    frames: frames.map((f) => ({ src: `${folder}/${f.label}.png`, label: f.label, numbers: { people: f.people } })),
  }));
};
years(2010, 12, 16, 12, "years", write, "years.json");
years(2000, 19, 8, 6, "years19", write, "years19.json");
years(1990, 30, 8, 6, "years30", writeBroken, "years30.json");

// gaps: two frames at one level, data on every land cell in `whole` and a block of land cells without it in `holed`
{
  const [cols, rows] = [16, 12];
  const valid = landGrid({ land, bounds, cols, rows });
  const holed = valid.map((v, i) => (v && i % cols >= 6 && i % cols < 10 && Math.floor(i / cols) >= 4 && Math.floor(i / cols) < 8 ? 0 : v));
  const level = new Uint8Array(cols * rows).fill(160);
  write("gaps/whole.png", encodePng(levelImage(cols, rows, level, valid)));
  write("gaps/holed.png", encodePng(levelImage(cols, rows, level, holed)));
  write("gaps.json", jsonText({
    bounds,
    value: { scale: "linear", min: 0, max: 800, unit: "people per km²" },
    frames: [{ src: "gaps/whole.png", label: "whole" }, { src: "gaps/holed.png", label: "holed" }],
  }));
}

// --- broken rasters --------------------------------------------------------------------------------------------

// over the pixel limit, and small: one level everywhere compresses to a few KB
const WIDE = { width: 2001, height: 2000 };
writeBroken("wide.png", encodePng({ ...WIDE, channels: 1, data: new Uint8Array(WIDE.width * WIDE.height).fill(128) }));
writeBroken("wide.json", jsonText({ bounds, value: { scale: "linear", min: 0, max: 100 }, src: "wide.png" }));

// two frames of different sizes
const flat = (width, height, level) => encodePng({ width, height, channels: 1, data: new Uint8Array(width * height).fill(level) });
writeBroken("mismatch/2000.png", flat(8, 6, 100));
writeBroken("mismatch/2001.png", flat(8, 7, 140));
writeBroken("mismatch.json", jsonText({
  bounds,
  value: { scale: "linear", min: 0, max: 100 },
  frames: [{ src: "mismatch/2000.png", label: "2000" }, { src: "mismatch/2001.png", label: "2001" }],
}));

// a mask of one pixel
writeBroken("mask.png", encodePng({ width: 2, height: 1, channels: 2, data: Uint8Array.of(0, 255, 0, 0) }));
writeBroken("mask.json", jsonText({ bounds, value: { classes: ["Marked"] }, src: "mask.png" }));

// --- odd geography ---------------------------------------------------------------------------------------------

const square = [[-14, -28], [-14, -26], [-12, -26], [-12, -28], [-14, -28]]; // clockwise
const one = (code, name, type, coordinates) => ({ type: "FeatureCollection", features: [{ type: "Feature", properties: { code, name }, geometry: { type, coordinates } }] });
write("square-cw.geojson", geojsonText(one("Q1", "Square", "Polygon", [square])));
write("square-ccw.geojson", geojsonText(one("Q1", "Square", "Polygon", [[...square].reverse()])));
// split at the meridian, as GDAL and `sf` write a region that crosses it; counter-clockwise
write("antimeridian.geojson", geojsonText(one("M1", "Dateline", "MultiPolygon", [
  [[[176, -18], [180, -18], [180, -16], [176, -16], [176, -18]]],
  [[[-180, -18], [-178, -18], [-178, -16], [-180, -16], [-180, -18]]],
])));
write("tiny.geojson", geojsonText(one("T1", "Speck", "Polygon", [[[-14, -27], [-13.99, -27], [-13.99, -26.99], [-14, -26.99], [-14, -27]]])));
