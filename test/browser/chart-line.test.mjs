// chart.line in Chrome (spec §6.2 trend example, §6.3 morph rule). Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { deckPages, elementHtml, htmlAfterJump, expectJumpEqualsPlayed, expectBackwardEqualsJump, expectInterruptEqualsJump, sampleFrames, tokenRgb, colorMove, easeAgainstTime } from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const spike = (q) => `engine/core/render.html?deck=../../examples/spike/&${q}`;
const STEPS = ["base", "regimens", "annotate", "focus", "total"];
const motion = deckPages("test/fixtures/decks/motion/"); // modern theme: --sd-duration 400ms, --sd-stagger 80ms
const focus = deckPages("test/fixtures/decks/focus/"); // modern theme: --sd-duration-fast 200ms; steps all, a, b, end

// Everything that must not depend on how a state was reached.
const snapshot = (page) =>
  page.evaluate(() => {
    const svg = document.querySelector('[data-el="chart"] svg');
    if (!svg) return null;
    const paths = [...svg.querySelectorAll("path[data-series]")].map((p) => ({
      series: p.getAttribute("data-series"),
      d: p.getAttribute("d"),
      opacity: getComputedStyle(p).opacity,
    }));
    const ticks = [...svg.querySelectorAll(".tick text")].map((t) => t.textContent);
    const html = svg.outerHTML.replace(/\s*style=""/g, "");
    return { paths, ticks, html };
  });

const opacities = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-el="chart"] path[data-series]')].map((p) => [p.dataset.series, Number(getComputedStyle(p).opacity)]),
    ),
  );

test("jump to step 4 equals played state", async () => {
  await withPage({ root, url: spike("slide=trend&step=total") }, async (page, ctx) => {
    const jumped = await snapshot(page);
    assert.ok(jumped, "the chart renders an svg");
    assert.deepEqual(jumped.paths.map((p) => p.series).sort(), ["combined", "single"]);
    assert.ok(jumped.paths.every((p) => /^M[\d.]+,[\d.]+(L[\d.]+,[\d.]+){10}$/.test(p.d)), "11 points per series");
    assert.ok(jumped.ticks.length > 4, "axes have tick labels");
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);

    // Played one step at a time, each step animated to the end.
    await ctx.open(spike("slide=trend&step=base&motion=full"));
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true, "the played run really animates");
    const atBase = await snapshot(page);
    assert.deepEqual(atBase.paths.map((p) => p.series), ["single"]);
    for (const step of STEPS.slice(1)) {
      await page.evaluate((s) => window.STEPDECK.goTo("trend", s), step);
      await page.evaluate(() => window.STEPDECK.settled());
    }
    assert.deepEqual(await snapshot(page), jumped);

    // Stepping backwards (no animation) lands on the same state as a fresh jump too.
    await ctx.open(spike("slide=trend&step=regimens"));
    const regimensJump = await snapshot(page);
    await ctx.open(spike("slide=trend&step=total&motion=full"));
    await page.evaluate(() => window.STEPDECK.goTo("trend", "regimens"));
    await page.evaluate(() => window.STEPDECK.settled());
    assert.deepEqual(await snapshot(page), regimensJump);
    assert.deepEqual(ctx.errors, []);
  });
});

// Interrupt a morph mid-flight: focus -> total (forward by one, animated), then a new goTo ~120 ms in.
// The in-flight morph is aborted and must snap; the result equals a fresh jump to the new target.
const interruptMorph = (page, target) =>
  page.evaluate(async (target) => {
    const d = () => document.querySelector('[data-el="chart"] path[data-series="combined"]').getAttribute("d");
    const start = d();
    window.STEPDECK.goTo("trend", "total");
    await new Promise((r) => setTimeout(r, 120));
    const mid = d();
    const t0 = performance.now();
    window.STEPDECK.goTo("trend", target);
    await window.STEPDECK.settled();
    const elapsed = performance.now() - t0;
    const svg = document.querySelector('[data-el="chart"] svg');
    return {
      inFlight: mid !== start,
      elapsed,
      leftovers: svg.querySelectorAll("[style], [opacity]:not(path[data-series]):not(.sd-series-label), .sd-exiting").length,
    };
  }, target);

