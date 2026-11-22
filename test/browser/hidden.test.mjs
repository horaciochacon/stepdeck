// A hidden page never animates, and hiding the page snaps motion in flight to its end, in Chrome. Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/hidden.test.mjs
//
// The test page is never really hidden: `hide` redefines document.visibilityState and fires the event the browser
// would, which is all the engine listens to. The `slow` slide of the motion fixture moves its bars over 3 s.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { deckPages, elementHtml, htmlAfterJump, sampleFrames, settled } from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const pages = deckPages("test/fixtures/decks/motion/");

/** Makes the page report itself hidden and fires visibilitychange, as a browser does when a tab is covered. */
const hide = (page) =>
  page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

const clean = async (page, ctx) => {
  assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
  assert.deepEqual(ctx.errors, []);
};

test("hidden mid-motion: end state at once, no errors", async () => {
  await withPage({ root }, async (page, ctx) => {
    const jumped = await htmlAfterJump(ctx, page, pages, "slow", "high", "bars");
    await ctx.open(pages.url("slow", "step=low&motion=full"));
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true, "the played run really animates");
    // No `return`: evaluate would otherwise wait for the whole 3 s move.
    await page.evaluate(() => { window.STEPDECK.goTo("slow", "high"); });
    await page.waitForTimeout(300);
    assert.notEqual(await elementHtml(page, "bars"), jumped, "the move is under way when the page is hidden");
    const arrived = await page.evaluate(async (jumped) => {
      const bars = () => document.querySelector('[data-el="bars"]').outerHTML;
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      const t0 = performance.now();
      document.dispatchEvent(new Event("visibilitychange"));
      while (bars() !== jumped && performance.now() - t0 < 2000) await new Promise((r) => setTimeout(r, 10));
      return bars() === jumped ? performance.now() - t0 : null;
    }, jumped);
    assert.notEqual(arrived, null, "within 2 s of the event (the move has 2.7 s left) the bars are in their end state");
    await settled(page);
    assert.equal(await elementHtml(page, "bars"), jumped, "and they stay there");
    await clean(page, ctx);
  });
});

test("hidden page: a goTo renders the end state at once", async () => {
  await withPage({ root }, async (page, ctx) => {
    const jumped = await htmlAfterJump(ctx, page, pages, "slow", "high", "bars");
    await ctx.open(pages.url("slow", "step=low&motion=full"));
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true, "the page would animate if it were visible");
    await hide(page);
    const r = await sampleFrames(page, "slow", "high", "bars", (el) => ({ html: el.outerHTML }));
    assert.equal(r.frames[0].html, jumped, "the first sampled frame already equals the jump");
    assert.ok(r.frames.every((f) => f.html === jumped), "no frame shows a state in between");
    assert.ok(r.settledMs < 1500, `settled at once, not after the 3 s move (${r.settledMs.toFixed(0)} ms)`);
    assert.equal(await elementHtml(page, "bars"), jumped);
    await clean(page, ctx);
  });
});
