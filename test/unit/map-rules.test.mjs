// core/map-rules.js: the pure map rules `validate` and the map component share (no DOM; one import, a pure leaf).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  levelValue,
  frameRun,
  runMs,
  joinValues,
  rasterProblems,
  pngProblems,
  mapProblems,
  mapRunProblems,
  firstPhase,
  stepRun,
  niceLength,
  lapsePixelProblems,
  MAX_LAPSE_PIXELS,
} from "#engine/core/map-rules.js";

test("levelValue: linear, log and classes at 0, 1, 254, 255", () => {
  const linear = { scale: "linear", min: 10, max: 265 };
  assert.equal(levelValue(0, linear), 10);
  assert.equal(levelValue(1, linear), 11);
  assert.equal(levelValue(254, linear), 264);
  assert.equal(levelValue(255, linear), 265);
  const log = { scale: "log", min: 1, max: 1000 };
  assert.equal(levelValue(0, log), 1);
  assert.ok(Math.abs(levelValue(255, log) - 1000) < 1e-9);
  assert.ok(Math.abs(levelValue(1, log) - 1000 ** (1 / 255)) < 1e-12);
  assert.ok(Math.abs(levelValue(254, log) - 1000 ** (254 / 255)) < 1e-9);
  const classes = { classes: ["Forest", "Cropland", "Urban"] };
  assert.equal(levelValue(0, classes), "Forest");
  assert.equal(levelValue(2, classes), "Urban");
  assert.equal(levelValue(1, classes), "Cropland");
  assert.equal(levelValue(254, classes), null);
  assert.equal(levelValue(255, classes), null);
});

const years = ["2000", "2001", "2002", "2003", "2004", "2005"];

test("frameRun: forward", () => {
  assert.deepEqual(frameRun(years, "2001", "2004"), [1, 2, 3, 4]);
  assert.deepEqual(frameRun(years, "2002", "2002"), [2]);
});

test("frameRun: backward", () => {
  assert.deepEqual(frameRun(years, "2004", "2001"), [4, 3, 2, 1]);
});

test("frameRun: numbers and strings compare as text", () => {
  assert.deepEqual(frameRun(years, 2001, "2003"), [1, 2, 3]);
  assert.deepEqual(frameRun([2000, 2001, 2002], "2000", 2002), [0, 1, 2]);
});

test("frameRun: unknown label message", () => {
  assert.throws(() => frameRun(years, "2001", "1999"), {
    message: "frame '1999' not found (frames: 2000, 2001, 2002, 2003, 2004, …)",
  });
  assert.throws(() => frameRun(["a", "b"], "z", "a"), { message: "frame 'z' not found (frames: a, b)" });
});

test("runMs: frames moved times pace", () => {
  assert.equal(runMs(years, "2000", "2005", 700), 3500);
  assert.equal(runMs(years, "2004", "2001", 100), 300);
  assert.equal(runMs(years, "2002", "2002", 700), 0);
});

test("joinValues: keys compare as text", () => {
  const rows = [{ id: "A", v: "5" }, { id: "01", v: "7" }, { id: " B ", v: 2 }];
  const joined = joinValues(rows, "id", "v", ["A", "B", "1"]);
  assert.deepEqual([...joined.values], [["A", 5], ["B", 2]]);
  assert.deepEqual(joined.unknown, ["01"]);
  assert.deepEqual(joined.duplicates, []);
});

test("joinValues: duplicates and empty values", () => {
  const rows = [
    { id: "A", v: 1 },
    { id: "A", v: 9 },
    { id: "B", v: "" },
    { id: "C", v: "  " },
    { id: "D", v: "n/a" },
    { id: "E", v: Infinity },
    { id: "F", v: "0" },
  ];
  const joined = joinValues(rows, "id", "v", ["A", "B", "C", "D", "E", "F", "G"]);
  assert.deepEqual(joined.duplicates, ["A"]);
  assert.equal(joined.values.get("A"), 1, "the first row of a key is kept");
  for (const id of ["B", "C", "D", "E"]) assert.equal(joined.values.get(id), null, id);
  assert.equal(joined.values.get("F"), 0, "0 is a value");
  assert.equal(joined.values.has("G"), false, "a region without a row is absent");
  assert.deepEqual(joined.unknown, []);
});

const raster = () => ({
  bounds: [-12.5, 3.2, 8.9, 15],
  value: { scale: "linear", min: 0, max: 800 },
  src: "density.png",
});

