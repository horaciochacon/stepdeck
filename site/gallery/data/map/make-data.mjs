// Generates the gallery's synthetic map data: a fictional country, its values and its rasters. Deterministic (seeded):
// run `node site/gallery/data/map/make-data.mjs` to rebuild every file it writes next to itself, or pass
// `--out DIR` to write them under DIR/gallery instead (the tests compare the two).
//
// regions.geojson        16 regions and 2 islands, counter-clockwise; properties `code` and `name`
// rates.csv              code,rate   one rate per region, with one region left out
// change.csv             code,change a change per region, from -8 to +8
// density.json + .png    linear 0 to 800 people per km², 160×120, with a transparent patch on land (no data)
// cover.json + .png      three classes
// wells.json + .png      a mask: one class
// sites.csv              id,lon,lat,beds,kind   12 sites, each inside a region
// years.json + years/    12 frames, 2010 to 2021, each with `numbers: { people }`
//
// Rasters follow the raster format: rows run north to south, columns west to east (see fictional.mjs).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "../../../../cli/png.js";
import { centroid, country, csvText, extent, field, geojsonText, jsonText, landGrid, levelImage, rng, timelapse } from "./fictional.mjs";

const out = process.argv.includes("--out") ? join(process.argv[process.argv.indexOf("--out") + 1], "gallery") : dirname(fileURLToPath(import.meta.url));
const write = (name, content) => {
  mkdirSync(dirname(join(out, name)), { recursive: true });
  writeFileSync(join(out, name), content);
};

const { regions, land } = country({ seed: 18, cells: 80 });
const bounds = extent(regions);
const mainland = regions.features.filter((f) => f.properties.code.startsWith("I") === false);
write("regions.geojson", geojsonText(regions));

// --- values for the regions ------------------------------------------------------------------------------------

const COLS = 160;
const ROWS = 120;
const surface = field({ seed: 21, bounds, cols: COLS, rows: ROWS, bumps: 9 });
const at = (feature) => {
  const [lon, lat] = centroid(feature);
  const col = Math.min(COLS - 1, Math.floor(((lon - bounds[0]) / (bounds[2] - bounds[0])) * COLS));
  const row = Math.min(ROWS - 1, Math.floor(((bounds[3] - lat) / (bounds[3] - bounds[1])) * ROWS));
  return surface[row * COLS + col];
};
const values = regions.features.map((f) => ({ code: f.properties.code, level: at(f) }));
const MISSING = 5; // the sixth region has no rate
write("rates.csv", csvText(["code", "rate"], values.filter((_, i) => i !== MISSING).map((v) => ({ code: v.code, rate: (2 + 17 * v.level).toFixed(1) }))));
const low = Math.min(...values.map((v) => v.level));
const high = Math.max(...values.map((v) => v.level));
write("change.csv", csvText(["code", "change"], values.map((v) => ({ code: v.code, change: (-8 + (16 * (v.level - low)) / (high - low)).toFixed(1) }))));

// --- rasters ---------------------------------------------------------------------------------------------------

const valid = landGrid({ land, bounds, cols: COLS, rows: ROWS });
const level = (v) => Math.round(255 * v);

// density: 0 to 800, with a patch of land that has no data (a transparent disc)
const patch = centroid(mainland[9]);
const patchCol = ((patch[0] - bounds[0]) / (bounds[2] - bounds[0])) * COLS;
const patchRow = ((bounds[3] - patch[1]) / (bounds[3] - bounds[1])) * ROWS;
const density = valid.map((v, i) => (v && Math.hypot((i % COLS) + 0.5 - patchCol, Math.floor(i / COLS) + 0.5 - patchRow) > 7 ? 1 : 0));
write("density.png", encodePng(levelImage(COLS, ROWS, Array.from(surface, level), density)));
write("density.json", jsonText({ bounds, value: { scale: "linear", min: 0, max: 800, unit: "people per km²" }, src: "density.png" }));

// cover: three classes, by thresholds of a second surface
const cover = field({ seed: 31, bounds, cols: COLS, rows: ROWS, bumps: 14 });
write("cover.png", encodePng(levelImage(COLS, ROWS, Array.from(cover, (v) => (v < 0.45 ? 0 : v < 0.78 ? 1 : 2)), valid)));
write("cover.json", jsonText({ bounds, value: { classes: ["Forest", "Cropland", "Urban"] }, src: "cover.png" }));

// wells: a mask, where a third surface is high
const wells = field({ seed: 41, bounds, cols: COLS, rows: ROWS, bumps: 8 });
write("wells.png", encodePng(levelImage(COLS, ROWS, new Uint8Array(COLS * ROWS), valid.map((v, i) => (v && wells[i] > 0.72 ? 1 : 0)))));
write("wells.json", jsonText({ bounds, value: { classes: ["Near a well"] }, src: "wells.png" }));

// --- sites -----------------------------------------------------------------------------------------------------

// one site in each of twelve regions: the centroid, moved up to a third of the way toward a corner (regions are convex)
const rand = rng(51);
const KINDS = ["clinic", "hospital", "post"];
const BEDS = { clinic: [8, 40], hospital: [90, 420], post: [2, 8] };
write("sites.csv", csvText(["id", "lon", "lat", "beds", "kind"], mainland.slice(0, 12).map((f, i) => {
  const [cx, cy] = centroid(f);
  const corner = f.geometry.coordinates[0][Math.floor(rand() * (f.geometry.coordinates[0].length - 1))];
  const t = rand() / 3;
  const kind = KINDS[i % KINDS.length];
  const [lowBeds, highBeds] = BEDS[kind];
  return {
    id: `S${String(i + 1).padStart(2, "0")}`,
    lon: (cx + t * (corner[0] - cx)).toFixed(3),
    lat: (cy + t * (corner[1] - cy)).toFixed(3),
    beds: lowBeds + Math.floor(rand() * (highBeds - lowBeds + 1)),
    kind,
  };
})));

// --- time-lapse ------------------------------------------------------------------------------------------------

const labels = Array.from({ length: 12 }, (_, i) => String(2010 + i));
const frames = timelapse({ seed: 61, bounds, land, cols: 120, rows: 90, labels, max: 800 });
for (const f of frames) write(`years/${f.label}.png`, encodePng(f.image));
write("years.json", jsonText({
  bounds,
  value: { scale: "linear", min: 0, max: 800, unit: "people per km²" },
  frames: frames.map((f) => ({ src: `years/${f.label}.png`, label: f.label, numbers: { people: f.people } })),
}));
