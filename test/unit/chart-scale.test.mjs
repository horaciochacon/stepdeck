// core/chart-scale.js: colorScale (classes, ramps, diverging, categories, masks) and the legend it describes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { colorScale, legendRow } from "#engine/core/chart-scale.js";
import { d3 } from "#engine/core/d3.js";

const file = JSON.parse(await readFile(new URL("../../engine/themes/modern/palettes.json", import.meta.url), "utf8"));
const build = (kind) => {
  const colors = file.palettes[file.default[kind]].colors.map((c) => c.value);
  return { kind, colors };
};
const palettes = { sequential: build("sequential"), diverging: build("diverging"), categorical: build("categorical") };
const rgb = (c) => d3.rgb(c).toString();
const along = (kind, t) => rgb(d3.piecewise(d3.interpolateLab, palettes[kind].colors)(t));

test("colorScale: classes sample the sequential palette end to end", () => {
  const s = colorScale({ classes: [10, 20, 30] }, palettes);
  assert.equal(s.kind, "steps");
  const colors = [5, 10, 20, 30].map((v) => rgb(s.color(v)));
  assert.equal(colors.length, 4);
  assert.equal(colors[0], rgb(palettes.sequential.colors[0]));
  assert.equal(colors[3], rgb(palettes.sequential.colors.at(-1)));
  assert.deepEqual(colors, [0, 1 / 3, 2 / 3, 1].map((t) => along("sequential", t)));
  assert.deepEqual(s.legend.items.map((i) => rgb(i.color)), colors);
  assert.deepEqual(s.legend.items.map((i) => i.label), ["< 10", "10–20", "20–30", "≥ 30"]);
  assert.equal(s.legend.kind, "steps");
});

test("colorScale: diverging classes centre on the midpoint", () => {
  const s = colorScale({ classes: [-10, 0, 10], midpoint: 0 }, palettes);
  const got = [-20, -5, 5, 20].map((v) => rgb(s.color(v)));
  assert.deepEqual(got, [0, 0.25, 0.75, 1].map((t) => along("diverging", t)));
  assert.equal(rgb(s.color(0)), along("diverging", 0.75), "the midpoint starts the first class above it");
  // an odd split: one class below the midpoint (t = 0), three above (t = 1 - 0.5 x (2 - k) / 3)
  const odd = colorScale({ classes: [0, 5, 10], midpoint: 0 }, palettes);
  assert.deepEqual([-1, 1, 6, 11].map((v) => rgb(odd.color(v))), [0, 1 - 1 / 3, 1 - 1 / 6, 1].map((t) => along("diverging", t)));
});

test("colorScale: midpoint must be a break", () => {
  assert.throws(() => colorScale({ classes: [5, 10, 20], midpoint: 7 }, palettes), { message: "`midpoint` must be one of `classes` (5, 10, 20)" });
});

test("colorScale: domain of one value", () => {
  const s = colorScale({ values: [4, null, 4, ""] }, palettes);
  assert.equal(s.kind, "ramp");
  assert.deepEqual(s.legend.labels, ["4", "5"], "[v, v + 1]");
  assert.equal(rgb(s.color(4)), along("sequential", 0));
  assert.equal(rgb(s.color(5)), along("sequential", 1));
});

test("colorScale: all missing", () => {
  const s = colorScale({ values: [null, "", NaN] }, palettes);
  assert.equal(s.color(null), null);
  assert.equal(s.color(undefined), null);
  assert.equal(s.color(""), null);
  assert.equal(s.color(NaN), null);
  assert.deepEqual(s.legend.labels, ["0", "1"]);
  assert.ok(s.legend.labels.every((l) => Number.isFinite(Number(l))));
  assert.equal(s.legend.stops.length, 9);
});

