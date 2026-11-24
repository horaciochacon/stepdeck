// `chart.bar` in Chrome (slide kit 1). Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/chart-bar.test.mjs
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
  elementHtml,
  htmlAfterJump,
  sampleFrames,
  tokenRgb,
  colorMove,
  easeAgainstTime,
} from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const deck = fileURLToPath(new URL("../fixtures/decks/bars/", import.meta.url));
const pages = deckPages("test/fixtures/decks/bars/");
const SHRINK = ["before", "after"];
const REVEAL = ["none", "a", "ab", "abc", "focus"];
const INTERVAL = ["one", "two", "three", "later"];
const VERTICAL = ["all", "focus", "later"];
const SIGN = ["before", "after"]; // a and c change sign, so their labels change side
const motion = deckPages("test/fixtures/decks/motion/"); // modern theme: --sd-duration 400ms, --sd-stagger 80ms
const focus = deckPages("test/fixtures/decks/focus/"); // modern theme: --sd-duration-fast 200ms; steps all, a, b, end

// Per bar, in canvas pixels (attributes, so the shell's scale transform does not matter).
const bars = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-el="bars"] .sd-bar-group')].map((g) => {
        const r = g.querySelector(".sd-bar");
        const n = (a) => Number(r.getAttribute(a));
        return [g.dataset.key, { x: n("x"), y: n("y"), width: n("width"), height: n("height"), visible: getComputedStyle(g).visibility === "visible", dim: g.dataset.dim, fill: getComputedStyle(r).fill, opacity: getComputedStyle(r).opacity }];
      }),
    ),
  );

const ticks = (page) => page.evaluate(() => [...document.querySelectorAll('[data-el="bars"] .sd-axis-value .tick text')].map((t) => t.textContent));

test("jump equals played", async () => {
  await withPage({ root, url: pages.url("shrink", "step=before") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "shrink", steps: SHRINK, id: "bars" });
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "reveal", steps: REVEAL, id: "bars" });
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "interval", steps: INTERVAL, id: "bars" });
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "vertical", steps: VERTICAL, id: "bars" });
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "sign-change", steps: SIGN, id: "bars" });
  });
});

test("backward equals jump", async () => {
  await withPage({ root, url: pages.url("shrink", "step=before") }, async (page, ctx) => {
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "shrink", steps: SHRINK, id: "bars" });
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "reveal", steps: REVEAL, id: "bars" });
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "interval", steps: INTERVAL, id: "bars" });
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "vertical", steps: VERTICAL, id: "bars" });
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "sign-change", steps: SIGN, id: "bars" });
  });
});

test("interrupt mid-motion equals jump", async () => {
  await withPage({ root, url: pages.url("shrink", "step=before") }, async (page, ctx) => {
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "shrink", from: "before", via: "after", to: "before", id: "bars" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "reveal", from: "none", via: "a", to: "abc", id: "bars" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "reveal", from: "abc", via: "focus", to: "none", id: "bars" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "interval", from: "three", via: "later", to: "one", id: "bars" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "vertical", from: "all", via: "focus", to: "later", id: "bars" });
  });
});

test("animated step moves", async () => {
  await withPage({ root, url: pages.url("shrink", "step=before") }, async (page, ctx) => {
    const width = (p) => p.evaluate(() => document.querySelector('[data-el="bars"] .sd-bar-group[data-key="Limpieza"] .sd-bar').getAttribute("width"));
    const shrink = await expectAnimatedStepMoves(ctx, page, { pages, slide: "shrink", from: "before", to: "after", id: "bars", probe: width });
    assert.ok(Number(shrink.mid) > Number(shrink.end), "mid-flight the bar is still longer than at its end");
    const grow = await expectAnimatedStepMoves(ctx, page, {
      pages, slide: "reveal", from: "none", to: "a", id: "bars",
      probe: (p) => p.evaluate(() => document.querySelector('[data-el="bars"] .sd-bar-group[data-key="a"] .sd-bar').getAttribute("width")),
    });
    assert.ok(Number(grow.mid) < Number(grow.end), "the new bar is still growing 120 ms in");
  });
});

