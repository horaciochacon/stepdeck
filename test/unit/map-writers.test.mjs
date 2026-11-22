// The writer functions authors copy into their analysis code (docs/guide/maps/stepdeck-map.R and stepdeck_map.py)
// write raster files that pass `validate` and decode to exactly the grey levels the raster format defines. Each
// language runs when it is installed (Python 3; R with the png and jsonlite packages) and is skipped otherwise. The
// Python grid writer runs isolated (`python3 -I`), so it is proven to need nothing beyond the standard library.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runValidate } from "../../cli/validate.js";
import { formatProblem } from "../../cli/problems.js";
import { pngPixels } from "../../cli/png.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const WRITERS = join(repo, "docs/guide/maps");
const runs = (cmd, args) => spawnSync(cmd, args, { stdio: "ignore" }).status === 0;
const PYTHON = runs("python3", ["-I", "-c", "import json, math, struct, zlib"]);
const NUMPY = PYTHON && runs("python3", ["-c", "import numpy"]);
const R = runs("Rscript", ["-e", "quit(status = if (requireNamespace('png', quietly = TRUE) && requireNamespace('jsonlite', quietly = TRUE)) 0 else 1)"]);

const tmp = realpathSync(mkdtempSync(join(tmpdir(), "stepdeck-map-writers-")));
after(() => rmSync(tmp, { recursive: true, force: true }));

// --- the grids both languages write ------------------------------------------------------------------------------

const ROWS = 20;
const COLS = 30;
const BOUNDS = [-19, -31, -10, -23]; // the box of the map fixtures' rasters (test/fixtures/decks/map)
const cells = (fn) => Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => fn(r, c)));
const gap = (r, c) => r >= 4 && r <= 6 && c >= 10 && c <= 14; // a block of no data
const GRID = cells((r, c) => (gap(r, c) ? null : c * 10 + r)); // 0 at the north-west corner, 309 at the south-east
const FRAMES = [0, 1, 2].map((k) => cells((r, c) => (gap(r, c) ? null : c * 10 + r + 100 * k)));
const WELLS = cells((r, c) => ((r + c) % 5 === 0 ? "Near a well" : null));
const COVER = cells((r, c) => (gap(r, c) ? null : ["Forest", "Cropland", "Urban"][Math.floor(c / 10)]));
const RAIN = cells((r, c) => 2 ** ((8 * c) / 29)); // 1 to 256, a log scale
const INPUT = { bounds: BOUNDS, grid: GRID, frames: FRAMES, wells: WELLS, cover: COVER, rain: RAIN };

// The same calls in each language. Reading the input and turning JSON nulls into NA is the test's; the calls are as an
// author writes them.
const PY = `import json, sys
sys.path.insert(0, sys.argv[1])
from stepdeck_map import write_stepdeck_grid
x = json.load(open(sys.argv[2]))
out = sys.argv[3]
b = x["bounds"]
write_stepdeck_grid(out + "/density.json", x["grid"], b)
write_stepdeck_grid(out + "/years.json", x["frames"], b,
                    value={"scale": "linear", "min": 0, "max": 600, "unit": "people per km\\u00b2"},
                    labels=["2000", "2001", "2002"], numbers={"people": [1000, 1500, 2250]})
write_stepdeck_grid(out + "/wells.json", x["wells"], b, value={"classes": ["Near a well"]})
write_stepdeck_grid(out + "/cover.json", x["cover"], b, value={"classes": ["Forest", "Cropland", "Urban"]})
write_stepdeck_grid(out + "/rain.json", x["rain"], b, value={"scale": "log"})
`;
const RSCRIPT = `args <- commandArgs(trailingOnly = TRUE)
source(file.path(args[1], "stepdeck-map.R"))
x <- jsonlite::fromJSON(args[2], simplifyVector = FALSE)
out <- args[3]
num <- function(rows) do.call(rbind, lapply(rows, function(r) vapply(r, function(v) if (is.null(v)) NA_real_ else as.numeric(v), numeric(1))))
chr <- function(rows) do.call(rbind, lapply(rows, function(r) vapply(r, function(v) if (is.null(v)) NA_character_ else v, character(1))))
b <- unlist(x$bounds)
write_stepdeck_grid(num(x$grid), b, file.path(out, "density.json"))
write_stepdeck_grid(lapply(x$frames, num), b, file.path(out, "years.json"),
                    value = list(scale = "linear", min = 0, max = 600, unit = "people per km\\u00b2"),
                    labels = c("2000", "2001", "2002"), numbers = list(people = c(1000, 1500, 2250)))
write_stepdeck_grid(chr(x$wells), b, file.path(out, "wells.json"), value = list(classes = "Near a well"))
write_stepdeck_grid(chr(x$cover), b, file.path(out, "cover.json"), value = list(classes = c("Forest", "Cropland", "Urban")))
write_stepdeck_grid(num(x$rain), b, file.path(out, "rain.json"), value = list(scale = "log"))
`;
const NUMPY_PY = `import json, sys
import numpy as np
sys.path.insert(0, sys.argv[1])
from stepdeck_map import write_stepdeck_grid
x = json.load(open(sys.argv[2]))
out = sys.argv[3]
b = np.array(x["bounds"])
nan = lambda rows: np.array([[np.nan if v is None else v for v in row] for row in rows])
write_stepdeck_grid(out + "/density.json", nan(x["grid"]), b)
write_stepdeck_grid(out + "/years.json", np.stack([nan(f) for f in x["frames"]]), b,
                    value={"scale": "linear", "min": 0, "max": 600, "unit": "people per km\\u00b2"},
                    labels=["2000", "2001", "2002"], numbers={"people": np.array([1000, 1500, 2250])})
`;