test("colorScale: continuous ramp, an explicit domain, clamped", () => {
  const s = colorScale({ domain: [0, 100], values: [3, 9999] }, palettes);
  assert.equal(rgb(s.color(0)), along("sequential", 0));
  assert.equal(rgb(s.color(50)), along("sequential", 0.5));
  assert.equal(rgb(s.color(100)), along("sequential", 1));
  assert.equal(rgb(s.color(1e6)), along("sequential", 1), "past the domain");
  assert.equal(rgb(s.color(-5)), along("sequential", 0));
  assert.deepEqual(s.legend.stops.map(rgb), Array.from({ length: 9 }, (_, i) => along("sequential", i / 8)));
  assert.deepEqual(s.legend.labels, ["0", "100"]);
  const d = colorScale({ values: [2, 8, 5] }, palettes);
  assert.deepEqual(d.legend.labels, ["2", "8"], "the extent of values by default");
});

test("colorScale: continuous log", () => {
  const s = colorScale({ domain: [1, 1000], log: true }, palettes);
  assert.equal(rgb(s.color(1)), along("sequential", 0));
  assert.equal(rgb(s.color(10)), along("sequential", 1 / 3));
  assert.equal(rgb(s.color(1000)), along("sequential", 1));
  assert.equal(s.color(0), null, "no logarithm of zero");
  assert.equal(s.color(-4), null);
  assert.deepEqual(s.legend.labels, ["1", "1000"], "formatted values, not logarithms");
  assert.throws(() => colorScale({ domain: [0, 10], log: true }, palettes), { message: "`log` needs a domain above 0" });
  assert.throws(() => colorScale({ values: [0, 10], log: true }, palettes), { message: "`log` needs a domain above 0" });
});

test("colorScale: symmetric domain about the midpoint", () => {
  const s = colorScale({ midpoint: 0, values: [-2, 8, 3] }, palettes);
  assert.deepEqual(s.legend.labels, ["-8", "8"]);
  assert.equal(rgb(s.color(0)), along("diverging", 0.5));
  assert.equal(rgb(s.color(-8)), along("diverging", 0));
  assert.equal(rgb(s.color(8)), along("diverging", 1));
  assert.equal(rgb(s.color(-4)), along("diverging", 0.25));
  const off = colorScale({ midpoint: 10, values: [9, 11, 20] }, palettes);
  assert.deepEqual(off.legend.labels, ["0", "20"]);
  const one = colorScale({ midpoint: 5, values: [5] }, palettes);
  assert.deepEqual(one.legend.labels, ["4", "6"], "one value: [v, v + 1], then symmetric");
});

test("colorScale: an explicit domain is used as given, with a midpoint piecewise", () => {
  const s = colorScale({ domain: [-5, 20], midpoint: 0 }, palettes);
  assert.deepEqual(s.legend.labels, ["-5", "20"], "never widened");
  assert.deepEqual([-5, -2.5, 0, 10, 20, 99, -99].map((v) => rgb(s.color(v))), [0, 0.25, 0.5, 0.75, 1, 1, 0].map((t) => along("diverging", t)));
  const log = colorScale({ domain: [1, 100], midpoint: 10, log: true }, palettes);
  assert.deepEqual(log.legend.labels, ["1", "100"]);
  assert.deepEqual([1, Math.sqrt(10), 10, Math.sqrt(1000), 100].map((v) => rgb(log.color(v))), [0, 0.25, 0.5, 0.75, 1].map((t) => along("diverging", t)), "linear in ln on each arm");
  const edge = colorScale({ domain: [0, 10], midpoint: 0 }, palettes);
  assert.equal(rgb(edge.color(0)), along("diverging", 0.5), "the midpoint at an end of the domain");
  assert.equal(rgb(edge.color(10)), along("diverging", 1));
});

/** Whether two colours are the same to within one unit per channel (rounding). */
const near = (a, b) => {
  const [x, y] = [d3.rgb(a), d3.rgb(b)];
  return Math.abs(x.r - y.r) <= 1 && Math.abs(x.g - y.g) <= 1 && Math.abs(x.b - y.b) <= 1;
};