for (const target of ["regimens", "total"]) {
  test(`a morph interrupted mid-flight by goTo('${target}') snaps to the jumped state`, async () => {
    await withPage({ root, url: spike(`slide=trend&step=${target}`) }, async (page, ctx) => {
      const jumped = await snapshot(page);
      await ctx.open(spike("slide=trend&step=focus&motion=full"));
      assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
      const r = await interruptMorph(page, target);
      assert.ok(r.inFlight, "the focus -> total morph was in flight when interrupted");
      // The morph lasts 800 ms; 120 ms in, ~680 ms remain. Aborting snaps, so settling is far quicker.
      assert.ok(r.elapsed < 400, `the aborted morph snapped (settled in ${Math.round(r.elapsed)} ms)`);
      assert.equal(r.leftovers, 0, "no inline styles, stray opacity or exiting nodes remain");
      assert.deepEqual(await snapshot(page), jumped);
      assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
      assert.deepEqual(ctx.errors, []);
    });
  });
}

test("an animated step really moves: mid-flight the path differs from its end state", async () => {
  await withPage({ root, url: spike("slide=trend&step=focus&motion=full") }, async (page) => {
    const before = await snapshot(page);
    const mid = await page.evaluate(async () => {
      window.STEPDECK.goTo("trend", "total");
      await new Promise((r) => setTimeout(r, 120));
      return document.querySelector('[data-el="chart"] path[data-series="combined"]').getAttribute("d");
    });
    await page.evaluate(() => window.STEPDECK.settled());
    const after = await snapshot(page);
    const end = after.paths.find((p) => p.series === "combined").d;
    const start = before.paths.find((p) => p.series === "combined").d;
    assert.notEqual(start, end, "the y morph changes the path");
    assert.notEqual(mid, end, "mid-flight is not the end state");
    assert.notEqual(after.ticks.join("|"), before.ticks.join("|"), "the y axis rescales");
  });
});

