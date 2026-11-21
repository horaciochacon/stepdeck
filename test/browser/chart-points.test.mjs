// `chart.points` in Chrome: estimates with intervals by category, a reference line, `shown`, `highlight`, the
// "no data" mark, the domain error and the owned entrance. Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test --test-concurrency=1 test/browser/chart-points.test.mjs
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
} from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const deck = fileURLToPath(new URL("../fixtures/decks/points/", import.meta.url));
const pages = deckPages("test/fixtures/decks/points/");
const broken = deckPages("test/fixtures/decks/points-broken/");
const STEPS = {
  estimates: ["base", "later", "titled"],
  reference: ["none", "line", "moved"],
  shown: ["none", "one", "three", "all"],
  highlight: ["all", "focus", "after", "wide"],
  missing: ["first", "later"],
  entrance: ["start", "go", "more"],
};

// Per row, in the svg's own pixels (attributes) and on screen (boxes, for overflow).
const rows = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-el="points"] g.sd-points-row')].map((g) => {
        const dot = g.querySelector(":scope > circle.sd-dot");
        const line = g.querySelector(":scope > g.sd-whisker > line.sd-whisker-line");
        const value = g.querySelector(":scope > text.sd-points-value");
        const blank = g.querySelector(":scope > text.sd-no-data");
        const n = (node, a) => (node ? Number(node.getAttribute(a)) : null);
        return [g.dataset.key, {
          transform: g.getAttribute("transform"),
          visible: getComputedStyle(g).visibility === "visible",
          dim: g.dataset.dim,
          cx: n(dot, "cx"),
          r: n(dot, "r"),
          fill: dot ? getComputedStyle(dot).fill : null,
          whisker: line ? [n(line, "x1"), n(line, "x2")] : null,
          whiskerStroke: line ? getComputedStyle(line).stroke : null,
          halo: line ? line.previousElementSibling?.classList.contains("sd-halo-under") && line.previousElementSibling.getAttribute("x1") === line.getAttribute("x1") && line.previousElementSibling.getAttribute("x2") === line.getAttribute("x2") : null,
          value: value ? { text: value.textContent, anchor: value.getAttribute("text-anchor"), fill: getComputedStyle(value).fill } : null,
          noData: blank ? { text: blank.textContent, fill: getComputedStyle(blank).fill } : null,
        }];
      }),
    ),
  );

const axis = (page) =>
  page.evaluate(() => ({
    plot: document.querySelector('[data-el="points"] g.sd-plot').getAttribute("transform"),
    ticks: [...document.querySelectorAll('[data-el="points"] .sd-axis-value g.tick')].map((t) => [t.querySelector("text").textContent, t.getAttribute("transform")]),
  }));

const errorsClean = async (page, ctx) => {
  assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
  assert.deepEqual(ctx.errors, []);
};

test("chart.points renders estimates with whiskers on halos and labels that fit", async () => {
  await withPage({ root, url: pages.url("estimates", "step=base") }, async (page, ctx) => {
    const at = await rows(page);
    assert.deepEqual(Object.keys(at), ["Norte", "Sur", "Este", "Oeste", "Centro"], "one row per category, in data order");
    for (const [key, r] of Object.entries(at)) {
      assert.ok(r.visible && r.cx > 0 && r.r > 0, `${key}: a dot`);
      assert.ok(r.whisker && r.whisker[0] < r.cx && r.cx < r.whisker[1], `${key}: a whisker around its dot`);
      assert.equal(r.halo, true, `${key}: the whisker sits on a halo`);
      assert.ok(r.value?.text, `${key}: a value label`);
    }
    assert.deepEqual(Object.values(at).map((r) => r.value.text), ["12,4", "8,6", "15,2", "6,1", "17,5"], "decimal comma");
    assert.equal(new Set(Object.values(at).map((r) => r.transform)).size, 5, "each row in its own band");
    const labels = await page.evaluate(() => [...document.querySelectorAll('[data-el="points"] g.sd-points-labels text.sd-points-label')].map((t) => t.textContent));
    assert.deepEqual(labels, ["Norte", "Sur", "Este", "Oeste", "Centro"]);

    // Every value label stays inside the svg; the one nearest the right edge does not fit past its whisker, so it
    // flips to the whisker's other side (anchored at its end), clear of the whisker.
    const fit = await page.evaluate(() => {
      const svg = document.querySelector('[data-el="points"] svg').getBoundingClientRect();
      return Object.fromEntries([...document.querySelectorAll('[data-el="points"] g.sd-points-row')].map((g) => {
        const t = g.querySelector("text.sd-points-value").getBoundingClientRect();
        const w = g.querySelector("line.sd-whisker-line").getBoundingClientRect();
        return [g.dataset.key, { left: t.left - svg.left, right: svg.right - t.right, clearLeft: w.left - t.right, clearRight: t.left - w.right }];
      }));
    });
    for (const [key, f] of Object.entries(fit)) assert.ok(f.left >= -0.5 && f.right >= -0.5, `${key}: the value label is inside the svg (${JSON.stringify(f)})`);
    const rightmost = Object.entries(at).sort((a, b) => b[1].whisker[1] - a[1].whisker[1])[0];
    assert.equal(rightmost[0], "Centro");
    assert.equal(rightmost[1].value.anchor, "end", "the rightmost label is flipped");
    assert.ok(fit.Centro.clearLeft > 0, `and sits left of its whisker, not on it (${JSON.stringify(fit.Centro)})`);
    assert.equal(at.Oeste.value.anchor, "start", "a label with room sits past its whisker");
    assert.ok(fit.Oeste.clearRight > 0, `right of its whisker (${JSON.stringify(fit.Oeste)})`);
    await errorsClean(page, ctx);
  });
});

