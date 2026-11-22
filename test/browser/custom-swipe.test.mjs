// gallery.swipe in Chrome: the gallery's second custom component (site/gallery/components/gallery.swipe/), a before/after
// swipe of a map raster built only from what the engine hands every component (ctx.map, ctx.chart, ctx.motion), with no
// import. It must move and end like a built-in: played equals jumped (markup and pixels), the divider passes through
// the positions between its two ends, and `check` and `check --played` find nothing on its slide under both themes.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/custom-swipe.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deckTarget, withPage } from "../../cli/browser.js";
import { check } from "../../cli/check.js";
import { copyEngine } from "../../cli/engine.js";
import {
  deckPages, goTo, canvasPixels, sampleFrames,
  expectJumpEqualsPlayed, expectBackwardEqualsJump, expectInterruptEqualsJump,
} from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const gallery = deckPages("site/gallery/");
const SLIDE = "map-swipe";
const STEPS = ["before", "swipe", "after"];

const errorsClean = async (page, ctx) => {
  assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
  assert.deepEqual(ctx.errors, []);
};

// What the swipe shows now: each canvas by layer name (its data-*), the clip of the second, the divider's x and the width.
const stateOf = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-el="swipe"]');
    const layer = (name) => el.querySelector(`canvas[data-layer="${name}"]`);
    const data = (c) => ({ ...c.dataset });
    const line = el.querySelector("line");
    return {
      before: data(layer("before")), after: data(layer("after")), borders: data(layer("borders")),
      clip: layer("after").style.clipPath, plain: layer("before").style.clipPath,
      x: Number(line.getAttribute("x1")), w: Number(el.querySelector("svg").getAttribute("width")),
      labels: [...el.querySelectorAll("text")].map((t) => t.textContent),
    };
  });

const clipPercent = (clip) => Number(/(\d+(?:\.\d+)?)%\)$/.exec(clip)?.[1]);

test("swipe: played equals jumped, pixels too", async () => {
  await withPage({ root }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages: gallery, slide: SLIDE, steps: STEPS, id: "swipe" });
    await expectBackwardEqualsJump(ctx, page, { pages: gallery, slide: SLIDE, steps: STEPS, id: "swipe" });
    await expectInterruptEqualsJump(ctx, page, { pages: gallery, slide: SLIDE, from: "before", via: "swipe", to: "after", id: "swipe", keep: ".sd-legend-ramp" });
    await errorsClean(page, ctx);
  });
});

test("swipe: each step ends with the divider where its prop says, and the canvases say so", async () => {
  await withPage({ root, url: gallery.url(SLIDE, "step=before") }, async (page, ctx) => {
    const ends = { before: 1, swipe: 0.5, after: 0 };
    for (const step of STEPS) {
      await goTo(page, SLIDE, step);
      const s = await stateOf(page);
      const at = ends[step];
      assert.equal(s.after.at, at.toFixed(3), `${step}: data-at has 3 decimals`);
      assert.equal(s.after.frame, "2021");
      assert.equal(s.before.frame, "2010");
      assert.equal(s.before.at, undefined, "only the clipped canvas carries the divider");
      assert.equal(s.plain, "", "the first raster is not clipped");
      assert.ok(Math.abs(clipPercent(s.clip) - at * 100) < 0.06, `${step}: the second raster is clipped at ${at * 100}% (${s.clip})`);
      assert.ok(Math.abs(s.x / s.w - at) < 0.001, `${step}: the divider line is at ${at} (${s.x} of ${s.w})`);
      for (const c of [s.before, s.after, s.borders]) assert.match(c.sig, /^[0-9a-f]{8}$/, "every canvas carries its signature");
      assert.deepEqual(s.labels, ["2010", "2021"]);
    }
    // The pictures are two frames of one raster over the same regions: they differ, and the borders are a layer of their own.
    const [before, after, borders] = await canvasPixels(page, "swipe");
    assert.notEqual(before, after, "two frames, two pictures");
    assert.notEqual(borders, before);
    assert.notEqual((await stateOf(page)).before.sig, (await stateOf(page)).after.sig);
    await errorsClean(page, ctx);
  });
});

