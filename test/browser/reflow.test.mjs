// A figure next to a `collapse: true` element is laid out again when that element appears or leaves
// (core/controller.js, reflow): the played step ends as a jump to it does.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/reflow.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { check } from "../../cli/check.js";
import { deckPages, goTo, elementHtml } from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const deckDir = fileURLToPath(new URL("../fixtures/decks/reflow/", import.meta.url));
const pages = deckPages("test/fixtures/decks/reflow/");

/** The figure's box, what it drew for it (the svg's size, or the terminal's line capacity) and its markup. */
const figure = async (page) => ({
  ...(await page.evaluate(() => {
    const box = document.querySelector('[data-el="fig"]');
    const svg = box.querySelector("svg");
    const term = box.querySelector(".sd-terminal");
    return {
      box: { w: box.offsetWidth, h: box.offsetHeight },
      svg: svg && { w: Math.round(svg.getBoundingClientRect().width / window.STEPDECK_SCALE), h: Math.round(svg.getBoundingClientRect().height / window.STEPDECK_SCALE) },
      capacity: term?.dataset.capacity ?? null,
      lines: term ? term.querySelectorAll(".sd-terminal-line").length : null,
    };
  })),
  html: await elementHtml(page, "fig"),
});

for (const slide of ["bar", "line", "diagram", "terminal"]) {
  test(`${slide}: a played step that shows a collapse note leaves the figure as a jump does`, async () => {
    await withPage({ root, url: pages.url(slide, "step=two") }, async (page, ctx) => {
      const scale = () => page.evaluate(() => (window.STEPDECK_SCALE = document.querySelector(".sd-canvas").getBoundingClientRect().width / 1920));
      await scale();
      const jumped = await figure(page);
      for (const motion of ["motion=full", "capture"]) {
        await ctx.open(pages.url(slide, `step=one&${motion}`));
        await scale();
        const wide = await figure(page);
        assert.ok(wide.box.h > jumped.box.h + 50, `${slide}: the note takes room from the figure (${wide.box.h} -> ${jumped.box.h})`);
        await goTo(page, slide, "two");
        const played = await figure(page);
        assert.deepEqual(played.box, jumped.box, `${slide} (${motion}): the box`);
        assert.deepEqual(played.svg, jumped.svg, `${slide} (${motion}): the svg is drawn for the box it has now`);
        assert.equal(played.capacity, jumped.capacity, `${slide} (${motion}): the terminal's line capacity`);
        assert.equal(played.lines, jumped.lines);
        assert.equal(played.html, jumped.html, `${slide} (${motion}): markup, played vs jumped`);
        if (played.svg) assert.ok(played.svg.h <= played.box.h, `${slide}: the svg fits its box (${played.svg.h} in ${played.box.h})`);
        // And back: the note leaves, the figure has its room again.
        await goTo(page, slide, "one");
        const back = await figure(page);
        assert.deepEqual({ box: back.box, svg: back.svg, capacity: back.capacity, html: back.html }, { box: wide.box, svg: wide.svg, capacity: wide.capacity, html: wide.html }, `${slide} (${motion}): back at step one`);
      }
      assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
      assert.deepEqual(ctx.errors, []);
    });
  });
}

test("a collapse note that leaves on a played step gives the chart its room back", async () => {
  await withPage({ root, url: pages.url("leave", "step=two") }, async (page, ctx) => {
    await page.evaluate(() => (window.STEPDECK_SCALE = document.querySelector(".sd-canvas").getBoundingClientRect().width / 1920));
    const jumped = await figure(page);
    await ctx.open(pages.url("leave", "step=one&motion=full"));
    await page.evaluate(() => (window.STEPDECK_SCALE = document.querySelector(".sd-canvas").getBoundingClientRect().width / 1920));
    await goTo(page, "leave", "two");
    const played = await figure(page);
    assert.deepEqual(played.svg, jumped.svg);
    assert.equal(played.html, jumped.html);
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
  });
});

test("check --played is clean on the reflow deck", async () => {
  assert.deepEqual(await check(deckDir, { played: true }), []);
});