test("rasterProblems: a valid raster and a valid time-lapse are clean", () => {
  assert.deepEqual(rasterProblems(raster(), "r.json"), []);
  const { src, ...rest } = raster();
  const lapse = { ...rest, frames: [{ src: "a.png", label: "2000", numbers: { n: 1 } }, { src: "b.png", label: 2001, numbers: { n: 2 } }] };
  assert.deepEqual(rasterProblems(lapse, "r.json"), []);
  assert.deepEqual(rasterProblems({ ...raster(), value: { classes: ["Only"] } }, "r.json"), []);
  assert.deepEqual(rasterProblems({ ...raster(), value: { scale: "log", min: 0.5, max: 50 } }, "r.json"), []);
});

test("rasterProblems: each rule", () => {
  const bad = (patch, remove) => {
    const json = { ...raster(), ...patch };
    for (const k of remove ?? []) delete json[k];
    return rasterProblems(json, "data/r.json");
  };
  const only = (found, re) => {
    assert.equal(found.length, 1, found.join("; "));
    assert.match(found[0], re);
    assert.ok(found[0].startsWith("data/r.json: "), found[0]);
  };
  only(rasterProblems(null, "data/r.json"), /JSON object/);
  only(bad({ bounds: undefined }), /`bounds`/);
  only(bad({ bounds: [1, 2, 3] }), /four numbers/);
  only(bad({ bounds: [1, 2, 3, "4"] }), /four numbers/);
  only(bad({ bounds: [1, 2, NaN, 4] }), /four numbers/);
  only(bad({ bounds: [5, 0, 1, 10] }), /west.*less than.*east/);
  only(bad({ bounds: [0, 10, 5, 10] }), /south.*less than.*north/);
  only(bad({ bounds: [-181, 0, 5, 10] }), /±180/);
  only(bad({ bounds: [0, 0, 5, 91] }), /±90/);
  only(bad({ value: undefined }), /`value`/);
  only(bad({ value: { scale: "linear", min: 0, max: 5, classes: ["a"] } }), /exactly one/);
  only(bad({ value: { scale: "sqrt", min: 0, max: 5 } }), /linear.*log/);
  only(bad({ value: { scale: "linear", min: "0", max: 5 } }), /`min` and `max`/);
  only(bad({ value: { scale: "log", min: 0, max: 5 } }), /log.*greater than 0/);
  only(bad({ value: { scale: "linear", min: 5, max: 5 } }), /`min`.*less than `max`/);
  only(bad({ value: { classes: [] } }), /1 to 256/);
  only(bad({ value: { classes: Array.from({ length: 257 }, (_, i) => `c${i}`) } }), /1 to 256/);
  only(bad({ value: { classes: ["a", "a"] } }), /unique/);
  only(bad({ value: { classes: ["a", ""] } }), /non-empty/);
  only(bad({}, ["src"]), /`src` or `frames`/);
  only(bad({ frames: [{ src: "a.png", label: "1" }] }), /both `src` and `frames`/);
  const { src, ...noSrc } = raster();
  const lapse = (frames) => rasterProblems({ ...noSrc, frames }, "data/r.json");
  only(lapse([]), /at least one frame/);
  only(lapse([{ src: "a.png", label: "x" }, { src: "b.png", label: "x" }]), /label.*unique/);
  only(lapse([{ src: "a.png", label: "" }]), /label/);
  only(lapse([{ src: "a.png" }]), /label/);
  only(lapse([{ label: "a" }]), /`src`/);
  only(lapse([{ src: "a.png", label: "a", numbers: { n: 1 } }, { src: "b.png", label: "b", numbers: { m: 1 } }]), /same `numbers` keys/);
  only(lapse([{ src: "a.png", label: "a", numbers: { n: 1 } }, { src: "b.png", label: "b" }]), /same `numbers` keys/);
  // a frame's numbers are numbers: a panel never shows "NaN"
  for (const bad of ["1.2M", null, "", true, { n: 1 }]) {
    const found = lapse([{ src: "a.png", label: "a", numbers: { n: 1 } }, { src: "b.png", label: "b", numbers: { n: bad } }]);
    assert.deepEqual(found, [`data/r.json: frame 2 \`numbers\` 'n' must be a finite number, not ${JSON.stringify(bad)}`], JSON.stringify(bad));
  }
  assert.deepEqual(lapse([{ src: "a.png", label: "a", numbers: { n: -1.5e9 } }, { src: "b.png", label: "b", numbers: { n: 0 } }]), []);
});

