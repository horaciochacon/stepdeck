// gallery.slope in Chrome: the gallery's custom component (site/gallery/components/gallery.slope/), a slope chart built
// only from what the engine hands every component (ctx.chart and the rest), with no import. It must move and end like
// a built-in: played equals jumped, one value scale for every step, labels that slide to their new rank, and an owned
// entrance that draws the lines. The entrance runs in a temporary deck with a copied engine (as `stepdeck new` makes),
// where the slope appears on a step: the component works from a deck's stepdeck/ copy too.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/custom-slope.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deckTarget, withPage } from "../../cli/browser.js";
import { copyEngine } from "../../cli/engine.js";
import {
  deckPages, goTo, elementHtml, htmlAfterJump, sampleFrames,
  expectJumpEqualsPlayed, expectBackwardEqualsJump, expectInterruptEqualsJump,
} from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const gallery = deckPages("site/gallery/");
const SLIDE = "custom-slope";
const STEPS = ["y2010", "y2020", "y2030", "highlight"];
// site/gallery/data/slope.csv in descending order of y2030: the right labels' order from top to bottom at that step.
const RANK_2030 = ["Coastal", "North", "Central", "South", "West", "East", "Valley", "Highland"];

const errorsClean = async (page, ctx) => {
  assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
  assert.deepEqual(ctx.errors, []);
};

// Where everything sits: the two axes' x, every dot's cy and every label's y, by category and side.
const layoutOf = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-el="slope"]');
    const by = (selector, attr) => Object.fromEntries([...el.querySelectorAll(selector)].map((n) => [`${n.dataset.key}|${n.dataset.side}`, Number(n.getAttribute(attr))]));
    return {
      axes: [...el.querySelectorAll("line[data-axis]")].map((l) => [l.dataset.axis, Number(l.getAttribute("x1")), Number(l.getAttribute("y2"))]),
      dots: by("circle[data-key]", "cy"),
      labels: by("text[data-key]", "y"),
      font: Number(el.querySelector("[font-size]")?.getAttribute("font-size")),
    };
  });

test("slope: jump equals played, backward, interrupted", async () => {
  await withPage({ root }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages: gallery, slide: SLIDE, steps: STEPS, id: "slope" });
    await expectBackwardEqualsJump(ctx, page, { pages: gallery, slide: SLIDE, steps: STEPS, id: "slope" });
    await expectInterruptEqualsJump(ctx, page, { pages: gallery, slide: SLIDE, from: "y2010", via: "y2020", to: "y2030", id: "slope" });
    await expectInterruptEqualsJump(ctx, page, { pages: gallery, slide: SLIDE, from: "y2020", via: "y2030", to: "highlight", id: "slope" });
    await errorsClean(page, ctx);
  });
});

test("the axis is the same at every step", async () => {
  await withPage({ root, url: gallery.url(SLIDE, "step=y2010") }, async (page, ctx) => {
    const at = {};
    for (const step of STEPS) {
      await goTo(page, SLIDE, step);
      at[step] = await layoutOf(page);
    }
    const first = at.y2010;
    assert.equal(Object.keys(first.dots).length, 16, "a dot at each end of 8 lines");
    assert.deepEqual(first.axes.map(([side]) => side), ["left", "right"]);
    for (const step of STEPS) {
      assert.deepEqual(at[step].axes, first.axes, `${step}: the two axes stay put`);
      for (const [key, cy] of Object.entries(first.dots)) {
        if (key.endsWith("|left")) assert.equal(at[step].dots[key], cy, `${step}: ${key} keeps its place (left is y2010 at every step)`);
      }
    }
    // Right is y2010 too on the first step, so each right dot is level with its left one: one scale on both sides.
    for (const key of Object.keys(first.dots).filter((k) => k.endsWith("|left"))) {
      assert.equal(first.dots[key.replace("|left", "|right")], first.dots[key], `${key}: level at y2010`);
    }
    // The scale covers y2030's extremes from the first step: no 2010 value reaches the top or the bottom of the plot.
    const ph = first.axes[0][2];
    const lefts = Object.entries(first.dots).filter(([k]) => k.endsWith("|left")).map(([, cy]) => cy);
    assert.ok(Math.min(...lefts) > 1 && Math.max(...lefts) < ph - 1, `2010 values sit inside the 2030 extent (${Math.min(...lefts)}..${Math.max(...lefts)} of 0..${ph})`);
    const rights = Object.entries(at.y2030.dots).filter(([k]) => k.endsWith("|right")).map(([, cy]) => cy);
    assert.ok(Math.abs(Math.min(...rights)) < 0.5 && Math.abs(Math.max(...rights) - ph) < 0.5, "2030 holds the extremes: top and bottom of the plot");
    await errorsClean(page, ctx);
  });
});

