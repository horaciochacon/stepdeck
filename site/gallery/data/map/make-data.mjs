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
import { centroid, country, csvText, discPatch, extent, geojsonText, jsonText, rng, timelapse, valueFiles } from "./fictional.mjs";

const out = process.argv.includes("--out") ? join(process.argv[process.argv.indexOf("--out") + 1], "gallery") : dirname(fileURLToPath(import.meta.url));
const write = (name, content) => {
  mkdirSync(dirname(join(out, name)), { recursive: true });
  writeFileSync(join(out, name), content);
};

const { regions, land } = country({ seed: 18, cells: 80 });
const bounds = extent(regions);
const mainland = regions.features.filter((f) => f.properties.code.startsWith("I") === false);
write("regions.geojson", geojsonText(regions));

// --- values and rasters ----------------------------------------------------------------------------------------

const COLS = 160;
const ROWS = 120;
const files = valueFiles({
  regions,
  land,
  bounds,
  cols: COLS,
  rows: ROWS,
  bumps: { density: 9, cover: 14, wells: 8 },
  missing: [5], // the sixth region has no rate
  wellsAbove: 0.72,
  patch: discPatch({ bounds, cols: COLS, rows: ROWS, at: centroid(mainland[9]), radius: 7 }), // land with no data
});
for (const [name, content] of Object.entries(files)) write(name, content);

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