test("switching y shrinks the bar", async () => {
  await withPage({ root, url: pages.url("shrink", "step=before") }, async (page, ctx) => {
    const before = await bars(page);
    const ticksBefore = await ticks(page);
    await ctx.open(pages.url("shrink", "step=after"));
    const after = await bars(page);
    const ticksAfter = await ticks(page);
    for (const key of Object.keys(before)) assert.ok(after[key].width < before[key].width, `${key}: ${after[key].width} < ${before[key].width}`);
    assert.deepEqual(ticksAfter, ticksBefore, "the explicit domain keeps the axis ticks");
    assert.equal(ticksBefore.at(0), "0");
    assert.ok(ticksBefore.length >= 4);
    assert.deepEqual(ctx.errors, []);
  });
});

test("the fixed axis does not move when value labels change length", async () => {
  // "28" -> "2": the labels get shorter but the plot, the gridlines and the baseline stay where they are.
  const grid = (page) =>
    page.evaluate(() => ({
      ticks: [...document.querySelectorAll('[data-el="bars"] .sd-axis-value .tick')].map((t) => t.getAttribute("transform")),
      baseline: document.querySelector('[data-el="bars"] .sd-axis-line').getAttribute("x1"),
      plot: document.querySelector('[data-el="bars"] .sd-plot').getAttribute("transform"),
    }));
  await withPage({ root, url: pages.url("shrink", "step=before") }, async (page, ctx) => {
    const before = await grid(page);
    await ctx.open(pages.url("shrink", "step=after"));
    assert.deepEqual(await grid(page), before, "same gridlines at rest");
    await ctx.open(pages.url("shrink", "step=before&motion=full"));
    await page.evaluate(() => { window.STEPDECK.goTo("shrink", "after"); });
    await page.waitForTimeout(150);
    assert.deepEqual(await grid(page), before, "same gridlines mid-tween");
    await page.evaluate(() => window.STEPDECK.settled());
    assert.deepEqual(ctx.errors, []);
  });
});

test("the default domain spans every row, shown or not, and includes zero", async () => {
  await withPage({ root, url: pages.url("reveal", "step=a") }, async (page, ctx) => {
    const atA = await ticks(page);
    const widthA = (await bars(page)).a.width;
    await ctx.open(pages.url("reveal", "step=abc"));
    assert.deepEqual(await ticks(page), atA, "the axis does not change as categories appear");
    assert.equal((await bars(page)).a.width, widthA, "a bar keeps its length as others appear");
    // The largest value in the data (20, c) decides the domain: ticks reach it although only `a` was shown.
    assert.ok(atA.includes("20,0"), `ticks ${atA}`);
  });
});

test("hidden category keeps its slot", async () => {
  await withPage({ root, url: pages.url("reveal", "step=a") }, async (page, ctx) => {
    const atA = await bars(page);
    assert.deepEqual([atA.a.visible, atA.b.visible, atA.c.visible], [true, false, false]);
    const labels = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-el="bars"] .sd-band-label')].map((t) => [t.dataset.key, getComputedStyle(t).visibility])));
    assert.deepEqual(await labels(), { a: "visible", b: "hidden", c: "hidden" });
    await ctx.open(pages.url("reveal", "step=abc"));
    const all = await bars(page);
    assert.deepEqual([all.a.visible, all.b.visible, all.c.visible], [true, true, true]);
    for (const key of ["a", "b", "c"]) {
      assert.equal(atA[key].y, all[key].y, `${key} keeps its y`);
      assert.equal(atA[key].height, all[key].height, `${key} keeps its height`);
    }
    assert.equal(atA.b.width, all.b.width, "a hidden bar is laid out at its final length");
    assert.ok(all.b.y > all.a.y && all.c.y > all.b.y, "bands keep the data order, top to bottom");
    assert.deepEqual(ctx.errors, []);
  });
});

test("es uses decimal comma", async () => {
  await withPage({ root, url: pages.url("decimal", "") }, async (page, ctx) => {
    const text = await page.evaluate(() => ({
      labels: [...document.querySelectorAll('[data-el="bars"] .sd-bar-label')].map((t) => t.textContent),
      ticks: [...document.querySelectorAll('[data-el="bars"] .sd-axis-value .tick text')].map((t) => t.textContent),
      titles: [...document.querySelectorAll('[data-el="bars"] .sd-bar-group > title')].map((t) => t.textContent),
    }));
    assert.deepEqual(text.labels, ["12,5", "7,5", "20,0"]);
    assert.ok(text.ticks.every((t) => /^\d+,\d$/.test(t)), `ticks ${text.ticks}`);
    assert.match(text.titles[0], /12,5/);
    assert.match(text.titles[0], /10,5/, "the interval text uses the comma too");
    assert.match(text.titles[0], /14,5/);
    assert.ok(![...text.labels, ...text.ticks, ...text.titles].some((t) => /\d\.\d/.test(t)), "no decimal point anywhere");
    assert.deepEqual(ctx.errors, []);
  });
});

