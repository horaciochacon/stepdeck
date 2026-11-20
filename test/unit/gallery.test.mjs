// The gallery deck (site/gallery) shows every built-in layout and component, stays in step with them, and
// validates: it is where every example.js runs as a slide (test/browser/gallery.test.mjs checks it in a browser).
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

test("every built-in component and layout has exactly one gallery entry", () => {
  for (const name of components) {
    assert.equal(entries.filter((e) => e.kind === "component" && e.name === name).length, 1, `component ${name}`);
  }
  for (const name of layouts) {
    assert.equal(entries.filter((e) => e.kind === "layout" && e.name === name).length, 1, `layout ${name}`);
  }
  assert.equal(entries.length, components.length + layouts.length, "no extra entries");
});

test("the deck lists the cover, then the layouts, then the components, in order", () => {
  assert.equal(deck.title, "stepdeck gallery");
  assert.equal(deck.lang, "en");
  assert.equal(deck.theme, "modern");
  assert.deepEqual(deck.slides, ["cover", ...entries.map((e) => e.slide)]);
  assert.deepEqual(entries.filter((e) => e.kind === "layout").map((e) => e.name), layouts);
  assert.deepEqual(entries.filter((e) => e.kind === "component").map((e) => e.name), components);
  assert.ok(entries.findIndex((e) => e.kind === "component") > entries.findLastIndex((e) => e.kind === "layout"));
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
