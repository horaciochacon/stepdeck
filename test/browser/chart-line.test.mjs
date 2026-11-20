// chart.line in Chrome (spec §6.2 trend example, §6.3 morph rule). Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const spike = (q) => `core/render.html?deck=../examples/spike/&${q}`;
const STEPS = ["base", "regimens", "annotate", "focus", "total"];

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
  const url = "core/render.html?deck=../test/fixtures/decks/chart-broken/&slide=missing-column";
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
    const atFocus = await opacities(page);
    assert.equal(atFocus.combined, 1);
    assert.ok(atFocus.single < 1, `single is dimmed at focus (opacity ${atFocus.single})`);
    await page.evaluate(() => window.STEPDECK.goTo("trend", "total"));
    await page.evaluate(() => window.STEPDECK.settled());
    assert.deepEqual(await opacities(page), { single: 1, combined: 1 });

    await ctx.open(spike("slide=trend&step=total"));
    assert.deepEqual(await opacities(page), { single: 1, combined: 1 });
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
  await withPage({ root, url: "core/render.html?deck=../examples/spike/&slide=hello", size: 960 }, async (page) => {
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