test("missing column error names it", async () => {
  await withPage({ root, url: pages.url("missing-column", "") }, async (page, ctx) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^missing-column\/bars: column 'valeu' not found in data\/values\.csv/);
    const shown = await page.evaluate(() => document.querySelector('[data-el="bars"] .sd-error')?.textContent);
    assert.match(shown ?? "", /column 'valeu' not found in data\/values\.csv/);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-el="ok"]')).visibility), "visible");
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

// The interval whisker belongs after its bar: bar first, then the whisker. Driven with a stubbed tween so
// the two sampled moments are exact instead of a race with the clock.
test("interval whisker after bar", async () => {
  await withPage({ root, url: pages.url("shrink", "step=before"), size: 960 }, async (page) => {
    const r = await page.evaluate(async () => {
      const { default: chart } = await import("../components/chart.bar/index.js");
      const { d3 } = await import("../core/d3.js");
      const host = document.createElement("div");
      host.style.cssText = "position:absolute;left:0;top:0;width:1000px;height:600px";
      document.querySelector(".sd-canvas").appendChild(host);
      const rows = [{ g: "a", v: 10, lo: 6, hi: 14 }, { g: "b", v: 20, lo: 15, hi: 25 }];
      const samples = [];
      const group = () => host.querySelector('.sd-bar-group[data-key="a"]');
      const read = () => {
        const g = group();
        const w = g.querySelector(".sd-whisker");
        const line = w.querySelector(".sd-whisker-line");
        const len = Math.abs(Number(line.getAttribute("x2")) - Number(line.getAttribute("x1")));
        return { bar: Number(g.querySelector(".sd-bar").getAttribute("width")), whisker: len, shownWhisker: w.getAttribute("opacity") !== "0" && len > 0 };
      };
      const ctx = {
        d3,
        data: async () => rows,
        format: (spec) => d3.format(spec),
        animate: {
          tween: async (_a, _b, frame) => {
            for (const t of [0.3, 0.8]) { frame(t); samples.push({ t, ...read() }); }
            frame(1);
          },
          drawPath: async () => {},
          stagger: async () => {},
        },
        tokens: { "--sd-font-size-label": "28px", "--sd-color-ink": "#111111", "--sd-color-muted": "#555555", "--sd-color-rule": "#cccccc", "--sd-color-background": "#ffffff" },
        palette: () => ({ colors: ["#0072b2"] }),
        size: { w: 1000, h: 600 },
      };
      const props = { data: "d.csv", x: "g", y: "v", interval: { lower: "lo", upper: "hi" }, domain: [0, 30], shown: [] };
      const inst = await chart.mount(host, props, ctx);
      const info = (animate) => ({ prev: null, changed: [], animate, entered: false, signal: new AbortController().signal });
      await inst.update(props, info(false));
      await inst.update({ ...props, shown: ["a"] }, info(true));
      return { samples, end: read() };
    });
    const [early, late] = r.samples;
    assert.ok(early.bar > 0 && early.bar < r.end.bar, "the bar is growing at t=0.3");
    assert.equal(early.shownWhisker, false, "no whisker yet while the bar is still growing");
    assert.ok(Math.abs(late.bar - r.end.bar) < 0.5, "the bar has arrived at t=0.8");
    assert.ok(late.whisker > 0 && late.whisker < r.end.whisker, "the whisker is being drawn after the bar");
    assert.ok(r.end.whisker > 0 && r.end.shownWhisker, "the whisker is complete at the end");
  });
});

test("highlight dims the other bars to the theme's dim colour, not by opacity", async () => {
  await withPage({ root, url: pages.url("reveal", "step=focus&motion=full") }, async (page) => {
    const dim = await tokenRgb(page, "--sd-color-dim");
    const at = await bars(page);
    assert.deepEqual([at.a.dim, at.b.dim, at.c.dim], ["true", "false", "true"]);
    assert.equal(at.a.fill, dim, "a dimmed bar is the dim colour");
    assert.equal(at.c.fill, dim);
    assert.notEqual(at.b.fill, dim, "the focused bar keeps its colour");
    for (const key of ["a", "b", "c"]) assert.equal(at[key].opacity, "1", `${key} keeps full opacity`);
    const textOpacity = await page.evaluate(() => [...document.querySelectorAll('[data-el="bars"] text')].map((t) => getComputedStyle(t).opacity));
    assert.ok(textOpacity.every((o) => o === "1"), "labels are never faded");
    await goTo(page, "reveal", "abc");
    const back = await bars(page);
    assert.deepEqual([back.a.dim, back.b.dim, back.c.dim], ["false", "false", "false"], "the highlight lasts one step");
    assert.equal(back.a.fill, back.b.fill);
  });
});

test("a highlighted bar's dimmed neighbours have muted value labels; the focused one keeps its ink", async () => {
  await withPage({ root, url: focus.url("bars", "step=a") }, async (page) => {
    const muted = await tokenRgb(page, "--sd-color-muted");
    const ink = await tokenRgb(page, "--sd-color-ink");
    const fills = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-el="bars"] .sd-bar-group')].map((g) => [g.dataset.key, getComputedStyle(g.querySelector(".sd-bar-label")).fill])));
    assert.deepEqual(fills, { a: ink, b: muted, c: muted });
  });
});

