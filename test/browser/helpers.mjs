// Shared checks for the slide-kit component browser tests (Tasks 2-7). Each helper takes the
// `page` and `ctx` that withPage (cli/browser.js) gives the test, and a `deck` made by deckPages().
//
//   const pages = deckPages("test/fixtures/decks/list/");     // path relative to the repo root
//   pages.url(slide, "step=a&motion=full")                    // bare-shell url for withPage / ctx.open
//   await goTo(page, slide, step)                             // STEPDECK.goTo, then settled()
//   await elementHtml(page, id)                               // outerHTML of [data-el=id]
//   await canvasPixels(page, id)                              // toDataURL() of every canvas inside [data-el=id]
//   await htmlAfterJump(ctx, page, pages, slide, step, id)    // fresh load at `step`
//   await expectJumpEqualsPlayed(ctx, page, { pages, slide, steps, id })
//   await expectBackwardEqualsJump(ctx, page, { pages, slide, steps, id })
//   await expectInterruptEqualsJump(ctx, page, { pages, slide, from, via, to, id, keep? })
//   await expectAnimatedStepMoves(ctx, page, { pages, slide, from, to, id, probe? })
//   await sampleFrames(page, slide, step, id, probe?)         // the element once per frame while a step plays
//   paletteRgb(theme, index)                                  // `rgb(...)` of a theme's categorical palette colour
//   paletteRoleRgb(theme, kind, role)                         // `rgb(...)` of a role of a theme's default palette of a kind
//   easeAgainstTime(samples)                                  // how far a sampled 0..1 progress is from linear in time
//
// The expect* helpers throw an assertion error naming the step that differs. "Equal" is strict
// outerHTML equality (after settling, a component leaves no inline animation styles behind) and, for an
// element with a canvas, equal canvas pixels (`canvasPixels`), the jump read in the same browser.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Urls for a deck folder under the repo root (the browser tests serve the repo root). */
export function deckPages(deckDir) {
  const dir = deckDir.endsWith("/") ? deckDir : `${deckDir}/`;
  return { url: (slide, query = "") => `engine/core/render.html?deck=../../${dir}&slide=${slide}${query ? `&${query}` : ""}` };
}

export const settled = (page) => page.evaluate(() => window.STEPDECK.settled());

export async function goTo(page, slide, step) {
  await page.evaluate(([sl, st]) => window.STEPDECK.goTo(sl, st), [slide, step]);
  await settled(page);
}

export const elementHtml = (page, id) =>
  page.evaluate((id) => document.querySelector(`[data-el="${id}"]`)?.outerHTML ?? null, id);

/** `toDataURL()` of every canvas inside the element: equal strings are equal pixels. */
export const canvasPixels = (page, id) =>
  page.evaluate((id) => [...document.querySelectorAll(`[data-el="${id}"] canvas`)].map((c) => c.toDataURL()), id);

/** outerHTML of the element after loading the slide directly at `step` (no motion). */
export async function htmlAfterJump(ctx, page, pages, slide, step, id) {
  await ctx.open(pages.url(slide, `step=${step}`));
  return elementHtml(page, id);
}

/** The element's markup and canvas pixels as they are now. */
const stateOf = async (page, id) => ({ html: await elementHtml(page, id), pixels: await canvasPixels(page, id) });

/** stateOf after loading the slide directly at `step` (no motion). */
async function stateAfterJump(ctx, page, pages, slide, step, id) {
  await ctx.open(pages.url(slide, `step=${step}`));
  return stateOf(page, id);
}

/** Asserts two stateOf results are equal: the markup first, then the canvas pixels (compared whole, reported short). */
function assertSameState(actual, expected, message) {
  assert.equal(actual.html, expected.html, message);
  assert.equal(actual.pixels.length, expected.pixels.length, `${message} (number of canvases)`);
  actual.pixels.forEach((px, i) => assert.ok(px === expected.pixels[i], `${message} (pixels of canvas ${i})`));
}

/** Loads the slide at `step` with motion on and checks that the page really animates. */
async function openAnimated(ctx, page, pages, slide, step) {
  await ctx.open(pages.url(slide, `step=${step}&motion=full`));
  assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true, "the played run really animates");
}