test("rasterProblems: more than 200 frames", () => {
  const { src, ...rest } = raster();
  const frames = (n) => Array.from({ length: n }, (_, i) => ({ src: `f${i}.png`, label: String(i) }));
  assert.deepEqual(rasterProblems({ ...rest, frames: frames(200) }, "r.json"), []);
  assert.deepEqual(rasterProblems({ ...rest, frames: frames(250) }, "data/r.json"), ["data/r.json: 250 frames is more than 200"]);
});

const info = (patch) => ({ width: 100, height: 80, bitDepth: 8, colorType: 4, chunks: ["IHDR", "IDAT", "IEND"], ...patch });

test("pngProblems: depth, colour type and colour chunks", () => {
  assert.deepEqual(pngProblems(info(), "f.png"), []);
  assert.deepEqual(pngProblems(info({ colorType: 0 }), "f.png"), []);
  assert.deepEqual(pngProblems(info({ bitDepth: 16 }), "f.png"), ["f.png: bit depth 16 is not 8"]);
  assert.deepEqual(pngProblems(info({ colorType: 2 }), "f.png"), ["f.png: color type 2 is not 0 (grey) or 4 (grey with alpha)"]);
  const chunks = ["IHDR", "gAMA", "sRGB", "IDAT", "IEND"];
  assert.deepEqual(pngProblems(info({ chunks }), "f.png"), [
    "f.png: has a gAMA chunk; color chunks are not allowed",
    "f.png: has a sRGB chunk; color chunks are not allowed",
  ]);
});

test("pngProblems: a tRNS chunk, which would make one grey level transparent", () => {
  assert.deepEqual(pngProblems(info({ colorType: 0, chunks: ["IHDR", "tRNS", "IDAT", "IEND"] }), "d/f.png"), [
    "d/f.png: has a tRNS chunk (one grey level made transparent); write no data as an alpha channel instead",
  ]);
});

test("pngProblems: an interlaced PNG, which the decoder refuses", () => {
  assert.deepEqual(pngProblems(info({ interlace: 0 }), "f.png"), []);
  const [problem, ...rest] = pngProblems(info({ interlace: 1 }), "d/f.png");
  assert.deepEqual(rest, []);
  assert.match(problem, /^d\/f\.png: is interlaced; only non-interlaced PNGs are read/);
});

test("pngProblems: more than 2,000×2,000 pixels", () => {
  assert.deepEqual(pngProblems(info({ width: 2000, height: 2000 }), "f.png"), []);
  assert.deepEqual(pngProblems(info({ width: 2400, height: 1800 }), "data/f.png"), ["data/f.png: 2400×1800 is more than 2,000×2,000 pixels"]);
  assert.deepEqual(pngProblems(info({ width: 3000, height: 1000 }), "f.png"), [], "the limit is the pixel count, not each side");
});

test("lapsePixelProblems: a time-lapse holds at most 100 million pixels, every frame together", () => {
  assert.equal(MAX_LAPSE_PIXELS, 100_000_000);
  assert.deepEqual(lapsePixelProblems(25, [2000, 2000], "d/a.json"), [], "exactly 100 million is within it");
  assert.deepEqual(lapsePixelProblems(26, [2000, 2000], "d/a.json"), [
    "d/a.json: 26 frames of 2000×2000 is 104 million pixels, more than 100 million; use fewer or smaller frames",
  ]);
  assert.deepEqual(lapsePixelProblems(200, [2000, 2000], "d/a.json"), [
    "d/a.json: 200 frames of 2000×2000 is 800 million pixels, more than 100 million; use fewer or smaller frames",
  ]);
  // a total just past the limit never reads as the limit itself
  assert.match(lapsePixelProblems(1, [10_000_001, 10], "d/a.json")[0], /is 100\.1 million pixels, more than 100 million/);
  assert.deepEqual(lapsePixelProblems(200, [8, 6], "d/a.json"), []);
});