test("the focused bar is drawn after (above) the dimmed ones; bars keep their places", async () => {
  // A bar's place is its position along the band axis: y for horizontal bars (x is the baseline, the same for
  // every bar), x for vertical ones.
  const read = (page) => page.evaluate(() => {
    const svg = document.querySelector('[data-el="bars"] svg');
    const axis = svg.dataset.orient === "vertical" ? "x" : "y";
    const groups = [...document.querySelectorAll('[data-el="bars"] .sd-bar-group')];
    return { orient: svg.dataset.orient, order: groups.map((g) => g.dataset.key), at: Object.fromEntries(groups.map((g) => [g.dataset.key, Number(g.querySelector(".sd-bar").getAttribute(axis))])) };
  });
  await withPage({ root, url: focus.url("bars", "step=all") }, async (page, ctx) => {
    const all = await read(page);
    assert.equal(all.orient, "horizontal");
    assert.deepEqual(all.order, ["a", "b", "c"], "data order without a highlight");
    assert.equal(new Set(Object.values(all.at)).size, 3, `each bar has its own place on the band axis: ${JSON.stringify(all.at)}`);
    await ctx.open(focus.url("bars", "step=a"));
    const a = await read(page);
    assert.deepEqual(a.order, ["b", "c", "a"], "a is raised");
    assert.deepEqual(a.at, all.at, "raising a bar does not move it");
    await ctx.open(focus.url("bars", "step=b"));
    assert.deepEqual((await read(page)).order, ["a", "c", "b"], "b is raised");
  });
});

test("focus: jump equals played, backward and interrupted", async () => {
  const steps = ["all", "a", "b", "end"];
  await withPage({ root, url: focus.url("bars", "step=all") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages: focus, slide: "bars", steps, id: "bars" });
    await expectBackwardEqualsJump(ctx, page, { pages: focus, slide: "bars", steps, id: "bars" });
    await expectInterruptEqualsJump(ctx, page, { pages: focus, slide: "bars", from: "all", via: "a", to: "b", id: "bars" });
    await expectInterruptEqualsJump(ctx, page, { pages: focus, slide: "bars", from: "a", via: "b", to: "end", id: "bars" });
  });
});

test("a highlight change tweens the bar colour over --sd-duration-fast, never the opacity", async () => {
  await withPage({ root, url: focus.url("bars", "step=all&motion=full") }, async (page, ctx) => {
    const dim = await tokenRgb(page, "--sd-color-dim");
    const r = await sampleFrames(page, "bars", "a", "bars", () => {
      const rect = document.querySelector('[data-el="bars"] .sd-bar-group[data-key="b"] .sd-bar');
      const cs = getComputedStyle(rect);
      return { color: cs.fill, opacity: cs.opacity };
    });
    const move = colorMove(r.frames);
    assert.equal(move.to, dim, "bar b ends at the dim colour");
    assert.ok(move.moved >= 3, `the colour was seen part-way (${move.moved} frames)`);
    assert.ok(r.frames.every((f) => f.opacity === "1"), "opacity never changes");
    assert.ok(move.arrived >= 170, `200 ms, not a snap (arrived at ${move.arrived.toFixed(0)} ms)`);
    // Against the concurrent geometry morph (2 x --sd-duration, 800 ms), which stretches with load as the colour tween does:
    // the fast tween is a quarter of it, a colour tween at --sd-duration would be half.
    assert.ok(move.arrived < 0.4 * r.settledMs, `the colour is done in the fast duration, well before the morph settles (${move.arrived.toFixed(0)} of ${r.settledMs.toFixed(0)} ms)`);
    assert.deepEqual(ctx.errors, []);
  });
});