test("jump equals played, backward, interrupted", async () => {
  await withPage({ root, url: pages.url("estimates", "step=base") }, async (page, ctx) => {
    for (const [slide, steps] of Object.entries(STEPS)) {
      await expectJumpEqualsPlayed(ctx, page, { pages, slide, steps, id: "points" });
      await expectBackwardEqualsJump(ctx, page, { pages, slide, steps, id: "points" });
    }
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "estimates", from: "base", via: "later", to: "titled", id: "points" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "estimates", from: "later", via: "titled", to: "base", id: "points" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "highlight", from: "all", via: "focus", to: "after", id: "points" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "highlight", from: "after", via: "wide", to: "focus", id: "points" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "shown", from: "none", via: "one", to: "all", id: "points" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "shown", from: "three", via: "all", to: "none", id: "points" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "reference", from: "none", via: "line", to: "moved", id: "points" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "missing", from: "first", via: "later", to: "first", id: "points" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "entrance", from: "start", via: "go", to: "more", id: "points" });
  });
});

test("a played step really moves: y tweens, rows grow in, the reference and the titles fade", async () => {
  await withPage({ root, url: pages.url("estimates", "step=base") }, async (page, ctx) => {
    const cx = (key) => (p) => p.evaluate((key) => document.querySelector(`[data-el="points"] g.sd-points-row[data-key="${key}"] circle.sd-dot`).getAttribute("cx"), key);
    const moved = await expectAnimatedStepMoves(ctx, page, { pages, slide: "estimates", from: "base", to: "later", id: "points", probe: cx("Centro") });
    assert.ok(Number(moved.mid) > Number(moved.end), "Centro's dot is still on its way down 120 ms in");
    const grow = await expectAnimatedStepMoves(ctx, page, {
      pages, slide: "shown", from: "none", to: "one", id: "points",
      probe: (p) => p.evaluate(() => document.querySelector('[data-el="points"] g.sd-points-row[data-key="Norte"] circle.sd-dot').getAttribute("r")),
    });
    assert.ok(Number(grow.mid) < Number(grow.end), "the new row's dot is still growing");
    const opacity = (selector) => (p) => p.evaluate((s) => document.querySelector(s)?.getAttribute("opacity") ?? "none", selector);
    const ref = await expectAnimatedStepMoves(ctx, page, { pages, slide: "reference", from: "none", to: "line", id: "points", probe: opacity('[data-el="points"] g.sd-reference') });
    assert.ok(Number(ref.mid) > 0 && Number(ref.mid) < 1 && ref.end === "none", `the reference fades in (${ref.mid} -> ${ref.end})`);
    const title = await expectAnimatedStepMoves(ctx, page, { pages, slide: "estimates", from: "later", to: "titled", id: "points", probe: opacity('[data-el="points"] text.sd-axis-title-band') });
    assert.ok(Number(title.mid) > 0 && Number(title.mid) < 1 && title.end === "none", `the category axis title fades in (${title.mid} -> ${title.end})`);
    await errorsClean(page, ctx);
  });
});

