// What boot does in both shells: the tab title from deck.title, a step given as a string of digits, the reveal
// placeholder of a slide without a title, and a reveal shell that cannot be built.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/shell.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { deckPages } from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const pages = deckPages("test/fixtures/decks/shell/");
const reveal = (hash = "") => `test/fixtures/decks/shell/index.html${hash}`;
const TITLE = "Shell fixture: the deck title";

const settle = (page) => page.evaluate(() => window.STEPDECK.settled());
const where = (page) => page.evaluate(() => {
  const s = window.STEPDECK.state();
  const shown = [...document.querySelectorAll('[data-el="t"]')].filter((el) => el.closest("section")?.classList.contains("present") ?? true);
  const r = window.Reveal?.getIndices();
  return { slide: s?.slide, step: s?.step, text: shown.map((el) => el.textContent.trim()).join("|"), hash: location.hash, reveal: r ? [r.h, r.f ?? -1] : null, errors: window.STEPDECK.errors };
});

test("the tab title is deck.title in the bare shell and in the reveal shell", async () => {
  await withPage({ root, url: pages.url("plain") }, async (page, ctx) => {
    assert.equal(await page.title(), TITLE, "bare shell");
    await ctx.open(reveal());
    assert.equal(await page.title(), TITLE, "reveal shell: deck.title, not the <title> of index.html");
    // A deck that does not load keeps the page's own title.
    await ctx.open("engine/core/render.html?deck=../../test/fixtures/decks/nope/");
    assert.equal(await page.title(), "stepdeck · render");
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("goTo with a string of digits is the step index: bare shell", async () => {
  await withPage({ root, url: pages.url("plain") }, async (page) => {
    await page.evaluate(() => window.STEPDECK.goTo("plain", "2"));
    await settle(page);
    assert.deepEqual(await where(page), { slide: "plain", step: 2, text: "two", hash: "", reveal: null, errors: [] });
    await page.evaluate(() => window.STEPDECK.goTo("plain", "01"));
    await settle(page);
    assert.equal((await where(page)).text, "one");
    // Out of range is still an error, and the slide stays where it is.
    await page.evaluate(() => window.STEPDECK.goTo("plain", "7"));
    await settle(page);
    const s = await where(page);
    assert.equal(s.text, "one");
    assert.deepEqual(s.errors, ["plain: unknown step '7' in slide 'plain'"]);
  });
});

test("goTo with a string of digits is the step index: reveal, the engine, the screen and the hash agree", async () => {
  await withPage({ root, url: reveal() }, async (page, ctx) => {
    assert.deepEqual(await where(page), { slide: "plain", step: 0, text: "zero", hash: "#/plain/0", reveal: [0, -1], errors: [] });
    await page.evaluate(() => window.STEPDECK.goTo("plain", "2"));
    await settle(page);
    assert.deepEqual(await where(page), { slide: "plain", step: 2, text: "two", hash: "#/plain/2", reveal: [0, 1], errors: [] });
    await page.evaluate(() => window.STEPDECK.goTo("plain", "1"));
    await settle(page);
    assert.deepEqual(await where(page), { slide: "plain", step: 1, text: "one", hash: "#/plain/1", reveal: [0, 0], errors: [] });
    // Another slide and back, by string.
    await page.evaluate(() => window.STEPDECK.goTo("middle", "0"));
    await settle(page);
    await page.evaluate(() => window.STEPDECK.goTo("plain", "2"));
    await settle(page);
    assert.deepEqual(await where(page), { slide: "plain", step: 2, text: "two", hash: "#/plain/2", reveal: [0, 1], errors: [] });
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("reveal placeholder: a slide without a title shows its id", async () => {
  await withPage({ root, url: reveal() }, async (page) => {
    const placeholders = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".reveal .slides > section")].map((s) => [s.dataset.sdSlide, s.querySelector(".sd-placeholder")?.textContent ?? null])));
    assert.deepEqual(placeholders, { plain: null, middle: null, notitle: "notitle" }, "plain and its neighbour are mounted; notitle is not");
  });
});

test("a reveal shell that cannot be built is a fatal error on the canvas, not a blank page", async () => {
  await withPage({ root }, async (page, ctx) => {
    await page.route("**/vendor/reveal/reveal.js", (route) => route.abort());
    await ctx.open(reveal());
    const shown = await page.evaluate(() => {
      const el = document.querySelector(".sd-canvas .sd-slide-error");
      const r = el?.getBoundingClientRect();
      return { text: el?.textContent ?? null, visible: Boolean(r && r.width > 0 && r.height > 0), errors: window.STEPDECK.errors };
    });
    assert.match(shown.text ?? "", /^stepdeck: cannot start the reveal shell: .*reveal\.js/);
    assert.equal(shown.visible, true);
    assert.deepEqual(shown.errors, [shown.text]);
  });
});

test("a layout that failed to load once is loaded again for the next slide that uses it", async () => {
  await withPage({ root }, async (page, ctx) => {
    let failures = 1;
    await page.route("**/layouts/full-bleed/layout.css", (route) => (failures-- > 0 ? route.abort() : route.continue()));
    await ctx.open(pages.url("plain"));
    assert.match((await page.evaluate(() => window.STEPDECK.errors)).join("\n"), /^plain: layout 'full-bleed' not found/);
    await page.evaluate(() => window.STEPDECK.goTo("middle", 0));
    await settle(page);
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), [], "the failure was not cached");
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".sd-canvas")).display), "grid");
  });
});