test("right labels slide to their new rank", async () => {
  await withPage({ root }, async (page, ctx) => {
    await ctx.open(gallery.url(SLIDE, "step=y2020"));
    const start = await layoutOf(page);
    await ctx.open(gallery.url(SLIDE, "step=y2030"));
    const end = await layoutOf(page);

    // At rest: the right labels read in rank order, top to bottom, and no two are closer than a line.
    const rights = RANK_2030.map((key) => end.labels[`${key}|right`]);
    for (let i = 1; i < rights.length; i++) {
      assert.ok(rights[i] > rights[i - 1], `${RANK_2030[i]} sits below ${RANK_2030[i - 1]} (${rights[i]} vs ${rights[i - 1]})`);
      assert.ok(rights[i] - rights[i - 1] >= end.font * 1.15 - 0.01, `${RANK_2030[i - 1]} and ${RANK_2030[i]} are a line apart`);
    }

    // Played: Coastal goes from fourth to first, its label passing through the places between.
    await ctx.open(gallery.url(SLIDE, "step=y2020&motion=full"));
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true, "the played run really animates");
    const r = await sampleFrames(page, SLIDE, "y2030", "slope", (el) => ({
      coastal: Number(el.querySelector('text[data-key="Coastal"][data-side="right"]').getAttribute("y")),
      text: el.querySelector('text[data-key="Coastal"][data-side="right"]').textContent,
    }));
    const [from, to] = [start.labels["Coastal|right"], end.labels["Coastal|right"]];
    assert.ok(from - to > end.font * 2, `Coastal climbs more than two lines (${from} -> ${to})`);
    const between = r.frames.filter((f) => f.coastal < from - 1 && f.coastal > to + 1);
    assert.ok(between.length > 0, `the label passes between ${from} and ${to}: ${JSON.stringify(r.frames.map((f) => f.coastal))}`);
    // 54% in 2020, 74% in 2030: a frame with neither is the value counting.
    assert.ok(r.frames.some((f) => /^\d+% Coastal$/.test(f.text) && !["54% Coastal", "74% Coastal"].includes(f.text)), "its value counts on the way");
    assert.equal(r.end.text, "74% Coastal");
    assert.equal(r.end.coastal, to, "it ends where a jump puts it");
    assert.ok(r.settledMs >= 400 && r.settledMs < 6000, `one morph over 2 x --sd-duration (${r.settledMs.toFixed(0)} ms)`);
    await errorsClean(page, ctx);
  });
});