test("missing column shows error naming the column", async () => {
  const url = "engine/core/render.html?deck=../../test/fixtures/decks/chart-broken/&slide=missing-column";
  await withPage({ root, url }, async (page, ctx) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^missing-column\/chart: column 'respondrs' not found in data\/dose-response\.csv/);
    const shown = await page.evaluate(() => document.querySelector('[data-el="chart"] .sd-error')?.textContent);
    assert.match(shown ?? "", /column 'respondrs' not found in data\/dose-response\.csv/);
    const ok = await page.evaluate(() => getComputedStyle(document.querySelector('[data-el="ok"]')).visibility);
    assert.equal(ok, "visible");
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("highlight is transient", async () => {
  await withPage({ root, url: spike("slide=trend&step=focus&motion=full") }, async (page, ctx) => {
    const dim = await tokenRgb(page, "--sd-color-dim");
    const atFocus = await marks(page);
    assert.equal(atFocus.single.stroke, dim, "single is dimmed at focus");
    assert.notEqual(atFocus.combined.stroke, dim);
    await page.evaluate(() => window.STEPDECK.goTo("trend", "total"));
    await page.evaluate(() => window.STEPDECK.settled());
    const after = await marks(page);
    assert.deepEqual([after.single.opacity, after.combined.opacity], ["1", "1"]);
    assert.ok(after.single.stroke !== dim && after.combined.stroke !== dim, "no series is dimmed after the highlight step");

    await ctx.open(spike("slide=trend&step=total"));
    assert.deepEqual(await marks(page), after);
  });
});

// Per series: the line's stroke, the band's fill, the label's fill and the elements' opacity, plus the DOM order of
// the lines and the bands (what is drawn on top is last).
const marks = (page) =>
  page.evaluate(() => {
    const svg = document.querySelector('[data-el="chart"] svg');
    const out = {};
    for (const p of svg.querySelectorAll("path.sd-line")) {
      const cs = getComputedStyle(p);
      (out[p.dataset.series] ??= {}).stroke = cs.stroke;
      out[p.dataset.series].opacity = cs.opacity;
    }
    for (const b of svg.querySelectorAll("path.sd-band")) {
      const cs = getComputedStyle(b);
      (out[b.dataset.band] ??= {}).band = cs.fill;
      out[b.dataset.band].bandOpacity = cs.opacity;
    }
    for (const t of svg.querySelectorAll("text.sd-series-label")) (out[t.dataset.label] ??= {}).label = getComputedStyle(t).fill;
    return out;
  });
const drawOrder = (page) =>
  page.evaluate(() => {
    const svg = document.querySelector('[data-el="chart"] svg');
    return { lines: [...svg.querySelectorAll("path.sd-line")].map((p) => p.dataset.series), bands: [...svg.querySelectorAll("path.sd-band")].map((p) => p.dataset.band) };
  });

test("a highlight dims the other series by colour: dim stroke and band, muted label, opacity 1", async () => {
  await withPage({ root, url: focus.url("line", "step=a") }, async (page, ctx) => {
    const [dim, muted] = [await tokenRgb(page, "--sd-color-dim"), await tokenRgb(page, "--sd-color-muted")];
    const at = await marks(page);
    for (const s of ["beta", "gamma"]) {
      assert.equal(at[s].stroke, dim, `${s}: line is the dim colour`);
      assert.equal(at[s].band, dim, `${s}: band is the dim colour`);
      assert.equal(at[s].label, muted, `${s}: label is muted`);
      assert.deepEqual([at[s].opacity, at[s].bandOpacity], ["1", "1"], `${s}: opacity stays 1`);
    }
    await ctx.open(focus.url("line", "step=all"));
    const all = await marks(page);
    assert.equal(at.alpha.stroke, all.alpha.stroke, "the focused series keeps its palette colour");
    assert.equal(at.alpha.band, all.alpha.band);
    assert.equal(at.alpha.label, all.alpha.label);
    for (const s of ["alpha", "beta", "gamma"]) assert.ok(all[s].stroke !== dim && all[s].label !== muted, `${s}: nothing is dimmed without a highlight`);
    assert.deepEqual(ctx.errors, []);
  });
});

test("the focused series is drawn after (above) the dimmed ones, in lines and bands", async () => {
  await withPage({ root, url: focus.url("line", "step=all") }, async (page, ctx) => {
    assert.deepEqual(await drawOrder(page), { lines: ["alpha", "beta", "gamma"], bands: ["alpha", "beta", "gamma"] }, "data order without a highlight");
    await ctx.open(focus.url("line", "step=a"));
    assert.deepEqual(await drawOrder(page), { lines: ["beta", "gamma", "alpha"], bands: ["beta", "gamma", "alpha"] }, "alpha is raised");
    await ctx.open(focus.url("line", "step=b"));
    assert.deepEqual(await drawOrder(page), { lines: ["alpha", "gamma", "beta"], bands: ["alpha", "gamma", "beta"] }, "beta is raised");
  });
});

test("focus: jump equals played, backward and interrupted", async () => {
  const steps = ["all", "a", "b", "end"];
  await withPage({ root, url: focus.url("line", "step=all") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages: focus, slide: "line", steps, id: "chart" });
    await expectBackwardEqualsJump(ctx, page, { pages: focus, slide: "line", steps, id: "chart" });
    await expectInterruptEqualsJump(ctx, page, { pages: focus, slide: "line", from: "all", via: "a", to: "b", id: "chart" });
    await expectInterruptEqualsJump(ctx, page, { pages: focus, slide: "line", from: "a", via: "b", to: "end", id: "chart" });
  });
});

test("a highlight change tweens the colours over --sd-duration-fast, never the opacity", async () => {
  await withPage({ root, url: focus.url("line", "step=all&motion=full") }, async (page, ctx) => {
    const dim = await tokenRgb(page, "--sd-color-dim");
    const r = await sampleFrames(page, "line", "a", "chart", () => {
      const p = document.querySelector('[data-el="chart"] path[data-series="beta"]');
      const cs = getComputedStyle(p);
      return { color: cs.stroke, opacity: cs.opacity };
    });
    const move = colorMove(r.frames);
    assert.equal(move.to, dim, "beta ends at the dim colour");
    assert.ok(move.moved >= 3, `the colour was seen part-way (${move.moved} frames)`);
    assert.ok(r.frames.every((f) => f.opacity === "1"), "opacity never changes");
    assert.ok(move.arrived >= 170, `200 ms, not a snap (arrived at ${move.arrived.toFixed(0)} ms)`);
    // Against the concurrent geometry morph (2 x --sd-duration, 800 ms), which stretches with load as the colour tween does:
    // the fast tween is a quarter of it, a colour tween at --sd-duration would be half.
    assert.ok(move.arrived < 0.4 * r.settledMs, `the colour is done in the fast duration, well before the morph settles (${move.arrived.toFixed(0)} of ${r.settledMs.toFixed(0)} ms)`);
    assert.equal(r.end.style, null);
    assert.deepEqual(ctx.errors, []);
  });
});

