// chart.line points and forecast segment in Chrome. Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test --test-concurrency=1 test/browser/chart-line-story.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { checkPlayed } from "../../cli/check.js";
import { deckPages, expectJumpEqualsPlayed, expectBackwardEqualsJump, expectInterruptEqualsJump, expectAnimatedStepMoves, tokenRgb } from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const deck = fileURLToPath(new URL("../fixtures/decks/line-story/", import.meta.url));
const pages = deckPages("test/fixtures/decks/line-story/");
const STEPS = ["none", "points", "forecast", "label", "exact"];
const run = { pages, slide: "forecast", id: "chart" };

/** What the chart shows, read from the DOM: geometry in plot pixels, so it needs no knowledge of the layout. */
const read = async (page) => {
  const state = await page.evaluate(() => {
    const el = document.querySelector('[data-el="chart"]');
    const q = (sel) => [...el.querySelectorAll(sel)];
    const pair = (s) => s.split(/[ML]/).filter(Boolean).map((p) => p.split(",").map(Number));
    const tx = (g) => Number(/translate\(([-\d.]+)/.exec(g.getAttribute("transform"))[1]);
    const ticks = q("g.sd-tick-x").map((g) => ({ label: Number(g.querySelector("text").textContent), x: tx(g) }));
    const [a, b] = [ticks[0], ticks.at(-1)]; // the scale is linear: two ticks give it
    const region = el.querySelector("rect.sd-forecast-region");
    const divider = el.querySelector(".sd-forecast line.sd-rule");
    const label = el.querySelector(".sd-forecast text.sd-rule-label");
    const lines = Object.fromEntries(q("path.sd-line").map((p) => [p.dataset.series, p.getAttribute("d") ? pair(p.getAttribute("d")) : []]));
    const dotted = Object.fromEntries(q("path.sd-forecast-line").map((p) => [p.dataset.forecast, pair(p.getAttribute("d"))]));
    const css = (sel) => (el.querySelector(sel) ? getComputedStyle(el.querySelector(sel)) : null);
    return {
      ticks: [a, b],
      lines, dotted,
      baselineEnd: Number(el.querySelector(".sd-axis-line").getAttribute("x2")),
      region: region && { x: Number(region.getAttribute("x")), w: Number(region.getAttribute("width")), h: Number(region.getAttribute("height")), fill: getComputedStyle(region).fill },
      divider: divider && { x1: Number(divider.getAttribute("x1")), x2: Number(divider.getAttribute("x2")), y1: Number(divider.getAttribute("y1")), y2: Number(divider.getAttribute("y2")) },
      label: label?.textContent ?? null,
      dots: q("circle.sd-dot").map((c) => ({ series: c.dataset.series, cx: Number(c.getAttribute("cx")), hollow: c.classList.contains("sd-dot-hollow"), r: Number(c.getAttribute("r")) })),
      pointsGroups: q("g.sd-points").length,
      forecastGroups: q("g.sd-forecast").length,
      forecastBands: q("path.sd-band.sd-band-forecast").map((p) => p.getAttribute("d")),
      bands: q("path.sd-band:not(.sd-band-forecast)").map((p) => p.getAttribute("d")),
      dash: css("path.sd-forecast-line") && { dasharray: css("path.sd-forecast-line").strokeDasharray, cap: css("path.sd-forecast-line").strokeLinecap },
      bandOpacity: [css("path.sd-band:not(.sd-band-forecast)")?.fillOpacity, css("path.sd-band-forecast")?.fillOpacity],
    };
  });
  const [a, b] = state.ticks;
  return { ...state, xOf: (year) => a.x + ((year - a.label) * (b.x - a.x)) / (b.label - a.label) };
};

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.05, `${msg}: ${a} vs ${b}`);