// The owned entrance needs the slope to appear on a step: a temporary deck with a copied engine, the component and its
// data copied from the gallery, and slides where the slope enters on `go`: `enter` with the data it already has, `late`
// with another file, so its update awaits a fetch while the chart is already shown.
let tmp;
let deck;
before(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "stepdeck-slope-")));
  const dir = join(tmp, "deck");
  copyEngine(join(dir, "stepdeck"));
  cpSync(join(root, "site/gallery/components/gallery.slope"), join(dir, "components/gallery.slope"), { recursive: true });
  mkdirSync(join(dir, "data"));
  cpSync(join(root, "site/gallery/data/slope.csv"), join(dir, "data/slope.csv"));
  cpSync(join(root, "site/gallery/data/slope.csv"), join(dir, "data/slope-late.csv"));
  mkdirSync(join(dir, "slides"));
  const slide = (id, go) => ({
    id,
    layout: "full-bleed",
    title: "A slope that enters",
    elements: [
      { id: "slope", region: "main", type: "gallery.slope", from: "go",
        props: { data: "data/slope.csv", category: "region", left: "y2010", right: "y2030", format: ".0%" } },
    ],
    steps: [{ id: "start" }, { id: "go", ...go }],
  });
  writeFileSync(join(dir, "slides/enter.js"), `export default ${JSON.stringify(slide("enter", {}))};\n`);
  writeFileSync(join(dir, "slides/late.js"), `export default ${JSON.stringify(slide("late", { set: { slope: { data: "data/slope-late.csv" } } }))};\n`);
  writeFileSync(join(dir, "deck.js"), `export default ${JSON.stringify({ title: "slope", lang: "en", theme: "modern", components: ["gallery.slope"], slides: ["enter", "late"] })};\n`);
  const target = deckTarget(dir);
  deck = { root: target.root, url: (slide, query = "") => `${target.url({ slide })}${query ? `&${query}` : ""}` };
});
after(() => rmSync(tmp, { recursive: true, force: true }));

test("owned entrance draws the lines", async () => {
  await withPage({ root: deck.root, url: deck.url("enter", "step=start&motion=full") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    const r = await sampleFrames(page, "enter", "go", "slope", (el) => {
      const paths = [...el.querySelectorAll("path[data-key]")];
      return {
        lines: paths.length,
        offset: Number(paths[0]?.style.strokeDashoffset) || 0,
        dashed: paths.some((p) => p.style.strokeDasharray !== "" || p.style.strokeDashoffset !== ""),
      };
    });
    const shown = r.frames.filter((f) => f.visible);
    assert.ok(shown.length > 0, "the chart is shown");
    const first = shown[0];
    assert.equal(first.lines, 8, "one line per category");
    assert.ok(first.offset > 0, `the first frame with the chart shown has an undrawn line (dashoffset ${first.offset})`);
    assert.deepEqual(r.frames.filter((f) => f.style !== null).map((f) => f.style), [], "the box stays still: the chart draws itself");
    const drawing = shown.filter((f) => f.dashed);
    const span = drawing.at(-1).ms - first.ms;
    // A stall can only shorten the sampled span by delaying the first shown frame; 1 x --sd-duration would be 400.
    assert.ok(span >= 600 && span < 4000, `draws over 2 x --sd-duration, 800 ms (${span.toFixed(0)} ms)`);
    assert.equal(r.end.dashed, false, "no dash style left at the end");
    assert.equal(await elementHtml(page, "slope"), await htmlAfterJump(ctx, page, deck, "enter", "go", "slope"), "the end equals a jump");
    await errorsClean(page, ctx);
    assert.deepEqual(ctx.failed, []);
  });
});

test("the lines start undrawn before the update awaits its data", async () => {
  await withPage({ root: deck.root, url: deck.url("late", "step=start&motion=full") }, async (page, ctx) => {
    // The new file answers 1.5 s late: until then the chart is shown with the lines it had, which must not be drawn yet.
    await page.route("**/data/slope-late.csv", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    const r = await sampleFrames(page, "late", "go", "slope", (el) => {
      const paths = [...el.querySelectorAll("path[data-key]")];
      return { lines: paths.length, undrawn: paths.filter((p) => Number(p.style.strokeDashoffset) > 0).length };
    });
    const waiting = r.frames.filter((f) => f.visible && f.ms < 1000);
    assert.ok(waiting.length > 0, "the chart is shown while its data loads");
    assert.deepEqual(waiting.filter((f) => f.undrawn !== f.lines || f.lines !== 8), [], "every line is undrawn until the data arrives");
    assert.ok(r.settledMs >= 1500, `the update waited for the data (${r.settledMs.toFixed(0)} ms)`);
    assert.equal(r.end.undrawn, 0, "drawn at the end");
    assert.equal(await elementHtml(page, "slope"), await htmlAfterJump(ctx, page, deck, "late", "go", "slope"), "the end equals a jump");
    await errorsClean(page, ctx);
  });
});