test("annotation, series colors from the palette, legible text, anchor", async () => {
  await withPage({ root, url: spike("slide=trend&step=annotate&capture") }, async (page) => {
    const info = await page.evaluate(() => {
      const el = document.querySelector('[data-el="chart"]');
      const svg = el.querySelector("svg");
      const stroke = (s) => getComputedStyle(svg.querySelector(`path[data-series="${s}"]`)).stroke;
      const texts = [...svg.querySelectorAll("text")]
        .filter((t) => !t.closest(".sd-role-source"))
        .map((t) => ({ text: t.textContent, size: parseFloat(getComputedStyle(t).fontSize) }));
      return { strokes: [stroke("single"), stroke("combined")], texts, svgText: svg.textContent };
    });
    // academic-light okabe-ito-dark: blue #0072b2, orange #c38602, in series order.
    assert.deepEqual(info.strokes, ["rgb(0, 114, 178)", "rgb(195, 134, 2)"]);
    assert.ok(info.texts.length > 0);
    for (const t of info.texts) assert.ok(t.size >= 28, `"${t.text}" is ${t.size}px, below 28px`);
    assert.match(info.svgText, /250 mg/);
    assert.match(info.svgText, /Dose \(mg\)/);
    assert.match(info.svgText, /Participants responding/);
  });
});

test("anchor('series:<name>') returns a canvas-pixel box", async () => {
  await withPage({ root, url: "engine/core/render.html?deck=../../examples/spike/&slide=hello", size: 960 }, async (page) => {
    const box = await page.evaluate(async () => {
      const { default: chart } = await import("../components/chart.line/index.js");
      const { d3 } = await import("../core/d3.js");
      const host = document.createElement("div");
      host.style.cssText = "position:absolute;left:0;top:0;width:1000px;height:600px";
      document.querySelector(".sd-canvas").appendChild(host);
      const rows = [
        { x: 0, s: "a", v: 0 }, { x: 10, s: "a", v: 10 },
        { x: 0, s: "b", v: 5 }, { x: 10, s: "b", v: 5 },
      ];
      const ctx = {
        d3,
        data: async () => rows,
        format: (spec) => d3.format(spec),
        animate: (await import("../core/animate.js")).animate,
        tokens: { "--sd-font-size-label": "28px" },
        palette: () => ({ colors: ["red", "blue"] }),
        size: { w: 1000, h: 600 },
      };
      const props = { data: "d.csv", x: "x", y: "v", series: "s", axes: { x: "X", y: "Y" } };
      const inst = await chart.mount(host, props, ctx);
      await inst.update(props, { prev: null, changed: Object.keys(props), animate: false, signal: new AbortController().signal });
      return { a: inst.anchor("series:a"), b: inst.anchor("series:b"), none: inst.anchor("series:zzz") };
    });
    for (const k of ["a", "b"]) {
      for (const f of ["x", "y", "w", "h"]) assert.equal(typeof box[k][f], "number", `${k}.${f}`);
      assert.ok(box[k].x >= 0 && box[k].x + box[k].w <= 1000, `${k} lies within the host width`);
    }
    assert.ok(box.a.h > 100, "a rising series spans height");
    assert.ok(box.b.h < 5, "a flat series is a thin box");
    assert.ok(box.a.w > 500, "canvas pixels, not the scaled-down viewport pixels");
    assert.equal(box.none, null);
  });
});

// Owned entrance. Per frame: the first line's inline stroke-dashoffset, whether any line has a dash style, and
// the chart's markup.
const lineProbe = (el) => {
  const paths = [...el.querySelectorAll("path.sd-line")];
  return {
    offset: Number(paths[0]?.style.strokeDashoffset) || 0,
    dashed: paths.some((p) => p.style.strokeDasharray !== "" || p.style.strokeDashoffset !== ""),
    content: el.innerHTML,
  };
};
const errorsClean = async (page, ctx) => {
  assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
  assert.deepEqual(ctx.errors, []);
};