test("the bars ease with the theme's --sd-easing: under a linear easing, a quarter of the time is a quarter of the way", async () => {
  // bar-ease: --sd-easing: linear on the slide, y switches low -> high over 1600 ms on a fixed domain.
  await withPage({ root, url: motion.url("bar-ease", "step=low&motion=full") }, async (page, ctx) => {
    const start = await bars(page);
    const r = await sampleFrames(page, "bar-ease", "high", "bars", () =>
      Object.fromEntries([...document.querySelectorAll('[data-el="bars"] .sd-bar-group')].map((g) => [g.dataset.key, Number(g.querySelector(".sd-bar").getAttribute("width"))])));
    const end = await bars(page);
    // Progress of the morph: how far the East bar has gone from its low to its high length.
    const key = "East";
    const w0 = start[key].width;
    const w1 = end[key].width;
    assert.ok(w1 - w0 > 50, `the bar grows visibly (${w0} -> ${w1})`);
    const samples = r.frames.map((f) => ({ ms: f.ms, p: (f[key] - w0) / (w1 - w0) }));
    const fit = easeAgainstTime(samples);
    assert.ok(fit.span > 1200, `the morph lasts the step's 1600 ms (${fit.span.toFixed(0)} ms)`);
    assert.ok(fit.checked >= 3, `samples a fifth to a half of the way through (${fit.checked})`);
    assert.ok(fit.worst < 0.06, `linear in time, not cubic in-out: worst |progress - time| ${fit.worst.toFixed(3)}`);
    assert.deepEqual(ctx.errors, []);
  });
});

test("vertical bars grow upwards from the baseline, with labels above", async () => {
  await withPage({ root, url: pages.url("vertical", "step=all") }, async (page, ctx) => {
    const r = await page.evaluate(() => {
      const groups = [...document.querySelectorAll('[data-el="bars"] .sd-bar-group')];
      const rect = (g) => { const b = g.querySelector(".sd-bar"); return { x: +b.getAttribute("x"), y: +b.getAttribute("y"), w: +b.getAttribute("width"), h: +b.getAttribute("height") }; };
      const label = (g) => { const t = g.querySelector(".sd-bar-label"); return { y: +t.getAttribute("y"), text: t.textContent }; };
      return { rects: groups.map(rect), labels: groups.map(label), orient: document.querySelector('[data-el="bars"] svg').dataset.orient };
    });
    assert.equal(r.orient, "vertical");
    // a=12,5 b=7,5 c=20: heights follow values, all bars share one baseline, x ascends.
    const base = r.rects.map((b) => b.y + b.h);
    assert.ok(base.every((v) => Math.abs(v - base[0]) < 0.5), "one shared baseline");
    assert.ok(r.rects[2].h > r.rects[0].h && r.rects[0].h > r.rects[1].h);
    assert.ok(r.rects[0].x < r.rects[1].x && r.rects[1].x < r.rects[2].x);
    r.labels.forEach((l, i) => assert.ok(l.y < r.rects[i].y, `label ${l.text} sits above its bar`));
    assert.deepEqual(ctx.errors, []);
  });
});

test("text is at least 28px: values, categories, ticks and axis titles", async () => {
  for (const [slide, step] of [["shrink", "before"], ["vertical", "all"], ["decimal", ""]]) {
    await withPage({ root, url: pages.url(slide, step ? `step=${step}` : "") }, async (page) => {
      const sizes = await page.evaluate(() => {
        const min = parseFloat(getComputedStyle(document.querySelector(".sd-canvas")).getPropertyValue("--sd-min-audience-font"));
        const all = [...document.querySelectorAll('[data-el="bars"] text')].map((t) => ({ text: t.textContent, size: parseFloat(getComputedStyle(t).fontSize) }));
        const kinds = ["sd-bar-label", "sd-band-label", "sd-axis-title"].map((c) => document.querySelectorAll(`[data-el="bars"] text.${c}`).length);
        return { min, all, kinds };
      });
      assert.equal(sizes.min, 28);
      assert.ok(sizes.kinds[0] > 0 && sizes.kinds[1] > 0, `${slide}: value and category labels exist`);
      for (const t of sizes.all) assert.ok(t.size >= 28, `${slide}: "${t.text}" is ${t.size}px`);
    });
  }
});