/** Playing forward one step at a time (motion=full) ends at the same html as jumping, at every step. */
export async function expectJumpEqualsPlayed(ctx, page, { pages, slide, steps, id }) {
  const jumped = [];
  for (const step of steps) jumped.push(await stateAfterJump(ctx, page, pages, slide, step, id));
  await openAnimated(ctx, page, pages, slide, steps[0]);
  assertSameState(await stateOf(page, id), jumped[0], `${slide}/${id}: first step`);
  for (let i = 1; i < steps.length; i++) {
    await goTo(page, slide, steps[i]);
    assertSameState(await stateOf(page, id), jumped[i], `${slide}/${id}: played to step '${steps[i]}' differs from a jump`);
  }
  assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
  assert.deepEqual(ctx.errors, []);
}

/** Arriving at step i-1 from step i (backward, so no motion) ends at the same html as a jump. */
export async function expectBackwardEqualsJump(ctx, page, { pages, slide, steps, id }) {
  for (let i = 1; i < steps.length; i++) {
    const jumped = await stateAfterJump(ctx, page, pages, slide, steps[i - 1], id);
    await openAnimated(ctx, page, pages, slide, steps[i]);
    await goTo(page, slide, steps[i - 1]);
    assertSameState(await stateOf(page, id), jumped, `${slide}/${id}: back from '${steps[i]}' to '${steps[i - 1]}' differs from a jump`);
  }
  assert.deepEqual(ctx.errors, []);
}

/**
 * Start an animated move from -> via, re-target to `to` 100 ms in, settle: the html equals a jump to `to`
 * and no element inside it keeps an inline style (a canvas layer's own size and position excepted). `keep` is a
 * selector of other nodes whose inline style is their content, written the same by a jump (a legend swatch's
 * colour), so they are not motion residue.
 */
export async function expectInterruptEqualsJump(ctx, page, { pages, slide, from, via, to, id, keep }) {
  const jumped = await stateAfterJump(ctx, page, pages, slide, to, id);
  await openAnimated(ctx, page, pages, slide, from);
  await page.evaluate(
    async ([sl, via, to]) => {
      window.STEPDECK.goTo(sl, via);
      await new Promise((r) => setTimeout(r, 100));
      window.STEPDECK.goTo(sl, to);
    },
    [slide, via, to],
  );
  await settled(page);
  assertSameState(await stateOf(page, id), jumped, `${slide}/${id}: interrupted '${from}' -> '${via}' -> '${to}' differs from a jump`);
  // A canvas layer keeps its inline size and position (it is placed, not animated).
  const exempt = keep ? `.sd-canvas-layer, ${keep}` : ".sd-canvas-layer";
  const styled = await page.evaluate(([id, exempt]) => document.querySelectorAll(`[data-el="${id}"] [style]:not(${exempt})`).length, [id, exempt]);
  assert.equal(styled, 0, "no inline styles are left inside the element");
  assert.deepEqual(ctx.errors, []);
}

/**
 * A forward animated step really moves: `probe(page)` (default: the element's outerHTML) sampled 120 ms into
 * the move differs from the end state. Returns { mid, end }.
 */
export async function expectAnimatedStepMoves(ctx, page, { pages, slide, from, to, id, probe }) {
  const read = probe ?? ((page) => elementHtml(page, id));
  await openAnimated(ctx, page, pages, slide, from);
  // No `return`: evaluate would otherwise wait for the whole move.
  await page.evaluate(([sl, to]) => { window.STEPDECK.goTo(sl, to); }, [slide, to]);
  await page.waitForTimeout(120);
  const mid = await read(page);
  await settled(page);
  const end = await read(page);
  assert.notEqual(mid, end, `${slide}/${id}: mid-flight sample equals the end state`);
  return { mid, end };
}

/**
 * In the page: STEPDECK.goTo(slide, step), sampling the element `id` once per animation frame from a frame loop
 * started before the step is asked for until it settles, plus two frames, so it holds however late a timer fires.
 * A sample is { ms (since the goTo), visible (the box's computed visibility), style (the box's style attribute) }
 * merged with probe(el), a self-contained function of the box (its source is sent to the page).
 * -> { frames: sample[], end: sample, settledMs (from the goTo until settled() resolved) }
 */