test("no flash before the draw: held for its slot, the line starts undrawn and draws while the box stays still", async () => {
  await withPage({ root, url: motion.url("chart-third", "step=start&motion=full") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    const r = await sampleFrames(page, "chart-third", "go", "chart", lineProbe);
    const shown = r.frames.filter((f) => f.visible);
    assert.ok(shown.length > 0, "the chart is shown");
    const first = shown[0];
    assert.ok(first.offset > 0, `the first frame with the chart shown has an undrawn line (dashoffset ${first.offset})`);
    assert.ok(first.ms >= 150, `held for the third slot, 2 x 80 ms (first shown at ${first.ms.toFixed(0)} ms)`);
    assert.deepEqual(r.frames.filter((f) => f.style !== null).map((f) => f.style), [], "the box stays still: the chart draws itself");
    const drawing = shown.filter((f) => f.dashed);
    const span = drawing.at(-1).ms - first.ms;
    // A stall can only shorten the sampled span by delaying the first shown frame; 1 x --sd-duration would be 400.
    assert.ok(span >= 600 && span < 4000, `draws over 2 x --sd-duration, 800 ms (${span.toFixed(0)} ms)`);
    assert.equal(r.end.dashed, false, "no dash style left at the end");
    assert.equal(await elementHtml(page, "chart"), await htmlAfterJump(ctx, page, motion, "chart-third", "go", "chart"));

    // Played equals jumped at every step; interrupted while held for its slot, or mid-draw, equals a jump.
    await expectJumpEqualsPlayed(ctx, page, { pages: motion, slide: "chart-third", steps: ["start", "go", "more"], id: "chart" });
    await expectInterruptEqualsJump(ctx, page, { pages: motion, slide: "chart-third", from: "start", via: "go", to: "more", id: "chart" });
    const jumped = await htmlAfterJump(ctx, page, motion, "chart-third", "more", "chart");
    await ctx.open(motion.url("chart-third", "step=start&motion=full"));
    const midDraw = await page.evaluate(async () => {
      const path = () => document.querySelector('[data-el="chart"] path.sd-line');
      window.STEPDECK.goTo("chart-third", "go");
      let drawing = false;
      for (let i = 0; i < 300 && !drawing; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        drawing = Number(path().style.strokeDashoffset) > 0 && getComputedStyle(document.querySelector('[data-el="chart"]')).visibility === "visible";
      }
      window.STEPDECK.goTo("chart-third", "more");
      await window.STEPDECK.settled();
      return drawing;
    });
    assert.ok(midDraw, "the line was being drawn when the next step came");
    assert.equal(await elementHtml(page, "chart"), jumped, "interrupted mid-draw equals a jump");
    await errorsClean(page, ctx);
  });
});

test("the entrance draw eases with the theme's --sd-easing: under a linear easing, a quarter of the time is a quarter of the line", async () => {
  // line-ease: --sd-easing: linear on the slide; the chart enters on a 1600 ms step and draws its line.
  await withPage({ root, url: motion.url("line-ease", "step=start&motion=full") }, async (page, ctx) => {
    const r = await sampleFrames(page, "line-ease", "go", "chart", () => {
      const path = document.querySelector('[data-el="chart"] path.sd-line');
      const offset = parseFloat(path.style.strokeDashoffset);
      return { drawn: Number.isFinite(offset) ? 1 - offset / path.getTotalLength() : 1 };
    });
    // Only frames where the chart is on screen: before it shows, its (hidden) line is fully drawn from the jump.
    const samples = r.frames.filter((f) => f.visible).map((f) => ({ ms: f.ms, p: f.drawn }));
    assert.ok(samples.length > 10, `the draw was sampled (${samples.length} frames)`);
    assert.ok(samples[0].p < 0.1, `the line starts undrawn (${samples[0].p.toFixed(3)})`);
    const fit = easeAgainstTime(samples);
    assert.ok(fit.span > 1200, `the draw lasts the step's 1600 ms (${fit.span.toFixed(0)} ms)`);
    assert.ok(fit.checked >= 3, `samples a fifth to a half of the way through (${fit.checked})`);
    assert.ok(fit.worst < 0.06, `linear in time, not cubic in-out: worst |drawn - time| ${fit.worst.toFixed(3)}`);
    assert.deepEqual(ctx.errors, []);
  });
});