test("colorScale: an off-centre midpoint places the ramp legend's stops where their values are", () => {
  const s = colorScale({ domain: [-2, 10], midpoint: 0 }, palettes);
  const { stops, positions } = s.legend;
  assert.equal(positions.length, stops.length);
  // every stop sits where the value of its colour is on the bar: color(lo + position × (hi − lo)) is that stop
  stops.forEach((stop, i) => assert.ok(near(s.color(-2 + positions[i] * 12), stop), `stop ${i} at ${positions[i]}`));
  assert.equal(positions[4], 2 / 12, "the neutral colour sits at 0, a sixth of the way along, not at the centre");
  assert.deepEqual([positions[0], positions[8]], [0, 1]);
  // in the logarithm for a log ramp
  const log = colorScale({ domain: [1, 1000], midpoint: 10, log: true }, palettes);
  log.legend.stops.forEach((stop, i) => assert.ok(near(log.color(10 ** (3 * log.legend.positions[i])), stop), `log stop ${i}`));
  // a midpoint at an end of the domain: the arm with no values has all its stops at the midpoint, so the bar never runs back
  const low = colorScale({ domain: [0, 10], midpoint: 0 }, palettes).legend.positions;
  assert.deepEqual(low.slice(0, 5), [0, 0, 0, 0, 0]);
  assert.deepEqual(low.slice(4), [0, 0.25, 0.5, 0.75, 1]);
  const high = colorScale({ domain: [-10, 0], midpoint: 0 }, palettes).legend.positions;
  assert.deepEqual(high.slice(4), [1, 1, 1, 1, 1]);
  for (const list of [positions, low, high]) assert.deepEqual(list, [...list].sort((a, b) => a - b), "never decreasing");
});

test("colorScale: plain and centred ramps keep their stops evenly spaced", () => {
  for (const spec of [{ domain: [0, 100] }, { values: [2, 8] }, { midpoint: 0, values: [-2, 8, 3] }, { domain: [-4, 4], midpoint: 0 }, { domain: [1, 100], midpoint: 10, log: true }, { midpoint: 0.1, values: [-0.2, 0.4] }]) {
    const { legend } = colorScale(spec, palettes);
    assert.equal(legend.positions, undefined, JSON.stringify(spec));
    assert.equal(legend.stops.length, 9);
  }
});

/** A document just big enough for `legendRow`: elements with a class, text, a style and children. */
const fakeDocument = () => ({
  createElement: (tag) => ({ tag, className: "", textContent: "", style: {}, children: [], append(...nodes) { this.children.push(...nodes); } }),
});

test("legendRow: a ramp writes its stops' places when the legend has them, and plain colours otherwise", () => {
  const rampOf = (legend) => legendRow(fakeDocument(), legend, { t: () => "no data" }).children.find((n) => n.className === "sd-legend-ramp").style.backgroundImage;
  const off = rampOf(colorScale({ domain: [-2, 10], midpoint: 0 }, palettes).legend);
  const stops = off.slice("linear-gradient(to right, ".length, -1).split(/, (?=rgb)/);
  assert.equal(stops.length, 9);
  assert.match(stops[0], /^rgb\(\d+, \d+, \d+\) 0%$/);
  assert.match(stops[4], / 16\.67%$/, "the neutral colour at the midpoint's place");
  assert.match(stops[8], / 100%$/);
  const plain = rampOf(colorScale({ domain: [0, 100] }, palettes).legend);
  assert.match(plain, /^linear-gradient\(to right, (rgb\(\d+, \d+, \d+\)(, )?){9}\)$/, "no places: evenly spaced");
});

test("colorScale: a zero-width explicit domain is one value", () => {
  const s = colorScale({ domain: [5, 5] }, palettes);
  assert.deepEqual(s.legend.labels, ["5", "6"]);
  assert.equal(rgb(s.color(5)), along("sequential", 0));
  assert.equal(rgb(s.color(6)), along("sequential", 1));
  const log = colorScale({ domain: [5, 5], log: true }, palettes);
  assert.deepEqual(log.legend.labels, ["5", "50"]);
  assert.equal(rgb(log.color(5)), along("sequential", 0));
  assert.equal(rgb(log.color(50)), along("sequential", 1));
  const mid = colorScale({ domain: [5, 5], midpoint: 5 }, palettes);
  assert.equal(rgb(mid.color(5)), along("diverging", 0.5));
  const logMid = colorScale({ domain: [5, 5], midpoint: 5, log: true }, palettes);
  assert.equal(rgb(logMid.color(5)), along("diverging", 0.5));
  assert.equal(rgb(logMid.color(50)), along("diverging", 1));
});

