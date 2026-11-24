// A hidden element hides its descendants, even one that sets `visibility: visible`; its ghost placeholder still
// shows. Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/hidden-children.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { deckPages, goTo } from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const pages = deckPages("test/fixtures/decks/hidden-children/");

const visibilityOf = (page, selector) =>
  page.evaluate((sel) => {
    const node = document.querySelector(sel);
    return node ? getComputedStyle(node).visibility : null;
  }, selector);

test("a child with inline visibility: visible stays hidden while its element is hidden", async () => {
  await withPage({ root }, async (page, ctx) => {
    await ctx.open(pages.url("late", "step=before"));
    assert.equal(await page.evaluate(() => document.querySelector(".fixture-shouter").style.visibility), "visible", "the child asks to be visible");
    assert.equal(await visibilityOf(page, '[data-el="loud"]'), "hidden");
    assert.equal(await visibilityOf(page, ".fixture-shouter"), "hidden", "the engine forces the descendant hidden");
    assert.equal(await visibilityOf(page, '[data-el="loud"] > .sd-ghost'), "visible", "the ghost frame still shows");
    assert.equal(await visibilityOf(page, '[data-el="loud"] .sd-ghost-label'), "visible", "and so does its label");

    await goTo(page, "late", "shown");
    assert.equal(await visibilityOf(page, '[data-el="loud"]'), "visible");
    assert.equal(await visibilityOf(page, ".fixture-shouter"), "visible", "shown with its element");
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});
