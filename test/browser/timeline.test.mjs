// `timeline` in Chrome (slide kit 1, task 6). Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test --test-concurrency=1 test/browser/timeline.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { check } from "../../cli/check.js";
import { formatProblem } from "../../cli/problems.js";
import {
  deckPages,
  goTo,
  expectJumpEqualsPlayed,
  expectBackwardEqualsJump,
  expectInterruptEqualsJump,
  expectAnimatedStepMoves,
} from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const deck = fileURLToPath(new URL("../fixtures/decks/timeline/", import.meta.url));
const pages = deckPages("test/fixtures/decks/timeline/");
const STEPS = ["start", "half", "most", "full"];

// What a viewer sees: fill length against track length, and each stop's state.
const geometry = (page, slideEl = "tl") =>
  page.evaluate((id) => {
    const el = document.querySelector(`[data-el="${id}"]`);
    const track = el.querySelector(".sd-timeline-track").getBoundingClientRect();
    const fill = el.querySelector(".sd-timeline-fill").getBoundingClientRect();
    return { track: track.width, fill: fill.width, ratio: fill.width / track.width };
  }, slideEl);
const stops = (page, id = "tl") =>
  page.evaluate((id) => {
    const el = document.querySelector(`[data-el="${id}"]`);
    const accent = getComputedStyle(document.querySelector(".sd-canvas")).getPropertyValue("--sd-color-accent").trim();
    return [...el.querySelectorAll(".sd-timeline-stop")].map((c) => {
      const cs = getComputedStyle(c);
      return { reached: c.dataset.reached === "true", current: c.dataset.current === "true", r: parseFloat(cs.r), fill: cs.fill, accent };
    });
  }, id);

test("jump equals played", async () => {
  await withPage({ root, url: pages.url("fill", "step=start") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "fill", steps: STEPS, id: "tl" });
  });
});

test("backward equals jump", async () => {
  await withPage({ root, url: pages.url("fill", "step=start") }, async (page, ctx) => {
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "fill", steps: STEPS, id: "tl" });
  });
});

test("interrupt mid-motion equals jump", async () => {
  await withPage({ root, url: pages.url("fill", "step=start") }, async (page, ctx) => {
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "fill", from: "start", via: "half", to: "full", id: "tl" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "fill", from: "half", via: "most", to: "start", id: "tl" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "fill", from: "most", via: "full", to: "half", id: "tl" });
  });
});

test("animated step moves: the fill is part-way and a stop lights up as it passes", async () => {
  await withPage({ root, url: pages.url("fill", "step=start") }, async (page, ctx) => {
    const probe = (p) => p.evaluate(() => {
      const el = document.querySelector('[data-el="tl"]');
      return `${el.querySelector(".sd-timeline-fill").getAttribute("x2")}|${[...el.querySelectorAll(".sd-timeline-stop")].map((c) => c.dataset.reached).join(",")}`;
    });
    const { mid, end } = await expectAnimatedStepMoves(ctx, page, { pages, slide: "fill", from: "start", to: "half", id: "tl", probe });
    assert.match(mid, /\|true,false,false,false$/, "the second stop is not lit before the fill reaches it");
    assert.match(end, /\|true,true,false,false$/);
  });
});

test("fill width matches progress", async () => {
  await withPage({ root, url: pages.url("fill", "step=half") }, async (page, ctx) => {
    let g = await geometry(page);
    assert.ok(Math.abs(g.fill - g.track / 2) <= 2, `half: fill ${g.fill} of track ${g.track}`);
    for (const [step, p] of [["start", 0], ["most", 0.8], ["full", 1]]) {
      await ctx.open(pages.url("fill", `step=${step}`));
      g = await geometry(page);
      assert.ok(Math.abs(g.fill - g.track * p) <= 2, `${step}: fill ${g.fill} of track ${g.track}`);
    }
    assert.deepEqual(ctx.errors, []);
  });
  await withPage({ root, url: pages.url("spaced", "") }, async (page) => {
    const g = await geometry(page);
    assert.ok(Math.abs(g.fill - g.track * 0.4) <= 2, `spaced: fill ${g.fill} of track ${g.track}`);
  });
});

test("stops light up as the fill passes them; the current one is emphasised", async () => {
  await withPage({ root, url: pages.url("fill", "step=half") }, async (page, ctx) => {
    let s = await stops(page);
    assert.deepEqual(s.map((x) => x.reached), [true, true, false, false]);
    assert.deepEqual(s.map((x) => x.current), [false, true, false, false]);
    assert.ok(s[0].fill !== s[2].fill, "a reached stop is filled, an unreached one is not");
    assert.ok(s[2].fill === "rgb(255, 255, 255)" || s[2].fill.startsWith("rgb"), "unreached is hollow (background fill)");
    assert.ok(s[1].r > s[0].r && s[1].r > s[2].r, `the current stop is larger: ${s.map((x) => x.r)}`);
    const weights = await page.evaluate(() => [...document.querySelectorAll('[data-el="tl"] .sd-timeline-text')].map((n) => parseInt(getComputedStyle(n).fontWeight, 10)));
    assert.ok(weights[1] > weights[0] && weights[1] > weights[2], `current label is bold: ${weights}`);
    await ctx.open(pages.url("fill", "step=start"));
    assert.deepEqual((await stops(page)).map((x) => x.reached), [true, false, false, false]);
    await ctx.open(pages.url("spaced", ""));
    assert.deepEqual((await stops(page)).map((x) => x.reached), [true, true, true, false], "a stop is reached when the fill meets it");
    assert.deepEqual(ctx.errors, []);
  });
});

