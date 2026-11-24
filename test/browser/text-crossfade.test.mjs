// The `text` crossfade and the box-only entrance, in Chrome. Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/text-crossfade.test.mjs
//
// Each check samples the page once per animation frame inside one page.evaluate, from the moment a step is
// asked for until it settles, so it holds however late a timer fires.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { deckPages, expectJumpEqualsPlayed, expectInterruptEqualsJump, settled } from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const pages = deckPages("test/fixtures/decks/text-crossfade/");

/**
 * In the page: STEPDECK.goTo("words", step), then one sample per animation frame of each element in `ids` until
 * the step settles and two frames more. A sample is { t (ms since the call), text, opacity (the paragraph's
 * computed opacity), inline (its style attribute), box (the element's computed opacity), visible }.
 */
const playSampled = (page, step, ids) =>
  page.evaluate(async ([step, ids]) => {
    const read = (t) => ids.map((id) => {
      const el = document.querySelector(`[data-el="${id}"]`);
      const p = el.querySelector("p.sd-text");
      return {
        t,
        text: p.textContent,
        opacity: Number(getComputedStyle(p).opacity),
        inline: p.getAttribute("style"),
        box: Number(getComputedStyle(el).opacity),
        visible: getComputedStyle(el).visibility === "visible",
      };
    });
    const start = performance.now();
    const frames = [];
    let done = false;
    const tick = () => {
      if (done) return;
      frames.push(read(performance.now() - start));
      requestAnimationFrame(tick);
    };
    const moved = window.STEPDECK.goTo("words", step).then(() => window.STEPDECK.settled());
    requestAnimationFrame(tick);
    await moved;
    for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(r));
    done = true;
    return { frames, end: read(performance.now() - start) };
  }, [step, ids]);

const clean = async (page, ctx) => {
  assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
  assert.deepEqual(ctx.errors, []);
};

/** The span (ms) over which the paragraph is not at full opacity, from the frames of `ids[index]`. */
const dimmedSpan = (frames, index) => {
  const dim = frames.filter((f) => f[index].opacity < 1).map((f) => f[index].t);
  return dim.length ? Math.max(...dim) - Math.min(...dim) : 0;
};

test("text crossfade dips and lands", async () => {
  await withPage({ root, url: pages.url("words", "step=start&motion=full") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true, "the page animates");
    const { frames, end } = await playSampled(page, "change", ["line"]);
    const line = frames.map((f) => f[0]);
    const lowest = line.reduce((a, b) => (b.opacity < a.opacity ? b : a));
    assert.ok(lowest.opacity < 0.2, `the paragraph dips close to invisible (lowest ${lowest.opacity})`);
    // Until the dip it shows the old text; once the text is new it never goes back.
    const swap = line.findIndex((f) => f.text === "The new words");
    assert.ok(swap > 0, "the text swaps during the move, not before it");
    assert.ok(line.slice(0, swap).every((f) => f.text === "The old words"), "only the old text before the swap");
    assert.ok(line.slice(swap).every((f) => f.text === "The new words"), "only the new text after the swap");
    assert.ok(line[swap].opacity < 0.5, `the swap happens while it is dim (${line[swap].opacity})`);
    assert.ok(line[0].opacity > 0.9, `it starts at full opacity (${line[0].opacity})`);
    assert.equal(end[0].text, "The new words");
    assert.equal(end[0].opacity, 1);
    assert.equal(end[0].inline, null, "no inline style left");
    // Two halves of --sd-duration-fast (200 ms) each: well under the 400 ms of a full-length fade, not instant.
    const span = dimmedSpan(frames, 0);
    assert.ok(span >= 250 && span < 1500, `the dip lasts about 400 ms (${span})`);
    await clean(page, ctx);
  });
});

test("text crossfade with a transition duration: each half is duration / 2", async () => {
  await withPage({ root, url: pages.url("words", "step=change&motion=full") }, async (page, ctx) => {
    const { frames, end } = await playSampled(page, "slow", ["line"]);
    const line = frames.map((f) => f[0]);
    const swap = line.findIndex((f) => f.text === "The slowest words");
    assert.ok(swap > 0);
    // The swap sits near the middle of the 600 ms: not at 200 ms (the token) and not at the very end.
    assert.ok(line[swap].t >= 250, `the old text stays for about 300 ms (swapped at ${line[swap].t})`);
    const span = dimmedSpan(frames, 0);
    assert.ok(span >= 480 && span < 2000, `the whole dip lasts about 600 ms (${span})`);
    assert.equal(end[0].text, "The slowest words");
    assert.equal(end[0].inline, null);
    await clean(page, ctx);
  });
});

test("entering text is moved by its box, not by itself", async () => {
  await withPage({ root, url: pages.url("words", "step=start&motion=full") }, async (page, ctx) => {
    const { frames, end } = await playSampled(page, "change", ["late"]);
    const late = frames.map((f) => f[0]);
    assert.ok(late.every((f) => f.inline === null), "the paragraph never gets an inline style");
    assert.ok(late.every((f) => f.opacity === 1), "its own opacity stays 1 throughout");
    // It enters with the step's text already in place: no crossfade from the text it had while hidden.
    assert.ok(late.every((f) => f.text === "Late, after"), "only the text of the step it enters on");
    // The box does the moving.
    assert.ok(late.some((f) => f.visible && f.box < 1), `the box fades in (${late.map((f) => f.box).slice(0, 12)})`);
    assert.equal(end[0].box, 1);
    assert.equal(end[0].visible, true);
    await clean(page, ctx);
  });
});

test("text: played equals jumped, and an interrupted crossfade lands on the final text", async () => {
  await withPage({ root, url: pages.url("words", "step=start") }, async (page, ctx) => {
    for (const id of ["line", "late"]) {
      await expectJumpEqualsPlayed(ctx, page, { pages, slide: "words", steps: ["start", "change", "slow"], id });
    }
    for (const id of ["line", "late"]) {
      await expectInterruptEqualsJump(ctx, page, { pages, slide: "words", from: "start", via: "change", to: "slow", id });
    }
    await settled(page);
    await clean(page, ctx);
  });
});

test("a change of `accent` alone, or of `role` alone, swaps at once: no crossfade, no colour tween", async () => {
  await withPage({ root, url: pages.url("words", "step=slow&motion=full") }, async (page, ctx) => {
    const { frames, end } = await playSampled(page, "plain", ["mark", "tag"]);
    const mark = frames.map((f) => f[0]);
    assert.ok(mark.every((f) => f.opacity === 1 && f.inline === null), `the paragraph never fades (${mark.map((f) => f.opacity).slice(0, 12)})`);
    assert.equal(end[0].text, "The *marked* words", "without accent the asterisks show as written");
    // The badge keeps its tone's two colours until its role changes, then has none: nothing in between.
    const tag = frames.map((f) => f[1]);
    const inlines = [...new Set(tag.map((f) => f.inline))];
    assert.ok(inlines.length <= 2 && inlines.at(-1) === null, `the colours are never tweened (${JSON.stringify(inlines.slice(0, 4))})`);
    assert.ok(tag.every((f) => f.opacity === 1));
    assert.equal(end[1].inline, null);
    await clean(page, ctx);
  });
  await withPage({ root, url: pages.url("words", "step=start") }, async (page, ctx) => {
    for (const id of ["mark", "tag"]) await expectJumpEqualsPlayed(ctx, page, { pages, slide: "words", steps: ["slow", "plain"], id });
  });
});
