// gallery.where in Chrome: the gallery's third custom component (site/gallery/components/gallery.where/), a bar chart
// drawn with ctx.chart that carries a compact `diagram` in its top-right corner, mounted with ctx.mount from the
// shared process definition and lit at the stage the step names. It proves the second-view convention is open to
// custom components: the compact copy is the built-in's own, drawn in the theme's frame, and it must move and end like
// one: played equals jumped, the same grid at every step (the caption is never empty), a copy of its own beside the
// chart's SVG (never inside it), and `check` and `check --played` find nothing on its slide under both themes. The
// bars are the values of the stage the copy lights (data/story-stages.csv has a column per stage), and the slide's
// note says what they are at each step.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/custom-where.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { withPage } from "../../cli/browser.js";
import { check } from "../../cli/check.js";
import { deckPages, goTo, sampleFrames, expectJumpEqualsPlayed, expectBackwardEqualsJump, expectInterruptEqualsJump } from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const gallery = deckPages("site/gallery/");
const SLIDE = "custom-where";
const STEPS = ["survey", "fit", "predict"];
// The stage each step names, and the caption the compact copy carries (site/gallery/data/process.json labels).
const STAGE = { survey: "survey", fit: "fit", predict: "predict" };
const CAPTION = { survey: "Stage: Survey", fit: "Stage: Fit", predict: "Stage: Predict" };
// The value over each bar at each step: the stage's own column of data/story-stages.csv, read in Node, as ",.1f" writes it.
const [HEAD, ...ROWS] = readFileSync(join(root, "site/gallery/data/story-stages.csv"), "utf8").trim().split("\n").map((line) => line.split(","));
const VALUES = Object.fromEntries(STEPS.map((step) => [step, Object.fromEntries(ROWS.map((r) => [r[0], Number(r[HEAD.indexOf(STAGE[step])]).toFixed(1)]))]));

// Inline styles that are content, written the same by a jump: the copy's own place and size, and what a compact
// diagram writes at build time (each kind's colour and tint).
const KEEP = '[data-part="copy"], .sd-diagram-paint, .sd-diagram-body';

const errorsClean = async (page, ctx) => {
  assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
  assert.deepEqual(ctx.errors, []);
};

// The compact diagram's state: which nodes are lit (data-dim "false"), its caption, where each node sits and where the
// copy is (its own HTML element, whether the chart's SVG contains it), the chart's bar heights and the values over the
// bars, and the slide's note.
const stateOf = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-el="where"]');
    const svg = el.querySelector("svg[data-compact]");
    const box = (n) => { const r = n.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 100) / 100); };
    const chart = [...el.querySelectorAll("svg")].find((s) => !s.hasAttribute("data-compact"));
    return {
      compact: svg?.getAttribute("data-compact") ?? null,
      lit: [...el.querySelectorAll('g[data-part="node"]')].filter((g) => g.dataset.dim === "false").map((g) => g.dataset.id),
      nodes: Object.fromEntries([...el.querySelectorAll('g[data-part="node"]')].map((g) => [g.dataset.id, box(g)])),
      caption: svg?.querySelector(".sd-second-view-caption")?.textContent ?? null,
      copy: svg ? box(svg) : null,
      insideChart: Boolean(svg && chart?.contains(svg)),
      chartBox: chart ? box(chart) : null,
      bars: Object.fromEntries([...el.querySelectorAll("rect[data-key]")].map((r) => [r.dataset.key, Number(r.getAttribute("height"))])),
      values: Object.fromEntries([...el.querySelectorAll('g[data-layer="values"] text')].map((t) => [t.dataset.key, t.textContent])),
      note: document.querySelector('[data-el="note"]')?.textContent.trim() ?? null,
    };
  });