test("swipe: the divider passes intermediate positions", async () => {
  await withPage({ root, url: gallery.url(SLIDE, "step=before&motion=full") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true, "the played run really animates");
    const r = await sampleFrames(page, SLIDE, "swipe", "swipe", (el) => {
      const after = el.querySelector('canvas[data-layer="after"]');
      const line = el.querySelector("line");
      return { at: Number(after.dataset.at), clip: after.style.clipPath, x: Number(line.getAttribute("x1")), w: Number(el.querySelector("svg").getAttribute("width")) };
    });
    const between = r.frames.filter((f) => f.at > 0.52 && f.at < 0.98);
    assert.ok(between.length >= 3, `the divider passes between 1 and 0.5: ${JSON.stringify(r.frames.map((f) => f.at))}`);
    // It only moves one way, and the clip and the line follow the same position at every frame.
    const ats = r.frames.map((f) => f.at).filter((at) => !Number.isNaN(at));
    assert.deepEqual(ats, [...ats].sort((a, b) => b - a), "from 1 down to 0.5, never back");
    for (const f of between) {
      assert.ok(Math.abs(clipPercent(f.clip) - f.at * 100) < 0.06, `the clip follows data-at (${f.clip} vs ${f.at})`);
      assert.ok(Math.abs(f.x / f.w - f.at) < 0.001, `the line follows data-at (${f.x} of ${f.w} vs ${f.at})`);
    }
    assert.equal(r.end.at, 0.5, "it ends where a jump puts it");
    assert.ok(r.settledMs >= 400 && r.settledMs < 6000, `one morph over 2 x --sd-duration (${r.settledMs.toFixed(0)} ms)`);
    await errorsClean(page, ctx);
  });
});

test("swipe: a step that does not animate writes the end at once", async () => {
  await withPage({ root, url: gallery.url(SLIDE, "step=before") }, async (page, ctx) => {
    // The default run has no motion (reduced motion in the shell): the arrival is the end state, with no sample between.
    const r = await sampleFrames(page, SLIDE, "after", "swipe", (el) => ({ at: Number(el.querySelector('canvas[data-layer="after"]').dataset.at) }));
    assert.deepEqual(r.frames.filter((f) => f.at > 0 && f.at < 1), [], "no position between the two ends");
    assert.equal(r.end.at, 0);
    await errorsClean(page, ctx);
  });
});

// A swipe that starts collapsed (`display: none`, no layout) is drawn at the size it has when it appears, not at the zero
// box of its first update: a temporary deck with a copied engine, the component and its data, and a slide where the swipe
// comes in on `show` with `collapse: true`. The step before it is a jump away, and a played arrival ends where a jump does.
test("swipe: a swipe that starts collapsed is drawn at its size when it appears", async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "stepdeck-swipe-")));
  try {
    const dir = join(tmp, "deck");
    copyEngine(join(dir, "stepdeck"));
    cpSync(join(root, "site/gallery/components/gallery.swipe"), join(dir, "components/gallery.swipe"), { recursive: true });
    cpSync(join(root, "site/gallery/data/map"), join(dir, "data/map"), { recursive: true });
    mkdirSync(join(dir, "slides"));
    const slide = {
      id: "late", layout: "figure-notes", title: "A swipe that appears",
      elements: [
        { id: "swipe", region: "main", type: "gallery.swipe", from: "show", collapse: true,
          props: { boundaries: "data/map/regions.geojson", raster: "data/map/years.json", before: "2010", after: "2021", at: 0.5 } },
        { id: "note", region: "notes", type: "text", props: { role: "note", text: "The swipe is not there on the first step." } },
        { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
      ],
      steps: [{ id: "start" }, { id: "show" }],
    };
    writeFileSync(join(dir, "slides/late.js"), `export default ${JSON.stringify(slide)};\n`);
    writeFileSync(join(dir, "deck.js"), `export default ${JSON.stringify({ title: "swipe", lang: "en", theme: "modern", components: ["gallery.swipe"], slides: ["late"] })};\n`);
    const target = deckTarget(dir);
    const pages = { url: (slide, query = "") => `${target.url({ slide })}${query ? `&${query}` : ""}` };
    await withPage({ root: target.root }, async (page, ctx) => {
      await expectJumpEqualsPlayed(ctx, page, { pages, slide: "late", steps: ["start", "show"], id: "swipe" });
      await ctx.open(pages.url("late", "step=show"));
      const size = await page.evaluate(() => {
        const el = document.querySelector('[data-el="swipe"]');
        const canvas = el.querySelector('canvas[data-layer="after"]');
        return { w: el.offsetWidth, h: el.offsetHeight, canvas: [canvas.width, canvas.height], svg: Number(el.querySelector("svg").getAttribute("height")) };
      });
      assert.ok(size.w > 100 && size.h > 100, `the swipe has a box (${size.w} x ${size.h})`);
      assert.deepEqual(size.canvas, [size.w, size.h], "the canvases are the size of the box it has now");
      assert.equal(size.svg, size.h, "so is the divider's SVG");
      await errorsClean(page, ctx);
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

for (const theme of ["modern", "academic-light"]) {
  test(`swipe: check and check --played are clean under ${theme}`, async () => {
    const deck = join(root, "site/gallery");
    assert.deepEqual(await check(deck, { slide: SLIDE, theme }), []);
    assert.deepEqual(await check(deck, { slide: SLIDE, played: true, theme }), []);
  });
}
