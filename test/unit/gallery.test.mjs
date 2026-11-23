// The gallery deck (site/gallery) shows every built-in layout and component, stays in step with them, and
// validates: it is where every example.js runs as a slide (test/browser/gallery.test.mjs checks it in a browser).
// After them come the motion slides, which show the motion vocabulary and the slide devices, the data-story slides,
// which play the chart moves (forecast, fan, estimates, pairs, strips, waterfall, pyramid) and the map's (rasters, flight
// and inset, time-lapse, points) and the second views (a process, its compact copy, a locator, a compact map), and last the custom components built only from what the engine hands every component
// (gallery.slope, gallery.swipe, gallery.where).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ENGINE, REPO, listDirs, readBuiltins } from "../../cli/engine.js";
import { validate } from "../../cli/validate.js";
import { formatProblem } from "../../cli/problems.js";

const gallery = join(REPO, "site", "gallery");
const { default: deck, entries } = await import(pathToFileURL(join(gallery, "deck.js")).href);

const components = readBuiltins(ENGINE);
const layouts = listDirs(join(ENGINE, "layouts")).sort();
const MOTION = ["motion-names", "motion-choreography", "motion-focus", "motion-message", "motion-ghost"];
const STORY = {
  "story-forecast": "chart-line",
  "story-fan": "chart-line",
  "story-estimates": "chart-points",
  "story-pairs": "chart-points",
  "story-strips": "chart-points",
  "story-waterfall": "chart-bar",
  "story-pyramid": "chart-bar",
  "map-rasters": "map",
  "map-flight-inset": "map",
  "map-timelapse": "map",
  "map-points": "map",
  "explain-process": "diagram",
  "explain-fit": "diagram",
  "explain-predict": "diagram",
  "map-locator": "map",
  "map-compact": "map",
};
const CUSTOM = [
  { slide: "custom-slope", kind: "custom", name: "gallery.slope", doc: "docs/guide/custom-components.md" },
  { slide: "map-swipe", kind: "custom", name: "gallery.swipe", doc: "docs/guide/custom-components.md" },
  { slide: "custom-where", kind: "custom", name: "gallery.where", doc: "docs/guide/custom-components.md" },
];

test("every built-in component and layout has exactly one gallery entry, and every motion, story and custom slide one", () => {
  for (const name of components) {
    assert.equal(entries.filter((e) => e.kind === "component" && e.name === name).length, 1, `component ${name}`);
  }
  for (const name of layouts) {
    assert.equal(entries.filter((e) => e.kind === "layout" && e.name === name).length, 1, `layout ${name}`);
  }
  assert.deepEqual(entries.filter((e) => e.kind === "motion").map((e) => e.slide), MOTION);
  for (const e of entries.filter((x) => x.kind === "motion")) {
    assert.equal(e.doc, "docs/guide/animation-and-motion.md", `${e.slide} links the motion guide`);
    assert.ok(typeof e.name === "string" && e.name !== "", `${e.slide} has a name`);
  }
  assert.deepEqual(entries.filter((e) => e.kind === "story").map((e) => e.slide), Object.keys(STORY));
  for (const e of entries.filter((x) => x.kind === "story")) {
    assert.equal(e.doc, `docs/reference/components/${STORY[e.slide]}.md`, `${e.slide} links its component's reference page`);
    assert.ok(typeof e.name === "string" && e.name !== "", `${e.slide} has a name`);
  }
  assert.deepEqual(entries.filter((e) => e.kind === "custom"), CUSTOM, "the custom component's slide links the custom-components guide");
  assert.equal(entries.length, components.length + layouts.length + MOTION.length + Object.keys(STORY).length + CUSTOM.length, "no extra entries");
});

test("the deck lists the cover, then the layouts, the components, the motion slides, the story slides and the custom one, in order", () => {
  assert.equal(deck.title, "stepdeck gallery");
  assert.equal(deck.lang, "en");
  assert.equal(deck.theme, "modern");
  assert.deepEqual(deck.components, CUSTOM.map((e) => e.name), "the deck lists its own components");
  assert.deepEqual(deck.slides, ["cover", ...entries.map((e) => e.slide)]);
  assert.deepEqual(entries.filter((e) => e.kind === "layout").map((e) => e.name), layouts);
  assert.deepEqual(entries.filter((e) => e.kind === "component").map((e) => e.name), components);
  assert.ok(entries.findIndex((e) => e.kind === "component") > entries.findLastIndex((e) => e.kind === "layout"));
  assert.ok(entries.findIndex((e) => e.kind === "motion") > entries.findLastIndex((e) => e.kind === "component"));
  assert.ok(entries.findIndex((e) => e.kind === "story") > entries.findLastIndex((e) => e.kind === "motion"));
  assert.ok(entries.findIndex((e) => e.kind === "custom") > entries.findLastIndex((e) => e.kind === "story"));
  assert.equal(entries.at(-1).kind, "custom", "the custom entry comes last");
});

// The demos' point: a chart or a map built only from what the engine hands every component (ctx.chart, ctx.map and the
// rest) needs no import, so it runs wherever the engine's files live, in this repository or in a deck's stepdeck/ copy.
for (const name of ["gallery.slope", "gallery.swipe", "gallery.where"]) {
  test(`the ${name} demo imports nothing and stays short`, () => {
    const source = readFileSync(join(gallery, "components", name, "index.js"), "utf8");
    assert.doesNotMatch(source, /^\s*import[\s{*"']/m, "no import statement");
    assert.doesNotMatch(source, /\bimport\s*\(/, "no dynamic import");
    assert.doesNotMatch(source, /\brequire\s*\(/, "no require");
    const lines = source.trimEnd().split("\n").length;
    assert.ok(lines <= 130, `about 100 lines (${lines})`);
  });
}

test("every gallery slide file exists and its id equals its file name", async () => {
  for (const id of deck.slides) {
    const file = join(gallery, "slides", `${id}.js`);
    assert.ok(existsSync(file), `${id}.js exists`);
    const mod = await import(pathToFileURL(file).href);
    assert.equal(mod.default.id, id);
  }
});

test("every entry's reference page exists", () => {
  for (const e of entries) assert.ok(existsSync(join(REPO, e.doc)), `${e.doc} exists`);
});

// The gallery is served as it is: a data file over 200 KB would slow the landing page and the deck for everyone.
test("every gallery data file is under 200 KB", () => {
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) visit(join(dir, entry.name));
      else files.push(join(dir, entry.name));
    }
  };
  visit(join(gallery, "data"));
  assert.ok(files.length > 30, `found ${files.length} data files`);
  for (const file of files) assert.ok(statSync(file).size < 200 * 1024, `${file.slice(gallery.length + 1)} is under 200 KB`);
});

test("the gallery deck validates clean: every example.js, as a slide, with its data", async () => {
  const problems = await validate(gallery);
  assert.deepEqual(problems.map(formatProblem), []);
});