test("a long category name wraps inside the band axis", async () => {
  await withPage({ root, url: pages.url("long", "") }, async (page, ctx) => {
    const r = await page.evaluate(() => {
      const region = document.querySelector('[data-region="main"]').getBoundingClientRect();
      const labels = [...document.querySelectorAll('[data-el="bars"] .sd-band-label')];
      const long = labels.find((l) => l.textContent.startsWith("Una categor"));
      const boxes = labels.map((l) => l.getBoundingClientRect());
      return { lines: long.querySelectorAll("tspan").length, inside: boxes.every((b) => b.left >= region.left - 0.5 && b.right <= region.right + 0.5) };
    });
    assert.ok(r.lines >= 2, `the long name wraps (${r.lines} lines)`);
    assert.ok(r.inside, "labels stay inside the main region");
    assert.deepEqual(ctx.errors, []);
  });
});

// Mounts the component alone with canned rows and returns the message it fails with (null when it mounts).
const mountError = (page, props, rows) =>
  page.evaluate(async ([props, rows]) => {
    const { default: chart } = await import("../components/chart.bar/index.js");
    const { d3 } = await import("../core/d3.js");
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:0;top:0;width:1000px;height:600px";
    document.querySelector(".sd-canvas").appendChild(host);
    const ctx = { d3, data: async () => rows, format: (s) => d3.format(s), animate: {}, tokens: {}, palette: () => ({ colors: [] }), size: { w: 1000, h: 600 } };
    try {
      await chart.mount(host, props, ctx);
      return null;
    } catch (e) {
      return e.message;
    }
  }, [props, rows]);

test("duplicate categories and unknown category ids are element errors naming them", async () => {
  await withPage({ root, url: pages.url("shrink", "step=before"), size: 960 }, async (page) => {
    const rows = [{ g: "a", v: 1 }, { g: "b", v: 2 }];
    assert.match((await mountError(page, { data: "d.csv", x: "g", y: "v" }, [...rows, { g: "a", v: 3 }])) ?? "", /category 'a' appears more than once/);
    assert.match((await mountError(page, { data: "d.csv", x: "g", y: "v", shown: ["a", "zz"] }, rows)) ?? "", /category 'zz' in `shown` not found.*categories: a, b/);
    assert.match((await mountError(page, { data: "d.csv", x: "g", y: "v", highlight: "qq" }, rows)) ?? "", /category 'qq' in `highlight` not found/);
    assert.match((await mountError(page, { data: "d.csv", x: "g", y: "v", domain: [5, 5] }, rows)) ?? "", /`domain` must be \[min, max\]/);
    assert.equal(await mountError(page, { data: "d.csv", x: "g", y: "v", shown: ["a"], highlight: "b" }, rows), null);
  });
});

// A negative bar's value label points away from zero, towards the category labels: it must not land on one.
test("negative bars: no value label overprints a category label, horizontal or vertical", async () => {
  const overlaps = (page) =>
    page.evaluate(() => {
      const el = document.querySelector('[data-el="bars"]');
      const boxes = (sel) => [...el.querySelectorAll(sel)].filter((n) => getComputedStyle(n).visibility === "visible" && n.textContent).map((n) => ({ text: n.textContent, r: n.getBoundingClientRect() }));
      const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const found = [];
      for (const v of boxes(".sd-bar-label")) for (const c of boxes(".sd-band-label")) if (hit(v.r, c.r)) found.push(`${v.text} on ${c.text}`);
      return found;
    });
  await withPage({ root, url: pages.url("negative", "step=after") }, async (page, ctx) => {
    for (const [slide, step] of [["negative", "after"], ["negative", "before"], ["sign-change", "before"], ["sign-change", "after"]]) {
      await ctx.open(pages.url(slide, `step=${step}`));
      assert.deepEqual(await overlaps(page), [], `${slide}/${step}`);
    }
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "negative", steps: ["after", "before"], id: "bars" });
  });
});

