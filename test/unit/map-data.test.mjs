// The synthetic map data: a fictional country, rasters and time-lapse frames, made by two seeded generators
// (site/gallery/data/map/make-data.mjs for the gallery, test/fixtures/decks/map/data/make-data.mjs for the fixtures, and
// test/fixtures/decks/map-kit/data/make-data.mjs for the raster files of the map-kit fixture and its broken twin).
// The repository holds no real country's data, so every map example and fixture comes from these. The committed
// files must be exactly what the generators write, and every raster must follow the raster format.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { d3 } from "#engine/core/d3.js";
import { lapsePixelProblems, pngProblems, rasterProblems } from "#engine/core/map-rules.js";
import { pngInfo, pngPixels } from "../../cli/png.js";
import { centroid, landGrid, landOf, onLand } from "../../site/gallery/data/map/fictional.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const GALLERY = join(ROOT, "site/gallery/data/map");
const FIXTURES = join(ROOT, "test/fixtures/decks/map/data");
const BROKEN = join(ROOT, "test/fixtures/decks/map-broken/data");
const KIT = join(ROOT, "test/fixtures/decks/map-kit/data");
const KIT_BROKEN = join(ROOT, "test/fixtures/decks/map-kit-broken/data");
const DIRS = [GALLERY, FIXTURES, BROKEN];

const read = (dir, file) => readFileSync(join(dir, file));
const json = (dir, file) => JSON.parse(read(dir, file).toString("utf8"));
const csv = (dir, file) => {
  const [head, ...rows] = read(dir, file).toString("utf8").trimEnd().split("\n");
  const keys = head.split(",");
  return rows.map((row) => Object.fromEntries(row.split(",").map((cell, i) => [keys[i], cell])));
};
const pixels = (dir, file) => pngPixels(read(dir, file));

/** Every file under `dir` that a generator writes (not the generators themselves), as paths relative to `dir`. */
function outputs(dir) {
  const found = [];
  const visit = (at) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (!entry.name.endsWith(".mjs")) found.push(relative(dir, path));
    }
  };
  visit(dir);
  return found.sort();
}

/** Whether `actualDir` holds what `expectedDir` holds, file by file; `names` (default: every file of both) the files compared. */
function sameFiles(expectedDir, actualDir, names = outputs(expectedDir)) {
  assert.deepEqual(outputs(actualDir), names, `${actualDir} has the files of ${expectedDir}`);
  for (const name of names) {
    const expected = read(expectedDir, name);
    const actual = read(actualDir, name);
    if (name.endsWith(".png")) {
      // zlib's output can differ between Node versions: compare what the PNG says and holds, never its bytes
      assert.deepEqual(pngInfo(actual), pngInfo(expected), `${name} header`);
      assert.deepEqual(pngPixels(actual), pngPixels(expected), `${name} pixels`);
    } else {
      assert.ok(actual.equals(expected), `${name} is not what the generator writes`);
    }
  }
}