test("where: played equals jumped, backward, interrupted", async () => {
  await withPage({ root }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages: gallery, slide: SLIDE, steps: STEPS, id: "where" });
    await expectBackwardEqualsJump(ctx, page, { pages: gallery, slide: SLIDE, steps: STEPS, id: "where" });
    await expectInterruptEqualsJump(ctx, page, { pages: gallery, slide: SLIDE, from: "survey", via: "fit", to: "predict", id: "where", keep: KEEP });
    await errorsClean(page, ctx);
  });
});

test("where: the mounted compact diagram lights the stage the step names", async () => {
  await withPage({ root, url: gallery.url(SLIDE, "step=survey") }, async (page, ctx) => {
    const at = {};
    for (const step of STEPS) {
      await goTo(page, SLIDE, step);
      at[step] = await stateOf(page);
      const s = at[step];
      assert.equal(s.compact, "true", `${step}: the copy is the built-in compact diagram`);
      assert.deepEqual(s.lit, [STAGE[step]], `${step}: only the named stage is lit`);
      assert.equal(s.caption, CAPTION[step], `${step}: the caption names the stage`);
      assert.deepEqual(s.values, VALUES[step], `${step}: the bars show the values of the stage the copy lights`);
      assert.equal(s.insideChart, false, `${step}: the copy is beside the chart's SVG, not inside it`);
    }
    // The copy sits in the top-right corner of the element, clear of the chart's plot, and the same size at every step.
    const first = at.survey;
    const el = await page.evaluate(() => { const r = document.querySelector('[data-el="where"]').getBoundingClientRect(); return { right: r.right, top: r.top }; });
    assert.ok(Math.abs(first.copy[0] + first.copy[2] - el.right) < 2 && Math.abs(first.copy[1] - el.top) < 2, `top right corner (${first.copy} in ${JSON.stringify(el)})`);
    assert.ok(Object.keys(first.nodes).length === 6, "the whole process is drawn, six nodes");
    assert.equal(new Set(STEPS.map((step) => at[step].note)).size, STEPS.length, `the note says what the bars are at each step: ${STEPS.map((step) => at[step].note).join(" | ")}`);
    for (const step of STEPS) {
      // The caption is never empty, so the grid never moves: the same boxes at every step, played or jumped.
      assert.deepEqual(at[step].nodes, first.nodes, `${step}: every node keeps its place`);
      assert.deepEqual(at[step].copy, first.copy, `${step}: the copy keeps its box`);
    }
    await errorsClean(page, ctx);
  });
});

test("where: a played step moves the bars through the heights between", async () => {
  await withPage({ root, url: gallery.url(SLIDE, "step=survey") }, async (page, ctx) => {
    const start = (await stateOf(page)).bars;
    await goTo(page, SLIDE, "fit");
    const end = (await stateOf(page)).bars;
    await ctx.open(gallery.url(SLIDE, "step=survey&motion=full"));
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true, "the played run really animates");
    const r = await sampleFrames(page, SLIDE, "fit", "where", (el) => ({
      north: Number(el.querySelector('rect[data-key="North"]').getAttribute("height")),
      litFit: el.querySelector('svg[data-compact] g[data-id="fit"]')?.dataset.dim,
    }));
    assert.ok(end.North > start.North + 10, `North grows from survey to fit (${start.North} -> ${end.North})`);
    assert.ok(r.frames.some((f) => f.north > start.North + 1 && f.north < end.North - 1), `a frame between ${start.North} and ${end.North}: ${JSON.stringify(r.frames.map((f) => f.north))}`);
    assert.equal(r.end.north, end.North, "it ends where a jump puts it");
    assert.equal(r.end.litFit, "false", "and the stage is lit");
    assert.ok(r.settledMs >= 400 && r.settledMs < 6000, `one morph (${r.settledMs.toFixed(0)} ms)`);
    await errorsClean(page, ctx);
  });
});

for (const theme of ["modern", "academic-light"]) {
  test(`where: check and check --played are clean under ${theme}`, async () => {
    const deck = join(root, "site/gallery");
    assert.deepEqual(await check(deck, { slide: SLIDE, theme }), []);
    assert.deepEqual(await check(deck, { slide: SLIDE, played: true, theme }), []);
  });
}