test("large values: labels keep every digit, and the tick labels of a horizontal axis never run into each other", async () => {
  await withPage({ root, url: pages.url("large") }, async (page) => {
    const got = await page.evaluate(() => {
      const el = document.querySelector('[data-el="bars"]');
      const tickBoxes = [...el.querySelectorAll(".sd-axis-value .tick text")].map((n) => n.getBoundingClientRect()).sort((a, b) => a.left - b.left);
      return {
        labels: [...el.querySelectorAll(".sd-bar-label")].map((n) => n.textContent),
        ticks: [...el.querySelectorAll(".sd-axis-value .tick text")].map((n) => n.textContent),
        gaps: tickBoxes.slice(1).map((b, i) => b.left - tickBoxes[i].right),
      };
    });
    assert.deepEqual(got.labels, ["12.345.678", "8.000.000", "1.234.567"], "es: every digit, grouped");
    assert.ok(got.ticks.length >= 2 && got.ticks.length < 8, `fewer ticks than the 8 d3 gives: ${got.ticks.join(" ")}`);
    assert.ok(got.gaps.every((g) => g > 4), `tick labels apart: ${got.gaps.map((g) => g.toFixed(1)).join(", ")} (${got.ticks.join(" ")})`);
  });
});

test("check is clean on the bar slides", async () => {
  for (const slide of ["shrink", "reveal", "interval", "vertical", "long", "decimal", "sign-change", "negative", "large"]) {
    const problems = await check(deck, { slide });
    assert.deepEqual(problems.map(formatProblem), [], slide);
  }
});

// Owned entrance. Per frame: the length of every bar (its rect's width, the bars being horizontal), whether a
// whisker shows, and the chart's markup.
const barProbe = (el) => {
  const groups = [...el.querySelectorAll(".sd-bar-group")];
  return {
    lengths: groups.map((g) => Number(g.querySelector(".sd-bar").getAttribute("width"))),
    whiskers: groups.some((g) => { const w = g.querySelector(".sd-whisker"); return w && w.getAttribute("opacity") !== "0"; }),
    content: el.innerHTML,
  };
};
const errorsClean = async (page, ctx) => {
  assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
  assert.deepEqual(ctx.errors, []);
};

test("no flash before the draw: held for its slot, the bars start at zero length and grow while the box stays still", async () => {
  await withPage({ root, url: motion.url("bar-third", "step=start&motion=full") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    const r = await sampleFrames(page, "bar-third", "go", "bars", barProbe);
    const shown = r.frames.filter((f) => f.visible);
    assert.ok(shown.length > 0, "the chart is shown");
    const first = shown[0];
    assert.deepEqual(first.lengths, [0, 0, 0], "the first frame with the chart shown has zero-length bars");
    assert.equal(first.whiskers, false, "and no whisker");
    assert.ok(first.ms >= 150, `held for the third slot, 2 x 80 ms (first shown at ${first.ms.toFixed(0)} ms)`);
    assert.deepEqual(r.frames.filter((f) => f.style !== null).map((f) => f.style), [], "the box stays still: the bars grow themselves");
    assert.ok(shown.some((f) => f.lengths.every((n) => n > 0) && f.lengths.some((n, i) => n < r.end.lengths[i])), "the bars grow");
    const firstWhisker = shown.findIndex((f) => f.whiskers);
    assert.ok(firstWhisker > 0, "the whiskers come after the bars");
    const growing = shown.filter((f) => f.lengths.some((n, i) => n < r.end.lengths[i]));
    const span = growing.at(-1).ms - first.ms;
    assert.ok(span >= 300 && span < 4000, `grows over most of 2 x --sd-duration (${span.toFixed(0)} ms)`);
    assert.equal(await elementHtml(page, "bars"), await htmlAfterJump(ctx, page, motion, "bar-third", "go", "bars"));

    await expectJumpEqualsPlayed(ctx, page, { pages: motion, slide: "bar-third", steps: ["start", "go", "more"], id: "bars" });
    await expectInterruptEqualsJump(ctx, page, { pages: motion, slide: "bar-third", from: "start", via: "go", to: "more", id: "bars" });
    await errorsClean(page, ctx);
  });
});

