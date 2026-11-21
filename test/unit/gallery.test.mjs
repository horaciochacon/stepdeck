// The gallery deck (site/gallery) shows every built-in layout and component, stays in step with them, and
// validates: it is where every example.js runs as a slide (test/browser/gallery.test.mjs checks it in a browser).
// After them come the motion slides, which show the motion vocabulary and the slide devices, and the data-story slides,
// which play the chart moves (forecast, fan, estimates, pairs, strips, waterfall, pyramid).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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
};

test("every built-in component and layout has exactly one gallery entry, and every motion and story slide one", () => {
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
  assert.equal(entries.length, components.length + layouts.length + MOTION.length + Object.keys(STORY).length, "no extra entries");
});

test("the deck lists the cover, then the layouts, then the components, then the motion slides, then the story slides, in order", () => {
  assert.equal(deck.title, "stepdeck gallery");
  assert.equal(deck.lang, "en");
  assert.equal(deck.theme, "modern");
  assert.deepEqual(deck.slides, ["cover", ...entries.map((e) => e.slide)]);
  assert.deepEqual(entries.filter((e) => e.kind === "layout").map((e) => e.name), layouts);
  assert.deepEqual(entries.filter((e) => e.kind === "component").map((e) => e.name), components);
  assert.ok(entries.findIndex((e) => e.kind === "component") > entries.findLastIndex((e) => e.kind === "layout"));
  assert.ok(entries.findIndex((e) => e.kind === "motion") > entries.findLastIndex((e) => e.kind === "component"));
  assert.ok(entries.findIndex((e) => e.kind === "story") > entries.findLastIndex((e) => e.kind === "motion"));
  assert.equal(entries.at(-1).kind, "story", "story entries come last");
});

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

test("the gallery deck validates clean: every example.js, as a slide, with its data", async () => {
  const problems = await validate(gallery);
  assert.deepEqual(problems.map(formatProblem), []);
});