test("going backward retracts the fill and dims the stops", async () => {
  await withPage({ root, url: pages.url("fill", "step=full&motion=full") }, async (page) => {
    assert.deepEqual((await stops(page)).map((x) => x.reached), [true, true, true, true]);
    await goTo(page, "fill", "half");
    assert.deepEqual((await stops(page)).map((x) => x.reached), [true, true, false, false]);
    const g = await geometry(page);
    assert.ok(Math.abs(g.fill - g.track / 2) <= 2);
    await goTo(page, "fill", "start");
    assert.deepEqual((await stops(page)).map((x) => x.reached), [true, false, false, false]);
    assert.ok((await geometry(page)).fill <= 2);
  });
});

test("dashed: the unfilled track is dashed, the fill stays solid", async () => {
  await withPage({ root, url: pages.url("dashed", "") }, async (page) => {
    const r = await page.evaluate(() => {
      const el = document.querySelector('[data-el="tl"]');
      const dash = (sel) => getComputedStyle(el.querySelector(sel)).strokeDasharray;
      const accent = getComputedStyle(document.querySelector(".sd-canvas")).getPropertyValue("--sd-color-accent").trim();
      const rule = getComputedStyle(document.querySelector(".sd-canvas")).getPropertyValue("--sd-color-rule").trim();
      const stroke = (sel) => getComputedStyle(el.querySelector(sel)).stroke;
      const probe = document.createElement("i");
      const colour = (c) => { probe.style.color = c; el.appendChild(probe); const v = getComputedStyle(probe).color; probe.remove(); return v; };
      return { track: dash(".sd-timeline-track"), fill: dash(".sd-timeline-fill"), trackStroke: stroke(".sd-timeline-track"), fillStroke: stroke(".sd-timeline-fill"), accent: colour(accent), rule: colour(rule) };
    });
    assert.notEqual(r.track, "none");
    assert.equal(r.fill, "none");
    assert.equal(r.trackStroke, r.rule, "the track uses the rule token");
    assert.equal(r.fillStroke, r.accent, "the fill uses the accent token");
  });
  await withPage({ root, url: pages.url("fill", "step=half") }, async (page) => {
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-el="tl"] .sd-timeline-track')).strokeDasharray), "none", "solid by default");
  });
});

test("text is at least 28px", async () => {
  await withPage({ root, url: pages.url("fill", "step=half") }, async (page) => {
    const sizes = await page.evaluate(() => {
      const min = parseFloat(getComputedStyle(document.querySelector(".sd-canvas")).getPropertyValue("--sd-min-audience-font"));
      const px = (sel) => [...document.querySelectorAll(`[data-el="tl"] ${sel}`)].map((n) => parseFloat(getComputedStyle(n).fontSize));
      return { min, text: px(".sd-timeline-text"), sub: px(".sd-timeline-sub") };
    });
    assert.equal(sizes.min, 28);
    assert.equal(sizes.text.length, 4);
    assert.ok(sizes.text.every((s) => s >= 28), `labels ${sizes.text}`);
    assert.equal(sizes.sub.length, 2);
    assert.ok(sizes.sub.every((s) => s >= 28), `subs ${sizes.sub}`);
  });
});

test("fewer than two stops is an element error naming the problem; the sibling carries on", async () => {
  await withPage({ root, url: pages.url("bad", "") }, async (page) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^bad\/bad: .*at least 2 stops/);
    assert.match(await page.textContent('[data-el="ok"]'), /carries on/);
    assert.match((await page.textContent('[data-el="bad"] .sd-error')) ?? "", /at least 2 stops/);
  });
});

test("long labels wrap inside the region, first and last included", async () => {
  await withPage({ root, url: pages.url("long", "") }, async (page, ctx) => {
    const r = await page.evaluate(() => {
      const region = document.querySelector('[data-region="main"]').getBoundingClientRect();
      const texts = [...document.querySelectorAll('[data-el="tl"] .sd-timeline-text')];
      const subs = [...document.querySelectorAll('[data-el="tl"] .sd-timeline-sub')];
      const rects = [...texts, ...subs].map((n) => n.getBoundingClientRect());
      const lines = texts.map((n) => n.getBoundingClientRect().height / parseFloat(getComputedStyle(n).lineHeight));
      const el = document.querySelector('[data-el="tl"]').getBoundingClientRect();
      return { inside: rects.every((b) => b.left >= region.left - 0.5 && b.right <= region.right + 0.5), lines, elBottom: el.bottom, regionBottom: region.bottom, last: Math.max(...rects.map((b) => b.bottom)) };
    });
    assert.ok(r.inside, "every label and sub stays inside the main region");
    assert.ok(r.lines[0] > 1.5 && r.lines[3] > 1.5, `long labels wrap (${r.lines})`);
    assert.ok(r.last <= r.elBottom + 0.5, "the element is as tall as its labels");
    assert.deepEqual(ctx.errors, []);
  });
});

test("check is clean on the timeline slides", async () => {
  for (const slide of ["fill", "dashed", "long", "spaced"]) {
    const problems = await check(deck, { slide });
    assert.deepEqual(problems.map(formatProblem), [], slide);
  }
});