test("niceLength", () => {
  assert.equal(niceLength(1), 1);
  assert.equal(niceLength(1.9), 1);
  assert.equal(niceLength(2), 2);
  assert.equal(niceLength(4.99), 2);
  assert.equal(niceLength(5), 5);
  assert.equal(niceLength(9.99), 5);
  assert.equal(niceLength(10), 10);
  assert.equal(niceLength(730), 500);
  assert.equal(niceLength(1999), 1000);
  assert.equal(niceLength(0.03), 0.02);
  assert.equal(niceLength(0.001), 0.001);
  assert.equal(niceLength(0), 0);
  assert.equal(niceLength(-3), 0);
  assert.equal(niceLength(NaN), 0);
});

/** One time-lapse file with the given labels, and the files table `mapProblems` reads. */
const lapseFile = (labels, numbers = (i) => ({ n: i })) => ({
  json: {
    bounds: [0, 0, 10, 10],
    value: { scale: "linear", min: 0, max: 1 },
    frames: labels.map((label, i) => ({ src: `f/${label}.png`, label, numbers: numbers(i) })),
  },
  pngs: Object.fromEntries(labels.map((label) => [`f/${label}.png`, info()])),
});
const stillFile = () => ({ json: raster(), pngs: { "density.png": info() } });
const labels30 = Array.from({ length: 30 }, (_, i) => String(2000 + i));
const files = {
  "d/a.json": lapseFile(labels30),
  "d/b.json": lapseFile(labels30, (i) => ({ other: i })),
  "d/still.json": stillFile(),
};
const layers = { a: { raster: "d/a.json" }, b: { raster: "d/b.json" }, s: { raster: "d/still.json" } };

const rules = (found) => found.map((p) => `${p.rule}:${p.severity}`);

test("mapProblems: a clean map says nothing", () => {
  const props = { boundaries: "d/b.geojson", layers, shown: ["a", "s"], frame: 2010, pace: 500, numbers: [{ key: "n" }, { key: "other" }] };
  assert.deepEqual(mapProblems(props, files), []);
  assert.deepEqual(mapProblems({ boundaries: "d/b.geojson" }, files), []);
  assert.deepEqual(mapProblems(null, files), []);
});

test("mapProblems: map-layer for a shown id that is not a layer", () => {
  const found = mapProblems({ layers, shown: ["a", "nope"] }, files);
  assert.deepEqual(rules(found), ["map-layer:error"]);
  const [item] = found;
  assert.match(item.message, /'nope'/);
  assert.match(item.message, /a, b, s/);
  assert.ok(item.limit && item.fix);
  assert.deepEqual(rules(mapProblems({ shown: ["x"] }, files)), ["map-layer:error"], "no layers at all");
});

test("mapProblems: map-frame for an unknown frame label", () => {
  const found = mapProblems({ layers, shown: ["a"], frame: "1999" }, files);
  assert.deepEqual(rules(found), ["map-frame:error"]);
  assert.match(found[0].message, /1999/);
  assert.match(found[0].message, /2000, 2001, 2002, 2003, 2004, …/);
});

test("mapProblems: map-frame for label lists that differ between time-lapse layers", () => {
  const other = { ...files, "d/b.json": lapseFile(labels30.slice(1), (i) => ({ other: i })) };
  const found = mapProblems({ layers, shown: ["a", "b"] }, other);
  assert.deepEqual(rules(found), ["map-frame:error"]);
  assert.match(found[0].message, /'a'/);
  assert.match(found[0].message, /'b'/);
});

test("mapProblems: map-frame for a numbers key found in two time-lapse layers", () => {
  const twice = { ...files, "d/b.json": lapseFile(labels30, (i) => ({ n: i, other: i })) };
  const found = mapProblems({ layers, shown: ["a"], numbers: [{ key: "n" }, { key: "other" }] }, twice);
  assert.deepEqual(rules(found), ["map-frame:error"]);
  assert.match(found[0].message, /'n'/);
  assert.match(found[0].message, /'a'/);
  assert.match(found[0].message, /'b'/);
});

test("mapProblems: map-prop-unused for frame or pace without a time-lapse layer", () => {
  const only = { s: { raster: "d/still.json" }, v: { areas: "d/v.csv" } };
  const found = mapProblems({ layers: only, shown: ["s"], frame: "2001", pace: 300 }, files);
  assert.deepEqual(rules(found), ["map-prop-unused:warning", "map-prop-unused:warning"]);
  assert.match(found[0].message, /`frame`/);
  assert.match(found[1].message, /`pace`/);
  assert.match(found[0].message, /time-lapse/);
  assert.deepEqual(mapProblems({ shown: [] , frame: "x"}, files).map((p) => p.rule), ["map-prop-unused"]);
});