// --- a deck around the files -------------------------------------------------------------------------------------

const SLIDE = `export default {
  id: "s", layout: "full-bleed", title: "Written by the writers",
  elements: [
    { id: "map", region: "main", type: "map",
      props: { boundaries: "data/regions.geojson", id: "code", name: "name", shown: ["density"],
               numbers: [{ key: "people", label: "People", format: ",.0f" }],
               layers: { density: { raster: "data/density.json", label: "Density" },
                         years: { raster: "data/years.json", label: "People per km²" },
                         wells: { raster: "data/wells.json", label: "Wells" },
                         cover: { raster: "data/cover.json", label: "Cover" },
                         rain: { raster: "data/rain.json", label: "Rain" } } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "density" },
    { id: "years", set: { map: { shown: ["years"], frame: "2002" } } },
    { id: "rest", set: { map: { shown: ["wells", "cover", "rain"] } } },
  ],
};
`;

/** A deck in `tmp/<name>` whose data/ the script `code`, run with `cmd args`, writes. Returns the deck folder. */
function deckWith(name, cmd, args, code) {
  const deck = join(tmp, name);
  mkdirSync(join(deck, "slides"), { recursive: true });
  mkdirSync(join(deck, "data"), { recursive: true });
  cpSync(join(repo, "site/gallery/data/map/regions.geojson"), join(deck, "data/regions.geojson"));
  writeFileSync(join(deck, "deck.js"), `export default { title: "Writers", lang: "en", theme: "academic-light", slides: ["s"] };\n`);
  writeFileSync(join(deck, "slides/s.js"), SLIDE);
  writeFileSync(join(tmp, "input.json"), JSON.stringify(INPUT));
  const script = join(tmp, `${name}.script`);
  writeFileSync(script, code);
  const run = spawnSync(cmd, [...args, script, WRITERS, join(tmp, "input.json"), join(deck, "data")], { encoding: "utf8" });
  assert.equal(run.status, 0, `${cmd} failed:\n${run.stdout}${run.stderr}`);
  return deck;
}

const written = new Map();
/** The deck a language's writer filled, written once. */
function deckOf(lang) {
  if (!written.has(lang)) {
    if (lang === "python") written.set(lang, deckWith("python", "python3", ["-I"], PY));
    else if (lang === "r") written.set(lang, deckWith("r", "Rscript", [], RSCRIPT));
    else written.set(lang, deckWith("numpy", "python3", [], NUMPY_PY));
  }
  return written.get(lang);
}

const read = (deck, file) => readFileSync(join(deck, "data", file));
const sidecar = (deck, file) => JSON.parse(read(deck, file).toString("utf8"));
/** The decoded image: its grey levels and whether each pixel has data (alpha 255), row by row from the north-west. */
function decoded(bytes) {
  const { width, height, channels, data } = pngPixels(bytes);
  const grey = [];
  const has = [];
  for (let i = 0; i < width * height; i++) {
    grey.push(data[i * channels]);
    has.push(channels === 1 || data[i * channels + 1] === 255);
  }
  return { width, height, grey, has };
}
const image = (deck, file) => decoded(read(deck, file));
const at = (img, r, c) => ({ level: img.grey[r * img.width + c], data: img.has[r * img.width + c] });