export function sampleFrames(page, slide, step, id, probe = () => ({})) {
  const run = async ([slide, step, id], probe) => {
    const el = document.querySelector(`[data-el="${id}"]`);
    let t0 = performance.now();
    const read = () => ({ ms: performance.now() - t0, visible: getComputedStyle(el).visibility === "visible", style: el.getAttribute("style"), ...probe(el) });
    const frames = [];
    let done = false;
    const tick = () => {
      if (done) return;
      frames.push(read());
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    t0 = performance.now();
    await window.STEPDECK.goTo(slide, step);
    await window.STEPDECK.settled();
    const settledMs = performance.now() - t0;
    for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(r));
    done = true;
    return { frames, end: read(), settledMs };
  };
  return page.evaluate(`(${run})(${JSON.stringify([slide, step, id])}, ${probe})`);
}

/** The computed `rgb(...)` of a theme color token (`--sd-color-dim`), resolved through a probe in the canvas. */
export const tokenRgb = (page, name) =>
  page.evaluate((name) => {
    const probe = document.createElement("div");
    probe.style.color = `var(${name})`;
    document.querySelector(".sd-canvas").appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, name);

/**
 * How a sampled color moved: samples are { ms, color } as sampleFrames returns them (`color` an `rgb(...)` string).
 * -> { from, to, moved (frames strictly between the two ends), start (ms of the first frame off `from`),
 * arrived (ms of the first frame at `to`) }. `from` is the first frame's color and `to` the last's.
 */
export function colorMove(frames) {
  const from = frames[0].color;
  const to = frames.at(-1).color;
  const off = frames.find((f) => f.color !== from);
  const at = frames.find((f) => f.color === to && f.ms >= (off?.ms ?? 0));
  return {
    from,
    to,
    moved: frames.filter((f) => f.color !== from && f.color !== to).length,
    start: off?.ms ?? NaN,
    arrived: at?.ms ?? NaN,
  };
}

/**
 * How a sampled motion progressed against time: samples are { ms, p } with p in 0..1 (0 before the motion, 1 at its
 * end). The motion's span is taken from the samples themselves (the last at 0 to the first at 1), so start lag and
 * page load do not matter. -> { span, checked, worst }: `checked` counts the samples a fifth to a half of the way
 * through, `worst` is their largest |p - fraction of the span|. A linear ease keeps `worst` small; a cubic in-out
 * one is far behind early on (at 30% of the time it has done 11%).
 */
export function easeAgainstTime(samples) {
  const moved = samples.findIndex((s) => s.p > 0.001);
  const t0 = samples[Math.max(0, moved - 1)]?.ms ?? NaN;
  const t1 = samples.find((s, i) => i >= moved && s.p >= 0.999)?.ms ?? NaN;
  const span = t1 - t0;
  const inside = samples.map((s) => ({ ...s, f: (s.ms - t0) / span })).filter((s) => s.f >= 0.2 && s.f <= 0.5);
  return { span, checked: inside.length, worst: Math.max(...inside.map((s) => Math.abs(s.p - s.f))) };
}

/**
 * The computed `rgb(...)` of colour `index` of a theme's default categorical palette (themes/<theme>/palettes.json),
 * read from the file, so a test compares what the page painted with what the theme declares.
 */
export function paletteRgb(theme, index) {
  const { default: dflt, palettes } = palettesOf(theme);
  return hexRgb(palettes[dflt.categorical].colors[index].value);
}

/**
 * The computed `rgb(...)` of the colour a role names (`high`, `low`) in a theme's default palette of `kind`
 * (`diverging`), read from themes/<theme>/palettes.json.
 */
export function paletteRoleRgb(theme, kind, role) {
  const { default: dflt, palettes } = palettesOf(theme);
  const palette = palettes[dflt[kind]];
  const id = palette.roles[role];
  return hexRgb(palette.colors.find((c) => c.id === id).value);
}

const palettesOf = (theme) => JSON.parse(readFileSync(new URL(`../../engine/themes/${theme}/palettes.json`, import.meta.url), "utf8"));
const hexRgb = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};