test("the axis stays when y switches", async () => {
  await withPage({ root, url: pages.url("estimates", "step=base") }, async (page, ctx) => {
    const base = await axis(page);
    const before = await rows(page);
    assert.ok(base.ticks.length >= 3, `ticks ${JSON.stringify(base.ticks)}`);
    for (const step of ["later", "titled"]) {
      await ctx.open(pages.url("estimates", `step=${step}`));
      assert.deepEqual(await axis(page), base, `${step}: the same ticks, at the same places, and the same plot`);
    }
    // Played as well, and the values did move.
    await ctx.open(pages.url("estimates", "step=base&motion=full"));
    await goTo(page, "estimates", "later");
    assert.deepEqual(await axis(page), base);
    const after = await rows(page);
    assert.ok(after.Centro.cx < before.Centro.cx, "Centro's dot moved to its new value");
    assert.deepEqual(Object.values(after).map((r) => r.transform), Object.values(before).map((r) => r.transform), "the rows keep their bands");
    await errorsClean(page, ctx);
  });
});

test("a played domain change tweens the axis; the plot keeps its size", async () => {
  await withPage({ root, url: pages.url("highlight", "step=all") }, async (page, ctx) => {
    const plotEnd = (p) => p.evaluate(() => Number(document.querySelector('[data-el="points"] line.sd-axis-line').getAttribute("x2")));
    const widths = [];
    for (const step of STEPS.highlight) {
      await ctx.open(pages.url("highlight", `step=${step}`));
      widths.push(await plotEnd(page));
    }
    assert.equal(new Set(widths).size, 1, `the same plot width at every step: ${widths}`);
    const ticks = await page.evaluate(() => [...document.querySelectorAll('[data-el="points"] .sd-axis-value g.tick text')].map((t) => t.textContent));
    assert.ok(ticks.includes("120,0"), `the wide axis: ${ticks}`);
    // The tick at 20 is on both axes: it slides from the right end to a sixth of the way.
    const tick20 = (p) => p.evaluate(() => {
      const t = [...document.querySelectorAll('[data-el="points"] .sd-axis-value g.tick')].find((g) => g.querySelector("text").textContent === "20,0");
      return Number(/translate\(([-\d.e]+),/.exec(t.getAttribute("transform"))[1]);
    });
    const moved = await expectAnimatedStepMoves(ctx, page, { pages, slide: "highlight", from: "after", to: "wide", id: "points", probe: tick20 });
    assert.ok(moved.mid > moved.end && moved.mid <= widths[0], `the tick at 20 slides left (${moved.mid} -> ${moved.end})`);
    await errorsClean(page, ctx);
  });
});

test("no data mark on missing, in Spanish", async () => {
  await withPage({ root, url: pages.url("missing", "step=first") }, async (page, ctx) => {
    const muted = await tokenRgb(page, "--sd-color-muted");
    const first = await rows(page);
    assert.deepEqual(first.Oeste.noData, { text: "sin datos", fill: muted }, "the mark, muted");
    assert.equal(first.Oeste.cx, null, "no dot");
    assert.equal(first.Oeste.whisker, null, "no whisker");
    assert.equal(first.Oeste.value, null, "no value label");
    assert.ok(first.Oeste.visible);
    assert.ok(first.Sur.cx !== null && first.Sur.noData === null);
    const labels = await page.evaluate(() => [...document.querySelectorAll('[data-el="points"] text.sd-points-label')].map((t) => t.textContent));
    assert.ok(labels.includes("Oeste"), "its label shows");
    const title = await page.evaluate(() => document.querySelector('[data-el="points"] g.sd-points-row[data-key="Oeste"] > title').textContent);
    assert.equal(title, "Oeste: sin datos");

    // At `later` the other row is empty; played, it ends as a jump does (no dot left at zero or anywhere).
    const jumped = await htmlAfterJump(ctx, page, pages, "missing", "later", "points");
    await ctx.open(pages.url("missing", "step=first&motion=full"));
    await goTo(page, "missing", "later");
    assert.equal(await elementHtml(page, "points"), jumped);
    const later = await rows(page);
    assert.equal(later.Sur.cx, null);
    assert.equal(later.Sur.noData.text, "sin datos");
    assert.ok(later.Oeste.cx > 0 && later.Oeste.noData === null, "Oeste has its dot back");
    await errorsClean(page, ctx);
  });
});

test("hidden rows keep their slot; highlight dims the other rows over --sd-duration-fast, never by opacity", async () => {
  await withPage({ root, url: pages.url("shown", "step=none") }, async (page, ctx) => {
    const none = await rows(page);
    assert.ok(Object.values(none).every((r) => !r.visible), "every row hidden");
    await ctx.open(pages.url("shown", "step=one"));
    const one = await rows(page);
    assert.deepEqual(Object.entries(one).filter(([, r]) => r.visible).map(([k]) => k), ["Norte"]);
    await ctx.open(pages.url("shown", "step=all"));
    const all = await rows(page);
    assert.deepEqual(Object.values(all).map((r) => r.transform), Object.values(none).map((r) => r.transform), "the same bands");
    assert.deepEqual(Object.values(all).map((r) => r.cx), Object.values(none).map((r) => r.cx), "hidden rows are laid out where they will be");

    await ctx.open(pages.url("highlight", "step=focus"));
    const dim = await tokenRgb(page, "--sd-color-dim");
    const muted = await tokenRgb(page, "--sd-color-muted");
    const focus = await rows(page);
    assert.deepEqual(Object.values(focus).map((r) => r.dim), ["true", "true", "false", "true", "true"]);
    assert.equal(focus.Norte.fill, dim, "a dimmed dot is the dim colour");
    assert.equal(focus.Norte.whiskerStroke, dim, "and so is its whisker");
    assert.equal(focus.Norte.value.fill, muted, "its value label turns muted");
    assert.notEqual(focus.Este.fill, dim, "the focused dot keeps its colour");
    assert.notEqual(focus.Este.whiskerStroke, dim);
    const opacities = await page.evaluate(() => [...document.querySelectorAll('[data-el="points"] svg *')].map((n) => getComputedStyle(n).opacity));
    assert.ok(opacities.every((o) => o === "1"), "nothing is faded");

    await ctx.open(pages.url("highlight", "step=all&motion=full"));
    const r = await sampleFrames(page, "highlight", "focus", "points", () => {
      const dot = document.querySelector('[data-el="points"] g.sd-points-row[data-key="Norte"] circle.sd-dot');
      return { color: getComputedStyle(dot).fill, opacity: getComputedStyle(dot).opacity };
    });
    const move = colorMove(r.frames);
    assert.equal(move.to, dim, "Norte's dot ends at the dim colour");
    assert.ok(move.moved >= 3, `the colour was seen part-way (${move.moved} frames)`);
    assert.ok(r.frames.every((f) => f.opacity === "1"), "opacity never changes");
    assert.ok(move.arrived >= 170, `200 ms, not a snap (arrived at ${move.arrived.toFixed(0)} ms)`);
    assert.ok(move.arrived < 0.4 * r.settledMs, `done in the fast duration, well before the morph settles (${move.arrived.toFixed(0)} of ${r.settledMs.toFixed(0)} ms)`);
    await errorsClean(page, ctx);
  });
});

test("domain error shows on the slide", async () => {
  await withPage({ root, url: broken.url("domain-error", "") }, async (page, ctx) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.deepEqual(errors, ["domain-error/points: estimate 'Norte' (12.4) is outside `domain` [0, 10]"]);
    const shown = await page.evaluate(() => document.querySelector('[data-el="points"] .sd-error')?.textContent);
    assert.match(shown ?? "", /estimate 'Norte' \(12\.4\) is outside `domain` \[0, 10\]/);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-el="src"]')).visibility), "visible");
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("owned entrance grows from the reference", async () => {
  await withPage({ root, url: pages.url("entrance", "step=start&motion=full") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    const r = await sampleFrames(page, "entrance", "go", "points", (el) => {
      const dot = el.querySelector('g.sd-points-row[data-key="Centro"] circle.sd-dot');
      const line = el.querySelector('g.sd-points-row[data-key="Centro"] line.sd-whisker-line');
      return {
        cx: Number(dot.getAttribute("cx")),
        r: Number(dot.getAttribute("r")),
        span: Math.abs(Number(line.getAttribute("x2")) - Number(line.getAttribute("x1"))),
        ref: Number(el.querySelector("g.sd-reference line.sd-rule").getAttribute("x1")),
      };
    });
    const shown = r.frames.filter((f) => f.visible);
    assert.ok(shown.length > 0, "the chart is shown");
    const first = shown[0];
    const { end } = r;
    assert.ok(Math.abs(end.cx - end.ref) > 20, `Centro sits away from the reference at rest (${end.cx} vs ${end.ref})`);
    assert.ok(Math.abs(first.cx - first.ref) < 1, `the first frame shown has the dot on the reference (${first.cx} vs ${first.ref})`);
    assert.equal(first.r, 0, "and not grown yet");
    assert.equal(first.span, 0, "with no whisker");
    assert.ok(shown.some((f) => f.cx > end.ref + 1 && f.cx < end.cx - 1), "the dot passes between the reference and its value");
    const drawing = shown.findIndex((f) => f.span > 0);
    assert.ok(drawing > 0 && shown[drawing].cx === end.cx, "the whisker draws once the dot has arrived");
    assert.ok(shown.some((f) => f.span > 0 && f.span < end.span), "and draws outward");
    assert.deepEqual(r.frames.filter((f) => f.style !== null).map((f) => f.style), [], "the box stays still: the chart builds itself");
    const moving = shown.filter((f) => f.cx !== end.cx || f.span !== end.span);
    const spanMs = moving.at(-1).ms - first.ms;
    assert.ok(spanMs >= 300 && spanMs < 4000, `builds over most of 2 x --sd-duration (${spanMs.toFixed(0)} ms)`);
    assert.equal(await elementHtml(page, "points"), await htmlAfterJump(ctx, page, pages, "entrance", "go", "points"));
    await errorsClean(page, ctx);
  });
});

test("the start state is written before update awaits its data", async () => {
  await withPage({ root, url: pages.url("estimates", "step=base"), size: 960 }, async (page) => {
    const r = await page.evaluate(async () => {
      const { default: chart } = await import("../components/chart.points/index.js");
      const { animate } = await import("../core/animate.js");
      const { d3 } = await import("../core/d3.js");
      const host = document.createElement("div");
      host.style.cssText = "position:absolute;left:0;top:0;width:1000px;height:600px";
      document.querySelector(".sd-canvas").appendChild(host);
      const data = [{ g: "a", v: 10, lo: 6, hi: 14 }, { g: "b", v: 20, lo: 15, hi: 25 }];
      let gate = null; // while set, the data stays loading
      const ctx = {
        d3, animate,
        data: () => gate ?? Promise.resolve(data),
        format: (spec) => d3.format(spec),
        t: (key) => key,
        tokens: { "--sd-font-size-label": "28px", "--sd-color-ink": "#111111", "--sd-color-muted": "#555555", "--sd-color-rule": "#cccccc", "--sd-color-background": "#ffffff" },
        palette: () => ({ colors: ["#0072b2"] }),
        size: { w: 1000, h: 600 },
        stepProps: null,
      };
      const read = () => [...host.querySelectorAll("g.sd-points-row")].map((g) => {
        const line = g.querySelector("line.sd-whisker-line");
        return { cx: Number(g.querySelector("circle.sd-dot").getAttribute("cx")), r: Number(g.querySelector("circle.sd-dot").getAttribute("r")), span: Number(line.getAttribute("x2")) - Number(line.getAttribute("x1")) };
      });
      const props = { data: "d.csv", x: "g", y: "v", interval: { lower: "lo", upper: "hi" }, domain: [0, 30], reference: 5 };
      const inst = await chart.mount(host, props, ctx);
      const signal = new AbortController().signal;
      await inst.update(props, { prev: null, changed: Object.keys(props), animate: false, entered: false, entrance: null, signal });
      const before = read();
      const ref = Number(host.querySelector("g.sd-reference line.sd-rule").getAttribute("x1"));
      let release;
      gate = new Promise((resolve) => (release = () => resolve(data)));
      const t0 = performance.now();
      const updating = inst.update(props, { prev: props, changed: [], animate: true, entered: true, entrance: { motion: "draw", duration: 120 }, signal });
      const sync = read();
      release();
      await updating;
      const ms = performance.now() - t0;
      const end = read();
      host.remove();
      return { before, sync, ms, end, ref };
    });
    assert.ok(r.before.every((b) => b.r > 0 && b.span > 0), "drawn while hidden");
    assert.deepEqual(r.sync, r.before.map(() => ({ cx: r.ref, r: 0, span: 0 })), "dots on the reference, not grown, no whisker, before the data arrives");
    assert.ok(r.ms >= 100 && r.ms < 600, `entrance.duration (120 ms) wins over 2 x --sd-duration (took ${r.ms.toFixed(0)} ms)`);
    assert.deepEqual(r.end, r.before);
  });
});

for (const theme of ["academic-light", "modern"]) {
  test(`check --played is clean on the points deck under ${theme}`, async () => {
    const problems = await check(deck, { played: true, theme });
    assert.deepEqual(problems.map(formatProblem), []);
  });
}