/** Every data cell holds its value's level, floor((v - min) / (max - min) * 255 + 0.5); every gap is clear. */
function assertLevels(img, grid, level) {
  assert.deepEqual([img.width, img.height], [COLS, ROWS]);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = grid[r][c];
      const got = at(img, r, c);
      if (v === null) assert.deepEqual(got, { level: 0, data: false }, `(${r}, ${c}) is a gap`);
      else assert.deepEqual(got, { level: level(v), data: true }, `(${r}, ${c}) = ${v}`);
    }
  }
}

const linear = (min, max) => (v) => Math.min(255, Math.max(0, Math.floor(((v - min) / (max - min)) * 255 + 0.5)));

/** What every writer must produce, checked on a deck: validate is clean and the levels are exact. */
async function assertDeck(deck) {
  const { problems } = await runValidate(deck);
  assert.deepEqual(problems, [], problems.map(formatProblem).join("\n"));

  // A value raster, linear over the data's range: 0 to 309.
  assert.deepEqual(sidecar(deck, "density.json"), { bounds: BOUNDS, value: { scale: "linear", min: 0, max: 309 }, src: "density.png" });
  const density = image(deck, "density.png");
  assert.deepEqual(at(density, 0, 0), { level: 0, data: true }, "the smallest value is level 0");
  assert.deepEqual(at(density, 19, 29), { level: 255, data: true }, "the largest is level 255");
  assert.deepEqual(at(density, 2, 20), { level: 167, data: true }, "202 of 0..309 is level 167");
  assert.deepEqual(at(density, 5, 12), { level: 0, data: false }, "no data is transparent");
  assertLevels(density, GRID, linear(0, 309));

  // A time-lapse: three frames in a folder named after the file, one fixed scale.
  const years = sidecar(deck, "years.json");
  assert.deepEqual(years.value, { scale: "linear", min: 0, max: 600, unit: "people per km²" });
  assert.deepEqual(years.frames, [1000, 1500, 2250].map((people, i) => ({ src: `years/00${i + 1}.png`, label: `${2000 + i}`, numbers: { people } })));
  FRAMES.forEach((frame, i) => assertLevels(image(deck, `years/00${i + 1}.png`), frame, linear(0, 600)));

  // A mask (one class) and a raster of three classes: a cell's level is its class's place in the list.
  assert.deepEqual(sidecar(deck, "wells.json").value, { classes: ["Near a well"] });
  assertLevels(image(deck, "wells.png"), WELLS, () => 0);
  const classes = ["Forest", "Cropland", "Urban"];
  assert.deepEqual(sidecar(deck, "cover.json").value, { classes });
  assertLevels(image(deck, "cover.png"), COVER, (name) => classes.indexOf(name));

  // A log scale over the data's range, 1 to 256: level 255 x log(v) / log(256).
  assert.deepEqual(sidecar(deck, "rain.json").value, { scale: "log", min: 1, max: 256 });
  assertLevels(image(deck, "rain.png"), RAIN, (v) => Math.floor((Math.log(v / 1) / Math.log(256 / 1)) * 255 + 0.5));
}

test("writers: the Python grid writer's output passes validate", { skip: !PYTHON && "python3 is not installed" }, async () => {
  await assertDeck(deckOf("python"));
});

test("writers: the R grid writer's output passes validate", { skip: !R && "Rscript with png and jsonlite is not installed" }, async () => {
  await assertDeck(deckOf("r"));
});

test("writers: both write the same levels for the same grid", { skip: !(PYTHON && R) && "needs both python3 and Rscript" }, () => {
  const [py, r] = [deckOf("python"), deckOf("r")];
  for (const file of ["density.json", "years.json", "wells.json", "cover.json", "rain.json"]) assert.deepEqual(sidecar(r, file), sidecar(py, file), file);
  for (const file of ["density.png", "years/001.png", "years/002.png", "years/003.png", "wells.png", "cover.png", "rain.png"]) {
    assert.deepEqual(image(r, file), image(py, file), file);
  }
});