test("the start state is written before update awaits its data", async () => {
  await withPage({ root, url: spike("slide=trend&step=base") }, async (page) => {
    const r = await page.evaluate(async () => {
      const { default: chart } = await import("../components/chart.line/index.js");
      const { animate } = await import("../core/animate.js");
      const { d3 } = await import("../core/d3.js");
      const host = document.createElement("div");
      host.style.cssText = "position:absolute;left:0;top:0;width:1000px;height:600px";
      document.querySelector(".sd-canvas").appendChild(host);
      const rows = [{ x: 0, y: 1 }, { x: 5, y: 4 }, { x: 10, y: 2 }];
      let gate = null; // while set, the data stays loading
      const ctx = {
        d3, animate,
        data: () => gate ?? Promise.resolve(rows),
        format: (spec) => d3.format(spec),
        tokens: { "--sd-font-size-label": "28px" },
        palette: () => ({ colors: ["#0072b2"] }),
        size: { w: 1000, h: 600 },
      };
      const props = { data: "d.csv", x: "x", y: "y", axes: { x: "X", y: "Y" } };
      const inst = await chart.mount(host, props, ctx);
      const signal = new AbortController().signal;
      await inst.update(props, { prev: null, changed: Object.keys(props), animate: false, entered: false, entrance: null, signal });
      let release;
      gate = new Promise((resolve) => (release = () => resolve(rows)));
      const path = () => host.querySelector("path.sd-line");
      const t0 = performance.now();
      const updating = inst.update(props, { prev: props, changed: [], animate: true, entered: true, entrance: { motion: "draw", duration: 120 }, signal });
      const sync = { dasharray: path().style.strokeDasharray, offset: Number(path().style.strokeDashoffset) || 0 };
      release();
      await updating;
      const ms = performance.now() - t0;
      const end = path().getAttribute("style");
      host.remove();
      return { sync, ms, end };
    });
    assert.ok(r.sync.dasharray !== "" && r.sync.offset > 0, `undrawn before the data arrives: ${JSON.stringify(r.sync)}`);
    assert.ok(r.ms >= 100 && r.ms < 600, `entrance.duration (120 ms) wins over 2 x --sd-duration (took ${r.ms.toFixed(0)} ms)`);
    assert.equal(r.end, null, "no dash style left");
  });
});

test("enter none snaps: no frame in motion, the end equals the jump", async () => {
  await withPage({ root }, async (page, ctx) => {
    const jumped = await htmlAfterJump(ctx, page, motion, "chart-none", "go", "chart");
    const content = await page.evaluate(() => document.querySelector('[data-el="chart"]').innerHTML);
    await ctx.open(motion.url("chart-none", "step=start&motion=full"));
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    const r = await sampleFrames(page, "chart-none", "go", "chart", lineProbe);
    const shown = r.frames.filter((f) => f.visible);
    assert.ok(shown.length > 0, "the chart is shown");
    assert.deepEqual(shown.filter((f) => f.style !== null || f.dashed || f.content !== content).map((f) => f.ms), [], "every shown frame is the end state");
    assert.equal(await elementHtml(page, "chart"), jumped);
    await errorsClean(page, ctx);
  });
});

test("enter rise: the box rises, the chart is drawn at once", async () => {
  await withPage({ root }, async (page, ctx) => {
    const jumped = await htmlAfterJump(ctx, page, motion, "chart-rise", "go", "chart");
    const content = await page.evaluate(() => document.querySelector('[data-el="chart"]').innerHTML);
    await ctx.open(motion.url("chart-rise", "step=start&motion=full"));
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    const r = await sampleFrames(page, "chart-rise", "go", "chart", lineProbe);
    assert.ok(r.frames.some((f) => f.visible && /translateY/.test(f.style ?? "")), "the box rises");
    assert.deepEqual(r.frames.filter((f) => f.dashed).map((f) => f.ms), [], "no line path ever has an inline dash style");
    assert.deepEqual(r.frames.filter((f) => f.visible && f.content !== content).map((f) => f.ms), [], "the chart is drawn from the first frame");
    assert.equal(await elementHtml(page, "chart"), jumped);
    await errorsClean(page, ctx);
  });
});