test("forecast: observed line ends where the dotted line starts", async () => {
  for (const [step, from] of [["forecast", 2022], ["exact", 2025]]) {
    await withPage({ root, url: pages.url("forecast", `step=${step}`) }, async (page, ctx) => {
      const s = await read(page);
      assert.deepEqual(Object.keys(s.dotted).sort(), ["north", "south"], "one dotted line per series");
      for (const name of ["north", "south"]) {
        const lineEnd = s.lines[name].at(-1);
        const dottedStart = s.dotted[name][0];
        assert.deepEqual(lineEnd, dottedStart, `${name} (from ${from}): the solid line ends where the dotted one starts`);
        near(lineEnd[0], s.xOf(from), `${name}: the join is at the forecast start`);
        // The data points after the join: 2025..2050 is 6 points; from 2022 the boundary adds one.
        const after = from === 2022 ? 7 : 6;
        assert.equal(s.dotted[name].length, after, `${name}: no duplicated point at the join`);
        assert.equal(s.lines[name].length, 6, `${name}: the observed line has its points up to the join`);
      }
      assert.equal(s.dash.cap, "round", "the dotted line has round caps");
      assert.notEqual(s.dash.dasharray, "none", "the forecast line is dotted");
      assert.equal(s.forecastBands.length, 2, "the band has a forecast part per series");
      assert.ok(Number(s.bandOpacity[1]) < Number(s.bandOpacity[0]), "the forecast band is lighter");
      assert.deepEqual(ctx.errors, []);
    });
  }
});

test("forecast: region from the divider to the plot's end, label from ctx.t", async () => {
  await withPage({ root, url: pages.url("forecast", "step=forecast") }, async (page, ctx) => {
    const s = await read(page);
    assert.equal(s.forecastGroups, 1);
    near(s.divider.x1, s.xOf(2022), "the divider is at the forecast start");
    assert.equal(s.divider.x1, s.divider.x2, "the divider is vertical");
    near(s.region.x, s.divider.x1, "the region starts at the divider");
    near(s.region.x + s.region.w, s.baselineEnd, "the region ends at the plot's end");
    near(Math.abs(s.divider.y2 - s.divider.y1), s.region.h, "the divider spans the plot's height");
    assert.equal(s.label, "Forecast", "the default label is the engine string");
    // The region is faint: not the background, not the ink.
    assert.notEqual(s.region.fill, await tokenRgb(page, "--sd-color-background"));
    assert.notEqual(s.region.fill, await tokenRgb(page, "--sd-color-ink"));
    assert.deepEqual(ctx.errors, []);
  });
  await withPage({ root, url: pages.url("forecast", "step=label") }, async (page) => {
    assert.equal((await read(page)).label, "Projected", "forecast.label wins over the engine string");
  });
});

test("forecast from outside the data", async () => {
  await withPage({ root, url: pages.url("forecast-early", "step=all") }, async (page, ctx) => {
    const s = await read(page);
    assert.deepEqual(s.lines, { north: [], south: [] }, "no solid line: everything is forecast");
    for (const name of ["north", "south"]) assert.equal(s.dotted[name].length, 11, `${name}: the whole line is dotted`);
    near(s.region.x, 0, "the region covers the whole plot");
    near(s.region.w, s.baselineEnd, "the region covers the whole plot");
    assert.equal(s.dots.length, 22);
    assert.ok(s.dots.every((d) => d.hollow), "every point is forecast");
    assert.deepEqual(ctx.errors, []);
  });
  await withPage({ root, url: pages.url("forecast-late", "step=all") }, async (page, ctx) => {
    const s = await read(page);
    for (const name of ["north", "south"]) assert.equal(s.lines[name].length, 11, `${name}: the whole line is solid`);
    assert.deepEqual(s.dotted, {}, "no forecast part");
    assert.equal(s.region, null, "no region");
    assert.equal(s.forecastGroups, 0, "no forecast markup at all");
    assert.equal(s.dots.length, 22);
    assert.ok(s.dots.every((d) => !d.hollow), "every point is observed");
    assert.deepEqual(ctx.errors, []);
  });
});