test("mapProblems: map-prop-unused for a numbers key no frame has", () => {
  const found = mapProblems({ layers, shown: ["a"], numbers: [{ key: "n" }, { key: "people" }] }, files);
  assert.deepEqual(rules(found), ["map-prop-unused:warning"]);
  assert.match(found[0].message, /'people'/);
});

test("mapProblems: map-raster for sidecars, PNGs and frame sizes", () => {
  const broken = {
    "d/bad.json": { json: { ...raster(), bounds: [1, 2, 3] }, pngs: { "density.png": info() } },
    "d/png.json": { json: raster(), pngs: { "density.png": info({ bitDepth: 16 }) } },
    "d/gone.json": { json: raster(), pngs: {} },
    "d/size.json": {
      json: { ...raster(), src: undefined, frames: [{ src: "a.png", label: "a" }, { src: "b.png", label: "b" }] },
      pngs: { "a.png": info(), "b.png": info({ width: 90 }) },
    },
  };
  const at = (id) => mapProblems({ layers: { [id]: { raster: `d/${id}.json` } }, shown: [id] }, broken);
  const bad = at("bad");
  assert.deepEqual(rules(bad), ["map-raster:error"]);
  assert.match(bad[0].message, /^d\/bad\.json: /);
  const png = at("png");
  assert.deepEqual(rules(png), ["map-raster:error"]);
  assert.match(png[0].message, /^d\/density\.png: bit depth 16/);
  const gone = at("gone");
  assert.deepEqual(rules(gone), ["map-raster:error"]);
  assert.match(gone[0].message, /d\/density\.png/);
  const unreadable = mapProblems({ layers: { u: { raster: "d/u.json" } }, shown: ["u"] }, { "d/u.json": { json: raster(), pngs: { "density.png": { error: "not a PNG" } } } });
  assert.deepEqual(rules(unreadable), ["map-raster:error"]);
  assert.equal(unreadable[0].message, "d/density.png: not a PNG");
  const size = at("size");
  assert.deepEqual(rules(size), ["map-raster:error"]);
  assert.match(size[0].message, /d\/b\.png: 90×80 is not 100×80/);
});

test("mapProblems: map-raster for a time-lapse over 100 million pixels, every frame together", () => {
  const sized = (n, width, height) => {
    const labels = labels30.slice(0, n);
    return { json: lapseFile(labels).json, pngs: Object.fromEntries(labels.map((label) => [`f/${label}.png`, info({ width, height })])) };
  };
  const at = (file) => mapProblems({ layers: { big: { raster: "d/big.json" } }, shown: ["big"] }, { "d/big.json": file });
  assert.deepEqual(at(sized(25, 2000, 2000)), [], "25 frames of 2000×2000 is exactly 100 million");
  const over = at(sized(30, 2000, 2000));
  assert.deepEqual(rules(over), ["map-raster:error"]);
  assert.equal(over[0].message, "d/big.json: 30 frames of 2000×2000 is 120 million pixels, more than 100 million; use fewer or smaller frames");
  assert.match(over[0].limit, /100 million pixels/);
});

const timing = { duration: 400 };

test("mapRunProblems: phase 1 plus run against the ceiling", () => {
  const prev = { layers, shown: ["a"], frame: "2000", view: null };
  // 18 frame moves at 700 ms and a flight of 2 x 400 ms: 13,400 ms.
  assert.deepEqual(mapRunProblems(prev, { ...prev, frame: "2018", view: "north" }, files, timing, 20_000), []);
  // 29 moves at 700 ms, nothing else changing: 20,300 ms.
  const found = mapRunProblems(prev, { ...prev, frame: "2029" }, files, timing, 20_000);
  assert.deepEqual(rules(found), ["map-run:error"]);
  assert.match(found[0].message, /29 frame moves/);
  assert.match(found[0].message, /700/);
  assert.match(found[0].message, /0 ms/);
  assert.match(found[0].message, /20300/);
  assert.match(found[0].limit, /20000/);
  assert.ok(found[0].fix);
});