test("writers: the Python grid writer takes NumPy arrays, with NaN for no data", { skip: !NUMPY && "NumPy is not installed" }, () => {
  const [lists, arrays] = [deckOf("python"), deckOf("numpy")];
  for (const file of ["density.json", "years.json"]) assert.deepEqual(sidecar(arrays, file), sidecar(lists, file), file);
  for (const file of ["density.png", "years/001.png", "years/002.png", "years/003.png"]) assert.deepEqual(image(arrays, file), image(lists, file), file);
});

// --- what the writers refuse ---------------------------------------------------------------------------------------

// Each case is one call that a careless input could turn into a file `validate` rejects. A writer must refuse it with a
// message (the same in both languages) and write nothing, or write a file that is right: class names as text, values
// past a fixed range at its ends.
const CELLS = "cells must be finite numbers, or NA, None or NaN for no data";
const CASES = {
  inf: { error: `${CELLS} (row 2, column 1)` },
  "minus-inf": { error: `${CELLS} (row 1, column 2)` },
  "range-inf": { error: "`min` and `max` must be finite numbers" },
  "far-apart": { error: "`min` and `max` are too far apart to compute levels" },
  "class-codes": { ok: true },
  "classes-twice": { error: "class names must be unique (found 'a' twice)" },
  clamp: { ok: true },
  "bounds-order": { error: "`bounds` must be west, south, east, north in degrees: four finite numbers, with west < east and south < north, within -180 to 180 and -90 to 90" },
  "numbers-nan": { error: "`numbers` needs one finite number per frame for every key" },
};
const PY_REFUSE = `import json, sys
sys.path.insert(0, sys.argv[1])
from stepdeck_map import write_stepdeck_grid
out = sys.argv[2]
b = [-19, -31, -10, -23]
inf, nan = float("inf"), float("nan")
w = lambda name, grid, *rest, **options: write_stepdeck_grid(out + "/" + name + ".json", grid, *rest, **options)
cases = {
    "inf": lambda: w("inf", [[1, 2], [inf, 4]], b),
    "minus-inf": lambda: w("minus-inf", [[1, -inf], [3, 4]], b, value={"scale": "linear", "min": 0, "max": 10}),
    "range-inf": lambda: w("range-inf", [[1, 2], [3, 4]], b, value={"scale": "linear", "min": 0, "max": inf}),
    "far-apart": lambda: w("far-apart", [[1, 2], [3, 4]], b, value={"scale": "linear", "min": -1e308, "max": 1e308}),
    "class-codes": lambda: w("class-codes", [[1, 2], [None, 1]], b, value={"classes": [1, 2]}),
    "classes-twice": lambda: w("classes-twice", [["a", "b"], ["a", None]], b, value={"classes": ["a", "b", "a"]}),
    "clamp": lambda: w("clamp", [[-50, 0], [100, 150]], b, value={"scale": "linear", "min": 0, "max": 100}),
    "bounds-order": lambda: w("bounds-order", [[1, 2], [3, 4]], [-19, -10, -31, -23]),
    "numbers-nan": lambda: w("numbers-nan", [[[1, 2], [3, 4]], [[1, 2], [3, 4]]], b, labels=["a", "b"], numbers={"people": [1, nan]}),
}
result = {}
for name, call in cases.items():
    try:
        call()
        result[name] = {"ok": True}
    except ValueError as e:
        result[name] = {"error": str(e)}
json.dump(result, open(out + "/result.json", "w"))
`;
const R_REFUSE = `args <- commandArgs(trailingOnly = TRUE)
source(file.path(args[1], "stepdeck-map.R"))
out <- args[2]
b <- c(-19, -31, -10, -23)
m <- function(...) matrix(c(...), 2, byrow = TRUE)
w <- function(name, m, ...) write_stepdeck_grid(m, path = file.path(out, paste0(name, ".json")), ...)
cases <- list(
  "inf" = function() w("inf", m(1, 2, Inf, 4), b),
  "minus-inf" = function() w("minus-inf", m(1, -Inf, 3, 4), b, value = list(scale = "linear", min = 0, max = 10)),
  "range-inf" = function() w("range-inf", m(1, 2, 3, 4), b, value = list(scale = "linear", min = 0, max = Inf)),
  "far-apart" = function() w("far-apart", m(1, 2, 3, 4), b, value = list(scale = "linear", min = -1e308, max = 1e308)),
  "class-codes" = function() w("class-codes", m(1, 2, NA, 1), b, value = list(classes = c(1, 2))),
  "classes-twice" = function() w("classes-twice", m("a", "b", "a", NA), b, value = list(classes = c("a", "b", "a"))),
  "clamp" = function() w("clamp", m(-50, 0, 100, 150), b, value = list(scale = "linear", min = 0, max = 100)),
  "bounds-order" = function() w("bounds-order", m(1, 2, 3, 4), c(-19, -10, -31, -23)),
  "numbers-nan" = function() w("numbers-nan", list(m(1, 2, 3, 4), m(1, 2, 3, 4)), b, labels = c("a", "b"), numbers = list(people = c(1, NaN)))
)
result <- lapply(cases, function(call) tryCatch({ call(); list(ok = TRUE) }, error = function(e) list(error = conditionMessage(e))))
jsonlite::write_json(result, file.path(out, "result.json"), auto_unbox = TRUE)
`;