test("generators are deterministic and match the committed files", () => {
  const out = mkdtempSync(join(tmpdir(), "stepdeck-map-data-"));
  try {
    for (const script of [join(GALLERY, "make-data.mjs"), join(FIXTURES, "make-data.mjs")]) {
      execFileSync(process.execPath, [script, "--out", out], { stdio: "pipe" });
    }
    sameFiles(GALLERY, join(out, "gallery"));
    sameFiles(FIXTURES, join(out, "map"));
    sameFiles(BROKEN, join(out, "map-broken"));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("the map-kit generator writes the committed raster files, and they follow the raster format except the oversize one", () => {
  const out = mkdtempSync(join(tmpdir(), "stepdeck-map-kit-data-"));
  try {
    execFileSync(process.execPath, [join(KIT, "make-data.mjs"), "--out", out], { stdio: "pipe" });
    const written = outputs(join(out, "map-kit"));
    assert.deepEqual(written, outputs(KIT).filter((name) => !["regions.geojson", "square-cw.geojson"].includes(name)), "the same files");
    sameFiles(KIT, join(out, "map-kit"), written);
    sameFiles(KIT_BROKEN, join(out, "map-kit-broken"));
    assert.ok(read(KIT_BROKEN, "square-cw.geojson").equals(read(KIT, "square-cw.geojson")), "the broken folder keeps a copy of the region");
    for (const [dir, names] of [[KIT, written], [KIT_BROKEN, outputs(KIT_BROKEN)]]) {
      for (const name of names.filter((file) => file.endsWith(".png"))) {
        const problems = pngProblems(pngInfo(read(dir, name)), name);
        assert.deepEqual(problems, dir === KIT_BROKEN ? ["wide.png: 2001×2000 is more than 2,000×2,000 pixels"] : [], name);
      }
      for (const name of names.filter((file) => file.endsWith(".json"))) assert.deepEqual(rasterProblems(json(dir, name), name), [], name);
    }
    assert.ok(outputs(KIT).every((name) => !name.startsWith("wide.")), "the map-kit deck has no file it refuses");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

const TWO_PI = 2 * Math.PI;
const galleryLand = () => landOf(json(GALLERY, "regions.geojson"));
const featuresOf = (dir, file) => json(dir, file).features;

/** [west, south, east, north] of a feature's coordinates as written (d3.geoBounds would read counter-clockwise rings as the sphere's other side). */
function planarBounds(feature) {
  const { type, coordinates } = feature.geometry;
  const points = type === "Polygon" ? coordinates.flat(1) : coordinates.flat(2);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** The feature with every ring reversed: the winding d3 reads as the region itself. */
const rewound = (feature) => {
  const flip = (rings) => rings.map((ring) => [...ring].reverse());
  const { type, coordinates } = feature.geometry;
  return { ...feature, geometry: { type, coordinates: type === "Polygon" ? flip(coordinates) : coordinates.map(flip) } };
};

test("gallery regions are counter-clockwise", () => {
  for (const feature of featuresOf(GALLERY, "regions.geojson")) {
    assert.ok(d3.geoArea(feature) > TWO_PI, `${feature.properties.code} is counter-clockwise`);
  }
});

test("fixture regions are counter-clockwise too, and the square comes in both windings", () => {
  for (const feature of featuresOf(FIXTURES, "regions.geojson")) assert.ok(d3.geoArea(feature) > TWO_PI, feature.properties.code);
  const [ccw] = featuresOf(FIXTURES, "square-ccw.geojson");
  const [cw] = featuresOf(FIXTURES, "square-cw.geojson");
  assert.equal(featuresOf(FIXTURES, "square-ccw.geojson").length, 1);
  assert.ok(d3.geoArea(ccw) > TWO_PI, "RFC 7946 winding");
  assert.ok(d3.geoArea(cw) < 0.01, "d3 winding: the small side");
  assert.deepEqual(cw.geometry.coordinates[0], [...ccw.geometry.coordinates[0]].reverse(), "the same ring, reversed");
});

test("every map data file is under 200 KB", () => {
  for (const dir of [...DIRS, KIT]) {
    for (const name of outputs(dir)) assert.ok(statSync(join(dir, name)).size < 200 * 1024, `${name} is under 200 KB`);
  }
});

test("fixture levels.png has the levels 0, 1, 254, 255", () => {
  const info = pngInfo(read(FIXTURES, "levels.png"));
  assert.equal(info.width, 4);
  assert.equal(info.height, 1);
  assert.equal(info.colorType, 4);
  const { channels, data } = pixels(FIXTURES, "levels.png");
  assert.equal(channels, 2);
  assert.deepEqual(Array.from(data.filter((_, i) => i % 2 === 0)), [0, 1, 254, 255]);
  assert.deepEqual(Array.from(data.filter((_, i) => i % 2 === 1)), [255, 0, 255, 255]);
  const sidecar = json(FIXTURES, "levels.json");
  assert.deepEqual(sidecar.value, { scale: "linear", min: 0, max: 255 });
  assert.deepEqual(rasterProblems(sidecar, "levels.json"), []);
});

// --- the fictional country ----------------------------------------------------------------------------------

test("gallery geography: 16 regions and 2 islands, each with a short code and a generic name", () => {
  const features = featuresOf(GALLERY, "regions.geojson");
  assert.equal(features.length, 18);
  const codes = features.map((f) => f.properties.code);
  const names = features.map((f) => f.properties.name);
  assert.equal(new Set(codes).size, 18, "codes are unique");
  assert.equal(new Set(names).size, 18, "names are unique");
  for (const code of codes) assert.match(code, /^[A-Z]\d$/);
  assert.ok(names.includes("North") && names.includes("Eastport"));
  const islands = features.filter((f) => f.geometry.coordinates[0].length === 4);
  assert.equal(islands.length, 2, "two triangles");
  for (const island of islands) {
    const [w, s, e, n] = planarBounds(island);
    assert.ok(e - w < 1 && n - s < 1, "tiny");
  }
});

test("a region's name agrees with its code: a compass word names the code's side, N1 is North, an E region is Eastport", () => {
  const SIDES = { North: "N", East: "E", South: "S", West: "W" };
  for (const dir of [GALLERY, FIXTURES]) {
    const features = featuresOf(dir, "regions.geojson");
    for (const { properties: { code, name } } of features) {
      for (const [word, side] of Object.entries(SIDES)) {
        if (name.startsWith(word)) assert.equal(code[0], side, `${name} is ${code}`);
      }
    }
    assert.equal(features.find((f) => f.properties.code === "N1").properties.name, "North");
    assert.equal(features.find((f) => f.properties.name === "Eastport").properties.code[0], "E");
  }
});

test("the islands sit offshore: clear of every other region's box", () => {
  for (const dir of [GALLERY, FIXTURES]) {
    const features = featuresOf(dir, "regions.geojson").map((f) => ({ code: f.properties.code, box: planarBounds(f) }));
    for (const island of features.filter((f) => f.code.startsWith("I"))) {
      for (const other of features.filter((f) => !f.code.startsWith("I"))) {
        const gap = Math.max(other.box[0] - island.box[2], island.box[0] - other.box[2], other.box[1] - island.box[3], island.box[1] - other.box[3]);
        assert.ok(gap > 0.5, `${island.code} is ${gap.toFixed(2)}° from ${other.code}`);
      }
    }
  }
});

test("the land is the regions together: every region's centroid is inside it", () => {
  const land = galleryLand();
  assert.equal(land.type, "Feature");
  assert.equal(land.geometry.type, "MultiPolygon");
  for (const f of featuresOf(GALLERY, "regions.geojson")) assert.ok(onLand(land, ...centroid(f)), f.properties.code);
});

test("rates.csv leaves out one region, and change.csv spans -8 to +8 with every region", () => {
  for (const dir of [GALLERY, FIXTURES]) {
    const codes = featuresOf(dir, "regions.geojson").map((f) => f.properties.code);
    const rates = csv(dir, "rates.csv");
    assert.deepEqual(Object.keys(rates[0]), ["code", "rate"]);
    assert.equal(rates.length, codes.length - 1, "one region has no row");
    for (const row of rates) {
      assert.ok(codes.includes(row.code));
      assert.ok(Number.isFinite(Number(row.rate)) && row.rate !== "");
    }
    const change = csv(dir, "change.csv");
    assert.deepEqual(change.map((r) => r.code), codes);
    const values = change.map((r) => Number(r.change));
    assert.equal(Math.min(...values), -8);
    assert.equal(Math.max(...values), 8);
  }
  const broken = csv(BROKEN, "rates.csv");
  assert.ok(read(BROKEN, "rates.csv").equals(read(FIXTURES, "rates.csv")), "the broken folder keeps a copy");
  assert.ok(read(BROKEN, "regions.geojson").equals(read(FIXTURES, "regions.geojson")));
  assert.ok(broken.length > 0);
});

test("sites.csv has 12 rows, each on land", () => {
  const rows = csv(GALLERY, "sites.csv");
  assert.deepEqual(Object.keys(rows[0]), ["id", "lon", "lat", "beds", "kind"]);
  assert.equal(rows.length, 12);
  const land = galleryLand();
  for (const r of rows) {
    assert.ok(onLand(land, Number(r.lon), Number(r.lat)), `${r.id} is on land`);
    assert.ok(Number.isInteger(Number(r.beds)) && Number(r.beds) > 0);
  }
});

// --- rasters ------------------------------------------------------------------------------------------------

/** The sidecars of a folder, as [file, json]. */
const sidecars = (dir) =>
  outputs(dir).filter((f) => f.endsWith(".json") && json(dir, f).bounds).map((f) => [f, json(dir, f)]);

/** The image paths a sidecar names, relative to the sidecar's folder (the sidecars here sit at the folder's top). */
const imagesOf = (sidecar) => (sidecar.frames ? sidecar.frames.map((f) => f.src) : [sidecar.src]);

test("every sidecar and every image follows the raster format (the broken folder's wide.png is over the limit)", () => {
  let seen = 0;
  for (const dir of DIRS) {
    for (const [file, sidecar] of sidecars(dir)) {
      assert.deepEqual(rasterProblems(sidecar, file), [], file);
      if (sidecar.frames) {
        const { width, height } = pngInfo(read(dir, sidecar.frames[0].src));
        assert.deepEqual(lapsePixelProblems(sidecar.frames.length, [width, height], file), [], `${file} is within the time-lapse pixel budget`);
      }
      for (const src of imagesOf(sidecar)) {
        seen += 1;
        const problems = pngProblems(pngInfo(read(dir, src)), src);
        if (src === "wide.png") assert.equal(problems.length, 1, "only the pixel count");
        else assert.deepEqual(problems, [], src);
      }
    }
  }
  assert.ok(seen > 60, `checked ${seen} images`);
});

test("wide.png is 2001×2000 at one level, over the pixel limit", () => {
  const sidecar = json(BROKEN, "wide.json");
  assert.equal(sidecar.src, "wide.png");
  const info = pngInfo(read(BROKEN, "wide.png"));
  assert.equal(info.width, 2001);
  assert.equal(info.height, 2000);
  assert.match(pngProblems(info, "wide.png")[0], /more than 2,000×2,000 pixels/);
  assert.ok(statSync(join(BROKEN, "wide.png")).size < 50 * 1024, "a constant image compresses to a few KB");
  const { data } = pixels(BROKEN, "wide.png");
  assert.equal(new Set(data).size, 1, "one constant level");
});

test("mismatch.json: its second frame is a different size", () => {
  const sidecar = json(BROKEN, "mismatch.json");
  const sizes = sidecar.frames.map((f) => {
    const { width, height } = pngInfo(read(BROKEN, f.src));
    return `${width}x${height}`;
  });
  assert.equal(sizes.length, 2);
  assert.notEqual(sizes[0], sizes[1]);
});

test("rasters are north to south and mark exactly the land (rows run from the northern edge)", () => {
  const land = galleryLand();
  for (const file of ["cover", "years"]) {
    const sidecar = json(GALLERY, `${file}.json`);
    const src = sidecar.frames ? sidecar.frames[0].src : sidecar.src;
    const { width, height, data } = pixels(GALLERY, src);
    const expected = landGrid({ land, bounds: sidecar.bounds, cols: width, rows: height });
    for (let i = 0; i < width * height; i++) assert.equal(data[i * 2 + 1], expected[i] ? 255 : 0, `${src} pixel ${i}`);
  }
});

test("density.png is 160×120, 0 to 800, with a transparent patch on land", () => {
  assert.deepEqual(json(GALLERY, "density.json").value, { scale: "linear", min: 0, max: 800, unit: "people per km²" });
  const { width, height } = pixels(GALLERY, "density.png");
  assert.deepEqual([width, height], [160, 120]);
});

test("density.png has land without data, in the gallery and in the fixtures", () => {
  for (const dir of [GALLERY, FIXTURES]) {
    const sidecar = json(dir, "density.json");
    const { width, height, data } = pixels(dir, "density.png");
    const land = landGrid({ land: landOf(json(dir, "regions.geojson")), bounds: sidecar.bounds, cols: width, rows: height });
    let patch = 0;
    for (let i = 0; i < width * height; i++) if (land[i] && data[i * 2 + 1] === 0) patch += 1;
    assert.ok(patch > 0, `${dir}: ${patch} land pixels without data`);
    if (dir === GALLERY) assert.ok(patch >= 20, `${patch} land pixels without data`);
  }
});

test("cover has three classes and wells is a one-class mask", () => {
  assert.equal(json(GALLERY, "cover.json").value.classes.length, 3);
  const { data } = pixels(GALLERY, "cover.png");
  const levels = new Set();
  for (let i = 0; i < data.length; i += 2) if (data[i + 1] === 255) levels.add(data[i]);
  assert.deepEqual([...levels].sort(), [0, 1, 2]);
  assert.equal(json(GALLERY, "wells.json").value.classes.length, 1);
  const wells = pixels(GALLERY, "wells.png").data;
  let on = 0;
  for (let i = 0; i < wells.length; i += 2) if (wells[i + 1] === 255) on += 1;
  assert.ok(on > 50 && on < wells.length / 4, `${on} mask pixels`);
});

// --- time-lapse -----------------------------------------------------------------------------------------------

const labelsOf = (dir, file) => json(dir, file).frames.map((f) => f.label);
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

test("time-lapse files: labels, sizes and people rising year by year", () => {
  const cases = [
    [GALLERY, "years.json", range(2010, 2021), [120, 90]],
    [FIXTURES, "years.json", range(2010, 2021), [16, 12]],
    [FIXTURES, "years19.json", range(2000, 2018), [8, 6]],
    [BROKEN, "years30.json", range(1990, 2019), [8, 6]],
  ];
  for (const [dir, file, labels, size] of cases) {
    const sidecar = json(dir, file);
    assert.deepEqual(sidecar.frames.map((f) => f.label), labels, file);
    const people = sidecar.frames.map((f) => f.numbers.people);
    for (const p of people) assert.ok(Number.isInteger(p) && p > 0, `${file} people`);
    for (let i = 1; i < people.length; i++) assert.ok(people[i] > people[i - 1], `${file}: ${labels[i]} is above ${labels[i - 1]}`);
    for (const f of sidecar.frames) {
      const { width, height } = pngInfo(read(dir, f.src));
      assert.deepEqual([width, height], size, f.src);
    }
  }
  assert.equal(labelsOf(FIXTURES, "years19.json").length - 1, 18, "18 moves");
  assert.equal(labelsOf(BROKEN, "years30.json").length - 1, 29, "29 moves");
});

// --- odd geography --------------------------------------------------------------------------------------------

test("tiny.geojson is one region about 0.01° across", () => {
  const [feature] = featuresOf(FIXTURES, "tiny.geojson");
  assert.equal(featuresOf(FIXTURES, "tiny.geojson").length, 1);
  const [w, s, e, n] = planarBounds(feature);
  assert.ok(Math.abs(e - w - 0.01) < 1e-9 && Math.abs(n - s - 0.01) < 1e-9);
});

test("antimeridian.geojson is one region on both sides of 180°", () => {
  const [feature] = featuresOf(FIXTURES, "antimeridian.geojson");
  assert.equal(featuresOf(FIXTURES, "antimeridian.geojson").length, 1);
  assert.equal(feature.geometry.type, "MultiPolygon", "split at the meridian");
  const [west, , east] = planarBounds(feature);
  assert.equal(west, -180);
  assert.equal(east, 180);
  assert.ok(d3.geoArea(feature) > TWO_PI, "counter-clockwise like the rest");
  const [boxWest, , boxEast] = d3.geoBounds(rewound(feature)).flat();
  assert.ok(boxWest > 0 && boxEast < 0, `d3 reads it as crossing the meridian: west ${boxWest}, east ${boxEast}`);
});