test("colorScale: a blank string is missing, never 0", () => {
  const ramp = colorScale({ domain: [-1, 1] }, palettes);
  const steps = colorScale({ classes: [5] }, palettes);
  for (const blank of [" ", "\t", "\n "]) {
    assert.equal(ramp.color(blank), null, JSON.stringify(blank));
    assert.equal(steps.color(blank), null, JSON.stringify(blank));
  }
  assert.equal(rgb(ramp.color(" 0 ")), along("sequential", 0.5), "a padded number is a number");
});

test("colorScale: categories take the categorical palette in order", () => {
  const s = colorScale({ categories: ["forest", "water", "ice"] }, palettes);
  assert.equal(s.kind, "categories");
  assert.deepEqual(["forest", "water", "ice"].map((v) => s.color(v)), palettes.categorical.colors.slice(0, 3));
  assert.equal(s.color("sand"), null, "not a category");
  assert.equal(s.color(null), null);
  assert.deepEqual(s.legend, { kind: "categories", items: ["forest", "water", "ice"].map((label, i) => ({ color: palettes.categorical.colors[i], label })) });
});

test("colorScale: categories beyond the palette", () => {
  const seven = ["a", "b", "c", "d", "e", "f", "g"];
  assert.equal(palettes.categorical.colors.length, 6);
  assert.throws(() => colorScale({ categories: seven }, palettes), { message: "7 categories but the palette has 6 colours" });
  assert.doesNotThrow(() => colorScale({ categories: seven.slice(0, 6) }, palettes));
});

test("colorScale: mask", () => {
  const s = colorScale({ categories: ["present"], color: "#112233" }, palettes);
  assert.equal(s.kind, "categories");
  assert.equal(s.color("present"), "#112233");
  assert.equal(s.color("absent"), null);
  assert.equal(s.color(null), null);
  assert.deepEqual(s.legend.items, [{ color: "#112233", label: "present" }]);
  const numeric = colorScale({ categories: [1], color: "#112233" }, palettes);
  assert.equal(numeric.color(1), "#112233");
  assert.equal(numeric.color("1"), "#112233");
});

test("legend labels use the format", () => {
  const format = (v) => `${v}%`;
  assert.deepEqual(colorScale({ classes: [5, 10] }, palettes, { format }).legend.items.map((i) => i.label), ["< 5%", "5%–10%", "≥ 10%"]);
  assert.deepEqual(colorScale({ domain: [0, 80] }, palettes, { format }).legend.labels, ["0%", "80%"]);
  assert.deepEqual(colorScale({ domain: [1, 1000], log: true }, palettes, { format }).legend.labels, ["1%", "1000%"], "log: the formatted values");
  assert.deepEqual(colorScale({ domain: [0, 80] }, palettes).legend.labels, ["0", "80"], "String by default");
});

test("colorScale: classes must be in increasing order, with no break twice", () => {
  assert.throws(() => colorScale({ classes: [10, 5, 20] }, palettes), { message: "`classes` must be in increasing order (got 10, 5, 20)" });
  assert.throws(() => colorScale({ classes: [5, 5, 20] }, palettes), { message: "`classes` must be in increasing order (got 5, 5, 20)" });
  assert.throws(() => colorScale({ classes: [5, NaN] }, palettes), /`classes` must be in increasing order/);
  assert.throws(() => colorScale({ classes: [20, 10], midpoint: 10 }, palettes), /increasing order/, "before the midpoint check");
  assert.doesNotThrow(() => colorScale({ classes: [5] }, palettes));
  assert.doesNotThrow(() => colorScale({ classes: [-1, 0, 0.5] }, palettes));
});