const refused = new Map();
/** The folder a language's refusal cases ran in, run once: result.json and the files of the cases that wrote. */
function refusalsOf(lang) {
  if (!refused.has(lang)) {
    const dir = join(tmp, `refuse-${lang}`);
    mkdirSync(dir, { recursive: true });
    const script = join(tmp, `refuse-${lang}.script`);
    writeFileSync(script, lang === "python" ? PY_REFUSE : R_REFUSE);
    const [cmd, args] = lang === "python" ? ["python3", ["-I"]] : ["Rscript", []];
    const run = spawnSync(cmd, [...args, script, WRITERS, dir], { encoding: "utf8" });
    assert.equal(run.status, 0, `${cmd} failed:\n${run.stdout}${run.stderr}`);
    refused.set(lang, dir);
  }
  return refused.get(lang);
}
const json = (dir, file) => JSON.parse(readFileSync(join(dir, file), "utf8"));
/** The levels of a PNG as rows, null where a pixel has no data. */
function levelRows(dir, file) {
  const img = decoded(readFileSync(join(dir, file)));
  return Array.from({ length: img.height }, (_, r) => Array.from({ length: img.width }, (_, c) => (at(img, r, c).data ? at(img, r, c).level : null)));
}

/** Each case is refused with its message and writes no sidecar, or writes the right file. */
async function assertRefusals(t, dir) {
  const result = json(dir, "result.json");
  for (const [name, expected] of Object.entries(CASES)) {
    await t.test(name, () => {
      assert.deepEqual(result[name], expected);
      if (expected.error) assert.equal(existsSync(join(dir, `${name}.json`)), false, "a refused call writes no sidecar");
    });
  }
  await t.test("class-codes: class names that are numbers are written as text, and cells match them as text", () => {
    assert.deepEqual(json(dir, "class-codes.json").value, { classes: ["1", "2"] });
    assert.deepEqual(levelRows(dir, "class-codes.png"), [[0, 1], [null, 0]]);
  });
  await t.test("clamp: values past a fixed range are written at its ends", () => {
    assert.deepEqual(json(dir, "clamp.json").value, { scale: "linear", min: 0, max: 100 });
    assert.deepEqual(levelRows(dir, "clamp.png"), [[0, 0], [255, 255]]);
  });
}

test("writers: the Python grid writer refuses what validate would reject", { skip: !PYTHON && "python3 is not installed" }, async (t) => {
  await assertRefusals(t, refusalsOf("python"));
});

test("writers: the R grid writer refuses what validate would reject", { skip: !R && "Rscript with png and jsonlite is not installed" }, async (t) => {
  await assertRefusals(t, refusalsOf("r"));
});

test("writers: R and Python refuse the same inputs with the same messages", { skip: !(PYTHON && R) && "needs both python3 and Rscript" }, () => {
  const [py, r] = [refusalsOf("python"), refusalsOf("r")];
  assert.deepEqual(json(r, "result.json"), json(py, "result.json"));
  for (const name of ["class-codes", "clamp"]) {
    assert.deepEqual(json(r, `${name}.json`), json(py, `${name}.json`), name);
    assert.deepEqual(levelRows(r, `${name}.png`), levelRows(py, `${name}.png`), name);
  }
});