test("mapRunProblems: the first phase follows what else changes", () => {
  const prev = { layers, shown: ["a"], frame: "2000", pace: 1000 };
  // 19 moves at 1000 ms = 19,000 ms; a flight adds 800 ms and breaks the ceiling, a plain fade (400) does not.
  const flight = mapRunProblems(prev, { ...prev, frame: "2019", view: "north" }, files, timing, 19_500);
  assert.deepEqual(rules(flight), ["map-run:error"]);
  assert.match(flight[0].message, /800 ms/);
  const withInset = { ...prev, inset: { view: "south" } };
  const inset = mapRunProblems(withInset, { ...withInset, frame: "2019", inset: { view: "north" } }, files, timing, 19_500);
  assert.deepEqual(rules(inset), ["map-run:error"], "inset.view is a flight too");
  assert.deepEqual(mapRunProblems(prev, { ...prev, frame: "2019", inset: { view: "north" } }, files, timing, 19_500), [], "an inset that comes in fades (400 ms)");
  assert.deepEqual(mapRunProblems(prev, { ...prev, frame: "2019", highlight: ["x"] }, files, timing, 19_500), [], "a fade lasts 400 ms");
  assert.deepEqual(mapRunProblems(prev, { ...prev, frame: "2019" }, files, timing, 19_000), [], "nothing else: no first phase");
  // the step's own transition duration replaces the token
  const slow = mapRunProblems(prev, { ...prev, frame: "2019", highlight: ["x"] }, files, { duration: 400, transition: 900 }, 19_500);
  assert.match(slow[0].message, /900 ms/);
});

test("mapRunProblems: pace defaults to 700, an unset frame is the first label, a missing run is nothing", () => {
  const prev = { layers, shown: ["a"] };
  assert.deepEqual(mapRunProblems(prev, { ...prev, frame: "2000" }, files, timing, 20_000), [], "frame did not change");
  assert.deepEqual(mapRunProblems(prev, { ...prev }, files, timing, 20_000), []);
  const found = mapRunProblems(prev, { ...prev, frame: "2029" }, files, timing, 20_000);
  assert.match(found[0].message, /700/);
  assert.deepEqual(mapRunProblems({ ...prev, frame: "2005" }, { ...prev, frame: 2005 }, files, timing, 20_000), [], "numbers and text are one label");
  assert.deepEqual(mapRunProblems({ ...prev, frame: "1" }, { ...prev, frame: "1999" }, files, timing, 100), [], "an unknown label is map-frame's to report");
  const backward = mapRunProblems({ ...prev, frame: "2029" }, { ...prev, frame: "2000" }, files, timing, 20_000);
  assert.deepEqual(rules(backward), ["map-run:error"]);
  assert.deepEqual(mapRunProblems(prev, { ...prev, frame: "2005" }, { "d/a.json": files["d/still.json"] }, timing, 20_000), [], "no time-lapse layer, no run");
  assert.deepEqual(mapRunProblems(prev, { ...prev, shown: ["b"], frame: "2029" }, files, timing, 20_000).length, 1, "the first time-lapse layer in `layers` gives the labels, whichever is shown");
  assert.deepEqual(mapRunProblems({ ...prev, frame: "2029" }, { ...prev, shown: [], frame: "2000" }, files, timing, 100), [], "hiding the time-lapse while rewinding: no run");
  assert.deepEqual(mapRunProblems({ ...prev, frame: "2029", pace: 2000 }, { ...prev, frame: "2000", legend: false, pace: 100 }, files, timing, 2_900), [], "pace and legend are not a first phase (29 × 100 ms)");
});

test("firstPhase: what the map animates before a run", () => {
  const base = { layers, shown: ["a"], frame: "2000", view: null, legend: "bottom-left" };
  const phase = (change, from = base) => firstPhase(from, { ...from, ...change });
  assert.equal(phase({ frame: "2010" }), 0, "the frame alone is the run");
  assert.equal(phase({ pace: 300, legend: false }), 0, "drawn at once");
  assert.equal(phase({ layers: { ...layers, b: { raster: "d/b.json", midpoint: 1 } } }), 0, "a hidden layer's definition");
  assert.equal(phase({ view: "north" }), 2, "a flight");
  assert.equal(phase({ view: "north" }, { ...base, view: "north" }), 0, "the same view");
  const inset = { ...base, inset: { view: "south" } };
  assert.equal(phase({ inset: { view: "north" } }, inset), 2, "the inset flies");
  assert.equal(phase({ inset: { view: "south", at: "top-left", scale: false } }, inset), 0, "its corner and scale bar are drawn at once");
  assert.equal(phase({ inset: { view: "north" } }), 1, "an inset that comes in fades");
  assert.equal(phase({ inset: null }, inset), 1, "and one that goes");
  for (const change of [{ highlight: ["x"] }, { labels: ["x"] }, { numbers: [{ key: "n", format: "," }] }, { shown: ["a", "s"] }, { layers: { ...layers, a: { raster: "d/a.json", midpoint: 1 } } }]) {
    assert.equal(phase(change), 1, JSON.stringify(change));
  }
  assert.equal(phase({ shown: ["a"] }, { ...base, shown: ["a"] }), 0, "the same layers shown");
  assert.equal(phase({ shown: ["s", "a"] }, { ...base, shown: ["a", "s"] }), 0, "in another order");
});