test("the start state is written before update awaits its data (zero-length bars)", async () => {
  await withPage({ root, url: pages.url("shrink", "step=before"), size: 960 }, async (page) => {
    const r = await page.evaluate(async () => {
      const { default: chart } = await import("../components/chart.bar/index.js");
      const { animate } = await import("../core/animate.js");
      const { d3 } = await import("../core/d3.js");
      const host = document.createElement("div");
      host.style.cssText = "position:absolute;left:0;top:0;width:1000px;height:600px";
      document.querySelector(".sd-canvas").appendChild(host);
      const rows = [{ g: "a", v: 10, lo: 6, hi: 14 }, { g: "b", v: 20, lo: 15, hi: 25 }];
      let gate = null; // while set, the data stays loading
      const ctx = {
        d3, animate,
        data: () => gate ?? Promise.resolve(rows),
        format: (spec) => d3.format(spec),
        tokens: { "--sd-font-size-label": "28px", "--sd-color-ink": "#111111", "--sd-color-muted": "#555555", "--sd-color-rule": "#cccccc", "--sd-color-background": "#ffffff" },
        palette: () => ({ colors: ["#0072b2"] }),
        size: { w: 1000, h: 600 },
      };
      const read = () => [...host.querySelectorAll(".sd-bar-group")].map((g) => ({
        width: Number(g.querySelector(".sd-bar").getAttribute("width")),
        whisker: g.querySelector(".sd-whisker")?.getAttribute("opacity") ?? null,
      }));
      const props = { data: "d.csv", x: "g", y: "v", interval: { lower: "lo", upper: "hi" }, domain: [0, 30] };
      const inst = await chart.mount(host, props, ctx);
      const signal = new AbortController().signal;
      await inst.update(props, { prev: null, changed: Object.keys(props), animate: false, entered: false, entrance: null, signal });
      const before = read();
      let release;
      gate = new Promise((resolve) => (release = () => resolve(rows)));
      const t0 = performance.now();
      const updating = inst.update(props, { prev: props, changed: [], animate: true, entered: true, entrance: { motion: "draw", duration: 120 }, signal });
      const sync = read();
      release();
      await updating;
      const ms = performance.now() - t0;
      const end = read();
      host.remove();
      return { before, sync, ms, end };
    });
    assert.ok(r.before.every((b) => b.width > 0), "drawn while hidden");
    assert.deepEqual(r.sync, [{ width: 0, whisker: "0" }, { width: 0, whisker: "0" }], "zero-length bars, no whisker, before the data arrives");
    assert.ok(r.ms >= 100 && r.ms < 600, `entrance.duration (120 ms) wins over 2 x --sd-duration (took ${r.ms.toFixed(0)} ms)`);
    assert.deepEqual(r.end, r.before);
  });
});

test("enter none snaps: no frame in motion, the end equals the jump", async () => {
  await withPage({ root }, async (page, ctx) => {
    const jumped = await htmlAfterJump(ctx, page, motion, "bar-none", "go", "bars");
    const content = await page.evaluate(() => document.querySelector('[data-el="bars"]').innerHTML);
    await ctx.open(motion.url("bar-none", "step=start&motion=full"));
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    const r = await sampleFrames(page, "bar-none", "go", "bars", barProbe);
    const shown = r.frames.filter((f) => f.visible);
    assert.ok(shown.length > 0, "the chart is shown");
    assert.deepEqual(shown.filter((f) => f.style !== null || f.content !== content).map((f) => f.ms), [], "every shown frame is the end state");
    assert.equal(await elementHtml(page, "bars"), jumped);
    await errorsClean(page, ctx);
  });
});

test("enter rise: the box rises, the bars are at full length at once", async () => {
  await withPage({ root }, async (page, ctx) => {
    const jumped = await htmlAfterJump(ctx, page, motion, "bar-rise", "go", "bars");
    const content = await page.evaluate(() => document.querySelector('[data-el="bars"]').innerHTML);
    await ctx.open(motion.url("bar-rise", "step=start&motion=full"));
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    const r = await sampleFrames(page, "bar-rise", "go", "bars", barProbe);
    assert.ok(r.frames.some((f) => f.visible && /translateY/.test(f.style ?? "")), "the box rises");
    assert.deepEqual(r.frames.filter((f) => f.visible && f.content !== content).map((f) => f.ms), [], "the bars are drawn from the first frame");
    assert.equal(await elementHtml(page, "bars"), jumped);
    await errorsClean(page, ctx);
  });
});
