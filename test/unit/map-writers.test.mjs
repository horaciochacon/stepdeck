// The writer functions authors copy into their analysis code (docs/guide/maps/stepdeck-map.R and stepdeck_map.py)
// write raster files that pass `validate` and decode to exactly the grey levels the raster format defines. Each
// language runs when it is installed (Python 3; R with the png and jsonlite packages) and is skipped otherwise. The
// Python grid writer runs isolated (`python3 -I`), so it is proven to need nothing beyond the standard library.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
const BOUNDS = [-19, -31, -10, -23]; // the gallery's fictional country
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
function image(deck, file) {
  const { width, height, channels, data } = pngPixels(read(deck, file));
  const grey = [];
  const has = [];
  for (let i = 0; i < width * height; i++) {
    grey.push(data[i * channels]);
    has.push(channels === 1 || data[i * channels + 1] === 255);
  }
  return { width, height, grey, has };
}
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
