// Shared checks for the slide-kit component browser tests (Tasks 2-7). Each helper takes the
// `page` and `ctx` that withPage (cli/browser.js) gives the test, and a `deck` made by deckPages().
//
//   const pages = deckPages("test/fixtures/decks/list/");     // path relative to the repo root
//   pages.url(slide, "step=a&motion=full")                    // bare-shell url for withPage / ctx.open
//   await goTo(page, slide, step)                             // STEPDECK.goTo, then settled()
//   await elementHtml(page, id)                               // outerHTML of [data-el=id]
//   await htmlAfterJump(ctx, page, pages, slide, step, id)    // fresh load at `step`
//   await expectJumpEqualsPlayed(ctx, page, { pages, slide, steps, id })
//   await expectBackwardEqualsJump(ctx, page, { pages, slide, steps, id })
//   await expectInterruptEqualsJump(ctx, page, { pages, slide, from, via, to, id })
//   await expectAnimatedStepMoves(ctx, page, { pages, slide, from, to, id, probe? })
//
// The expect* helpers throw an assertion error naming the step that differs. "Equal" is strict
// outerHTML equality: after settling, a component leaves no inline animation styles behind.
import assert from "node:assert/strict";

/** Urls for a deck folder under the repo root (the browser tests serve the repo root). */
export function deckPages(deckDir) {
  const dir = deckDir.endsWith("/") ? deckDir : `${deckDir}/`;
  return { url: (slide, query = "") => `core/render.html?deck=../${dir}&slide=${slide}${query ? `&${query}` : ""}` };
}

export const settled = (page) => page.evaluate(() => window.STEPDECK.settled());

export async function goTo(page, slide, step) {
  await page.evaluate(([sl, st]) => window.STEPDECK.goTo(sl, st), [slide, step]);
  await settled(page);
}

export const elementHtml = (page, id) =>
  page.evaluate((id) => document.querySelector(`[data-el="${id}"]`)?.outerHTML ?? null, id);

/** outerHTML of the element after loading the slide directly at `step` (no motion). */
export async function htmlAfterJump(ctx, page, pages, slide, step, id) {
  await ctx.open(pages.url(slide, `step=${step}`));
  return elementHtml(page, id);
}

/** Loads the slide at `step` with motion on and checks that the page really animates. */
async function openAnimated(ctx, page, pages, slide, step) {
  await ctx.open(pages.url(slide, `step=${step}&motion=full`));
  assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true, "the played run really animates");
}

/** Playing forward one step at a time (motion=full) ends at the same html as jumping, at every step. */
export async function expectJumpEqualsPlayed(ctx, page, { pages, slide, steps, id }) {
  const jumped = [];
  for (const step of steps) jumped.push(await htmlAfterJump(ctx, page, pages, slide, step, id));
  await openAnimated(ctx, page, pages, slide, steps[0]);
  assert.equal(await elementHtml(page, id), jumped[0], `${slide}/${id}: first step`);
  for (let i = 1; i < steps.length; i++) {
    await goTo(page, slide, steps[i]);
    assert.equal(await elementHtml(page, id), jumped[i], `${slide}/${id}: played to step '${steps[i]}' differs from a jump`);
  }
  assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
  assert.deepEqual(ctx.errors, []);
}

/** Arriving at step i-1 from step i (backward, so no motion) ends at the same html as a jump. */
export async function expectBackwardEqualsJump(ctx, page, { pages, slide, steps, id }) {
  for (let i = 1; i < steps.length; i++) {
    const jumped = await htmlAfterJump(ctx, page, pages, slide, steps[i - 1], id);
    await openAnimated(ctx, page, pages, slide, steps[i]);
    await goTo(page, slide, steps[i - 1]);
    assert.equal(await elementHtml(page, id), jumped, `${slide}/${id}: back from '${steps[i]}' to '${steps[i - 1]}' differs from a jump`);
  }
  assert.deepEqual(ctx.errors, []);
}

/**
 * Start an animated move from -> via, re-target to `to` 100 ms in, settle: the html equals a jump to `to`
 * and no element inside it keeps an inline style.
 */
export async function expectInterruptEqualsJump(ctx, page, { pages, slide, from, via, to, id }) {
  const jumped = await htmlAfterJump(ctx, page, pages, slide, to, id);
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
  assert.equal(await elementHtml(page, id), jumped, `${slide}/${id}: interrupted '${from}' -> '${via}' -> '${to}' differs from a jump`);
  const styled = await page.evaluate((id) => document.querySelectorAll(`[data-el="${id}"] [style]`).length, id);
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
