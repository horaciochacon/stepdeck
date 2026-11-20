// `chart.bar` in Chrome (slide kit 1, task 4). Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test --test-concurrency=1 test/browser/chart-bar.test.mjs
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
const deck = fileURLToPath(new URL("../fixtures/decks/bars/", import.meta.url));
const pages = deckPages("test/fixtures/decks/bars/");
const SHRINK = ["before", "after"];
const REVEAL = ["none", "a", "ab", "abc", "focus"];
const INTERVAL = ["one", "two", "three", "later"];
const VERTICAL = ["all", "focus", "later"];

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
  });
});

test("backward equals jump", async () => {
  await withPage({ root, url: pages.url("shrink", "step=before") }, async (page, ctx) => {
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "shrink", steps: SHRINK, id: "bars" });
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "reveal", steps: REVEAL, id: "bars" });
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "interval", steps: INTERVAL, id: "bars" });
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "vertical", steps: VERTICAL, id: "bars" });
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

test("highlight dims the other bars by colour, not opacity", async () => {
  await withPage({ root, url: pages.url("reveal", "step=focus&motion=full") }, async (page) => {
    const at = await bars(page);
    assert.deepEqual([at.a.dim, at.b.dim, at.c.dim], ["true", "false", "true"]);
    assert.notEqual(at.a.fill, at.b.fill, "dimmed bars use another colour");
    assert.equal(at.a.fill, at.c.fill);
    for (const key of ["a", "b", "c"]) assert.equal(at[key].opacity, "1", `${key} keeps full opacity`);
    const textOpacity = await page.evaluate(() => [...document.querySelectorAll('[data-el="bars"] text')].map((t) => getComputedStyle(t).opacity));
    assert.ok(textOpacity.every((o) => o === "1"), "labels are never faded");
    await goTo(page, "reveal", "abc");
    const back = await bars(page);
    assert.deepEqual([back.a.dim, back.b.dim, back.c.dim], ["false", "false", "false"], "the highlight lasts one step");
    assert.equal(back.a.fill, back.b.fill);
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

test("check is clean on the bar slides", async () => {
  for (const slide of ["shrink", "reveal", "interval", "vertical", "long", "decimal"]) {
    const problems = await check(deck, { slide });
    assert.deepEqual(problems.map(formatProblem), [], slide);
  }
});
