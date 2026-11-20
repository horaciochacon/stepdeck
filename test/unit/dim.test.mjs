// Focus-dim: the theme colour that unfocused marks turn to, the helpers that apply it, and the contrast
// the dimmed text keeps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHex, luminance, contrast } from "#engine/core/color.js";
import { MIN_CONTRAST } from "../../cli/check.js";
import { focusPaint, tweenColor } from "#engine/core/kit.js";
import { d3 } from "#engine/core/d3.js";
import { animate } from "#engine/core/animate.js";

const THEMES = ["academic-light", "modern"];
const tokensOf = (theme) => {
  const css = readFileSync(new URL(`../../engine/themes/${theme}/tokens.css`, import.meta.url), "utf8");
  return Object.fromEntries([...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
};

for (const theme of THEMES) {
  test(`dimmed diagram labels keep contrast (${theme})`, () => {
    const t = tokensOf(theme);
    const ratio = contrast(luminance(parseHex(t["--sd-color-muted"])), luminance(parseHex(t["--sd-color-background"])));
    assert.ok(ratio >= MIN_CONTRAST, `muted on background is ${ratio.toFixed(2)}:1, below ${MIN_CONTRAST}:1`);
  });

  test(`--sd-color-dim sits between grid and muted by luminance (${theme})`, () => {
    const t = tokensOf(theme);
    assert.ok(t["--sd-color-dim"], "the theme declares --sd-color-dim");
    const [dim, muted, grid] = ["--sd-color-dim", "--sd-color-muted", "--sd-color-grid"].map((n) => luminance(parseHex(t[n])));
    assert.ok(dim > muted, `lighter than muted (${dim.toFixed(3)} vs ${muted.toFixed(3)})`);
    assert.ok(dim < grid, `darker than grid (${dim.toFixed(3)} vs ${grid.toFixed(3)})`);
    assert.match(t["--sd-color-dim"], /^#[0-9a-f]{6}$/);
  });
}

test("focusPaint: the resolved dim colour when dimmed, the colour itself otherwise", () => {
  const ctx = { tokens: { "--sd-color-dim": " #c4c4cc ", "--sd-color-rule": "#e4e4e7" } };
  assert.equal(focusPaint(ctx, "#0072b2", true), "#c4c4cc");
  assert.equal(focusPaint(ctx, "#0072b2", false), "#0072b2");
  assert.equal(focusPaint(ctx, null, false), null);
});

test("focusPaint falls back to the rule colour for a theme without --sd-color-dim, and to the colour without tokens", () => {
  assert.equal(focusPaint({ tokens: { "--sd-color-rule": "#e4e4e7" } }, "#0072b2", true), "#e4e4e7");
  assert.equal(focusPaint({}, "#0072b2", true), "#0072b2");
  assert.equal(focusPaint(undefined, "#0072b2", true), "#0072b2");
});

const ctx = { d3, animate };
const linear = (t) => t;
const sample = async (from, to, opts) => {
  const seen = [];
  await tweenColor(ctx, from, to, (c) => seen.push(c), opts);
  return seen;
};

test("tweenColor: RGB steps from the start colour to exactly the end colour", async () => {
  const seen = await sample("#000000", "#c8c8c8", { duration: 200, ease: linear });
  assert.equal(seen[0], "rgb(0, 0, 0)");
  assert.equal(seen.at(-1), "#c8c8c8", "the last value is the target as given");
  // On a busy machine a frame can land right at either end and round to it (t = 0.998 is rgb(200, 200, 200)):
  // the frames stay within the ends, at least one is strictly between them, and they never go back.
  const mid = seen.slice(1, -1).map((c) => Number(/\d+/.exec(c)[0]));
  assert.ok(mid.some((v) => v > 0 && v < 200), `an intermediate frame (${mid})`);
  assert.ok(mid.every((v) => v >= 0 && v <= 200), `within the ends (${mid})`);
  assert.deepEqual([...mid].sort((a, b) => a - b), mid, "monotonic");
});

test("tweenColor: zero duration and an aborted signal set the end colour at once", async () => {
  assert.deepEqual(await sample("#000000", "#c8c8c8", { duration: 0 }), ["#c8c8c8"]);
  assert.deepEqual(await sample("#000000", "#c8c8c8", { duration: 500, signal: AbortSignal.abort() }), ["#c8c8c8"]);
});

test("tweenColor: equal colours set once; 'none' fades in from the target colour's transparent", async () => {
  assert.deepEqual(await sample("#c8c8c8", "#c8c8c8", { duration: 80 }), ["#c8c8c8"]);
  const seen = await sample("none", "#ffffff", { duration: 60, ease: linear });
  assert.equal(seen[0], "rgba(255, 255, 255, 0)");
  assert.equal(seen.at(-1), "#ffffff");
  assert.ok(seen.every((c) => !/NaN/.test(c)), seen.join(" "));
});

test("tweenColor: an abort mid-way snaps to the end colour", async () => {
  const controller = new AbortController();
  const seen = [];
  const run = tweenColor(ctx, "#000000", "#c8c8c8", (c) => seen.push(c), { duration: 2000, signal: controller.signal });
  setTimeout(() => controller.abort(), 40);
  await run;
  assert.equal(seen.at(-1), "#c8c8c8");
  assert.ok(seen.length < 20);
});

test("tweenColor runs through ctx.animate.tween, so a stubbed ctx stubs it", async () => {
  const calls = [];
  const stub = { d3, animate: { tween: async (a, b, onValue, opts) => { calls.push([a, b, opts]); onValue(0.5); onValue(1); } } };
  const seen = [];
  await tweenColor(stub, "#000000", "#c8c8c8", (c) => seen.push(c), { duration: 99 });
  assert.deepEqual(calls, [[0, 1, { duration: 99 }]]);
  assert.deepEqual(seen, ["rgb(100, 100, 100)", "#c8c8c8"]);
});
