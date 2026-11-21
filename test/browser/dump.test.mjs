// `stepdeck dump` (spec §10): a text listing per step of visible elements, resolved props, text,
// boxes and what changed since the previous step. Measured in the bare shell, in canvas pixels.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { dump, formatDump } from "../../cli/dump.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const spike = fileURLToPath(new URL("../../examples/spike/", import.meta.url));
const cli = (...args) => spawnSync(process.execPath, ["cli/index.js", ...args], { cwd: repo, encoding: "utf8", env: process.env });

test("dump lists changed elements", async () => {
  const out = await dump(spike, { slide: "trend", step: "regimens" });
  assert.equal(out.length, 1);
  assert.equal(out[0].slide, "trend");
  assert.equal(out[0].step, 1);
  assert.equal(out[0].stepId, "regimens");
  assert.deepEqual(out[0].changed, ["chart"]);
  assert.deepEqual(out[0].errors, []);
});

test("dump of a slide: one block per step, visibility, canvas boxes, text, resolved props", async () => {
  const out = await dump(spike, { slide: "hello" });
  assert.deepEqual(out.map((s) => s.stepId), ["one", "two"]);
  const [one, two] = out;
  const el = (s, id) => s.elements.find((e) => e.id === id);
  assert.deepEqual(one.elements.map((e) => e.id), ["title", "lead", "reveal", "aside", "src"]);
  // Hidden keeps its space; collapsed has none.
  assert.equal(el(one, "reveal").visible, false);
  assert.ok(el(one, "reveal").box.h > 0, "hidden element keeps its box");
  assert.equal(el(one, "aside").visible, false);
  assert.equal(el(one, "aside").box.h, 0, "collapsed element takes no space");
  assert.equal(el(two, "aside").visible, true);
  assert.equal(el(one, "lead").text, "Slides are data: a layout, elements and steps.");
  assert.equal(el(one, "lead").type, "text");
  for (const k of ["x", "y", "w", "h"]) assert.ok(Number.isInteger(el(one, "lead").box[k]));
  assert.ok(el(one, "lead").box.w <= 1920 && el(one, "lead").box.x >= 0, "canvas pixels");
  assert.deepEqual(two.changed, ["reveal", "aside"]);
  assert.deepEqual(one.changed, ["title", "lead", "reveal", "aside", "src"], "step 0: everything is new");
});

test("dump boxes are canvas pixels whatever the viewport size", async () => {
  const [big] = await dump(spike, { slide: "hello", step: "one" });
  const [small] = await dump(spike, { slide: "hello", step: "one", size: 960 });
  assert.deepEqual(small.elements.map((e) => e.box), big.elements.map((e) => e.box));
});

test("dump props are the resolved props (bindings applied)", async () => {
  const [total] = await dump(spike, { slide: "trend", step: "total" });
  const big = total.elements.find((e) => e.id === "big");
  // A binding that is the whole value and has no format resolves to the raw number (spec §6.6).
  assert.equal(big.type, "big-number");
  assert.equal(big.props.value, 2942);
  assert.equal(big.props.format, ",.0f");
  assert.match(big.text, /^2,942\b/);
  assert.equal(big.visible, true);
  assert.deepEqual(total.changed, ["chart", "big"]);
});

test("formatDump: one compact block per step", async () => {
  const out = await dump(spike, { slide: "hello", step: "two" });
  const text = formatDump(out);
  const lines = text.trim().split("\n");
  assert.equal(lines[0], "hello · step 1 (two)");
  assert.match(text, /^ {2}visible +lead +text +\d+,\d+ \d+×\d+ +"Slides are data/m);
  assert.match(text, /^ {2}changed: reveal, aside$/m);
});

test("cli: dump --json prints machine output; unknown command prints usage and exits 2", () => {
  const r = cli("dump", "examples/spike", "--slide", "trend", "--step", "regimens", "--json");
  assert.equal(r.status, 0, r.stderr);
  const data = JSON.parse(r.stdout);
  assert.deepEqual(data[0].changed, ["chart"]);
  const text = cli("dump", "examples/spike", "--slide", "trend", "--step", "1");
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /^trend · step 1 \(regimens\)$/m);
  const bad = cli("frobnicate");
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /usage: stepdeck/i);
  const unknown = cli("dump", "examples/spike", "--slide", "nope");
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /unknown slide 'nope'/);
});

test("dump: the fan's canvas state", async () => {
  const lineStory = fileURLToPath(new URL("../fixtures/decks/line-story/", import.meta.url));
  const [fan] = await dump(lineStory, { slide: "fan", step: 2 });
  const chart = fan.elements.find((e) => e.id === "chart");
  assert.equal(chart.canvas.length, 1);
  assert.deepEqual(Object.keys(chart.canvas[0]).sort(), ["draws", "seed", "signature", "until"]);
  assert.match(chart.canvas[0].signature, /\S/);
  assert.deepEqual(chart.canvas[0], { draws: "20", until: "", seed: "1", signature: chart.canvas[0].signature });
  // An element without a canvas layer has no field.
  assert.equal("canvas" in fan.elements.find((e) => e.id === "src"), false);
  // The text listing carries it.
  const line = formatDump([fan]).split("\n").find((l) => l.includes(" chart "));
  assert.match(line, new RegExp(`canvas draws=20 seed=1 signature=${chart.canvas[0].signature}`));
});