test("stepRun: a run needs the same labels on both steps, a time-lapse shown, another frame and the same geometry", () => {
  const labels = ["2000", "2001", "2002", "2003"];
  const prevProps = { layers, shown: ["a"], frame: "2000" };
  const step = (change, more = {}) => stepRun({ prevLabels: labels, nextLabels: labels, nextShowsLapse: true, prevProps, nextProps: { ...prevProps, ...change }, ...more });
  assert.deepEqual(step({ frame: "2003" }), { run: [0, 1, 2, 3], moves: 3, factor: 0 });
  assert.deepEqual(step({ frame: 2003, view: "north" }), { run: [0, 1, 2, 3], moves: 3, factor: 2 }, "labels compare as text");
  assert.deepEqual(stepRun({ prevLabels: labels, nextLabels: labels, nextShowsLapse: true, prevProps: { ...prevProps, frame: "2002" }, nextProps: { ...prevProps, frame: undefined } }), { run: [2, 1, 0], moves: 2, factor: 0 }, "backward, an unset frame the first");
  assert.equal(step({ frame: "2000" }), null, "the same frame");
  assert.equal(step({ frame: "2003", shown: [] }, { nextShowsLapse: false }), null, "hiding the time-lapse while the frame changes");
  assert.equal(step({ frame: "2003" }, { prevLabels: null }), null, "no time-lapse before");
  assert.equal(step({ frame: "2003" }, { nextLabels: null }), null, "none now");
  assert.equal(step({ frame: "2002" }, { nextLabels: ["1999", "2000", "2001", "2002"] }), null, "other labels: the layer crossfades instead");
  for (const key of ["boundaries", "id", "name", "projection"]) assert.equal(step({ frame: "2003", [key]: "other" }), null, `a new ${key} redraws at once`);
  assert.throws(() => step({ frame: "1999" }), /frame '1999' not found/);
});

test("map-rules.js imports only ./chart-layout.js", async () => {
  const source = await readFile(new URL("../../engine/core/map-rules.js", import.meta.url), "utf8");
  const imports = source.split("\n").filter((line) => /^\s*import\b/.test(line));
  assert.equal(imports.length, 1);
  assert.match(imports[0], /from "\.\/chart-layout\.js";$/);
  assert.doesNotMatch(source, /\bimport\s*\(/);
});

test("mapProblems: map-classes for breaks that are not in increasing order, in any layer", () => {
  const found = mapProblems({ layers: { ...layers, bad: { areas: "d/v.csv", key: "code", value: "v", classes: [10, 5, 20] }, twice: { raster: "d/none.json", classes: [1, 1] } }, shown: ["a"] }, files);
  assert.deepEqual(rules(found.filter((p) => p.rule === "map-classes")), ["map-classes:error", "map-classes:error"]);
  const [bad, twice] = found.filter((p) => p.rule === "map-classes");
  assert.equal(bad.message, "layer 'bad' has `classes` 10, 5, 20, which are not in increasing order");
  assert.equal(bad.fix, "write `classes: [5, 10, 20]`");
  assert.match(twice.message, /layer 'twice' has `classes` 1, 1/);
  assert.equal(twice.fix, "write `classes: [1]`");
  for (const p of [bad, twice]) assert.ok(p.limit, "a limit");
  const fine = { ok: { areas: "d/v.csv", key: "code", value: "v", classes: [5, 10, 20] }, one: { areas: "d/v.csv", key: "code", value: "v", classes: [3] }, odd: { areas: "d/v.csv", classes: "x" } };
  assert.deepEqual(mapProblems({ layers: fine }, {}).filter((p) => p.rule === "map-classes"), [], "ascending breaks, one break, and what the schema rejects");
});