test("points: one dot per data point, hollow after from", async () => {
  await withPage({ root, url: pages.url("forecast", "step=forecast") }, async (page, ctx) => {
    const s = await read(page);
    assert.equal(s.dots.length, 22, "11 points in 2 series");
    for (const name of ["north", "south"]) {
      const own = s.dots.filter((d) => d.series === name);
      assert.equal(own.length, 11);
      assert.deepEqual(own.map((d) => d.hollow), own.map((d) => d.cx > s.xOf(2022) + 0.05), "hollow exactly after from");
      assert.equal(own.filter((d) => d.hollow).length, 6, "2025 to 2050 are forecast");
    }
    const [filled, hollow] = [s.dots.find((d) => !d.hollow), s.dots.find((d) => d.hollow)];
    assert.ok(hollow.r > filled.r, "hollow forecast dots are slightly larger");
    assert.equal(s.pointsGroups, 1);
    assert.deepEqual(ctx.errors, []);
  });
  // A data x exactly at from is observed, and is not drawn twice.
  await withPage({ root, url: pages.url("forecast", "step=exact") }, async (page) => {
    const s = await read(page);
    assert.equal(s.dots.filter((d) => d.series === "north").length, 11);
    assert.equal(s.dots.filter((d) => d.series === "north" && d.hollow).length, 5, "2030 to 2050 are forecast, 2025 is observed");
  });
  // Without the props there is no markup for them.
  await withPage({ root, url: pages.url("forecast", "step=none") }, async (page) => {
    const s = await read(page);
    assert.deepEqual([s.pointsGroups, s.forecastGroups, s.dots.length, s.forecastBands.length], [0, 0, 0, 0]);
  });
  await withPage({ root, url: pages.url("forecast", "step=points") }, async (page) => {
    const s = await read(page);
    assert.deepEqual([s.pointsGroups, s.forecastGroups, s.dots.length], [1, 0, 22]);
    assert.ok(s.dots.every((d) => !d.hollow));
  });
});

test("jump equals played, backward and interrupted", async () => {
  await withPage({ root, url: pages.url("forecast", "step=none") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { ...run, steps: STEPS });
    await expectBackwardEqualsJump(ctx, page, { ...run, steps: STEPS });
    await expectInterruptEqualsJump(ctx, page, { ...run, from: "none", via: "points", to: "forecast" });
    await expectInterruptEqualsJump(ctx, page, { ...run, from: "points", via: "forecast", to: "exact" });
    // Both pairs of steps of the second slide: series enter and y morphs with markers, then a highlight.
    const second = { pages, slide: "points", id: "chart" };
    await expectJumpEqualsPlayed(ctx, page, { ...second, steps: ["one", "both", "alt", "focus"] });
    await expectBackwardEqualsJump(ctx, page, { ...second, steps: ["one", "both", "alt", "focus"] });
    await expectInterruptEqualsJump(ctx, page, { ...second, from: "one", via: "both", to: "alt" });
  });
});

test("a played step really moves: the markers fade in, the forecast fades in", async () => {
  await withPage({ root, url: pages.url("forecast", "step=none") }, async (page, ctx) => {
    const group = (cls) => (page) => page.evaluate((cls) => {
      const g = document.querySelector(`[data-el="chart"] g.${cls}`);
      return g ? getComputedStyle(g).opacity : null;
    }, cls);
    const points = await expectAnimatedStepMoves(ctx, page, { ...run, from: "none", to: "points", probe: group("sd-points") });
    const mid = Number(points.mid);
    assert.ok(mid > 0 && mid < 1, `the markers are mid-fade (opacity ${mid})`);
    assert.equal(Number(points.end), 1);
    const forecast = await expectAnimatedStepMoves(ctx, page, { ...run, from: "points", to: "forecast", probe: group("sd-forecast") });
    assert.ok(Number(forecast.mid) > 0 && Number(forecast.mid) < 1, "the forecast is mid-fade");
    assert.deepEqual(ctx.errors, []);
  });
});

test("check --played finds no problems in the fixture deck", async () => {
  assert.deepEqual(await checkPlayed(deck), []);
});
