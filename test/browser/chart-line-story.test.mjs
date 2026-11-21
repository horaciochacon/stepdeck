// chart.line points, forecast segment, time sweep and draw fan in Chrome. Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test --test-concurrency=1 test/browser/chart-line-story.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { checkPlayed } from "../../cli/check.js";
import { deckPages, goTo, canvasPixels, expectJumpEqualsPlayed, expectBackwardEqualsJump, expectInterruptEqualsJump, expectAnimatedStepMoves, sampleFrames, tokenRgb, paletteRgb } from "./helpers.mjs";

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

// The time sweep (`until`) and its ticker.
const SWEEP = ["full", "before", "first", "between", "on", "late", "after"];
const UNTIL = { before: 1990, first: 2000, between: 2007, on: 2020, late: 2042, after: 2060 };
const sweepRun = { pages, slide: "sweep", id: "chart" };
const STORY = ["start", "observed", "forecast"];
const storyRun = { pages, slide: "story", id: "chart" };

/** What a sweep looks like at one moment (a self-contained function of the chart's box: sampleFrames sends its source to the page). */
const sweepProbe = (el) => {
  const cursor = el.querySelector("line.sd-sweep-cursor");
  const ticker = el.querySelector("text.sd-ticker");
  const region = el.querySelector("rect.sd-forecast-region");
  const length = [...el.querySelectorAll("path.sd-line, path.sd-forecast-line")].reduce((sum, p) => sum + (p.getAttribute("d") ? p.getTotalLength() : 0), 0);
  return {
    cursor: cursor ? Number(cursor.getAttribute("x1")) : null,
    length,
    ticker: ticker ? ticker.textContent : null,
    ticks: [...el.querySelectorAll("g.sd-tick-x")].map((g) => g.getAttribute("transform")).join("|"),
    region: region ? { x: Number(region.getAttribute("x")), w: Number(region.getAttribute("width")) } : null,
  };
};

/** The chart's geometry at rest in plot pixels (bounding boxes in the plot's own space, so the page's scale does not matter). */
const boxes = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-el="chart"]');
    const box = (n) => {
      const b = n.getBBox();
      return { left: b.x, right: b.x + b.width, top: b.y, bottom: b.y + b.height };
    };
    const ticker = el.querySelector("text.sd-ticker");
    const labels = [...el.querySelectorAll("text.sd-series-label")].map((n) => ({ name: n.dataset.label, x: Number(n.getAttribute("x")), y: Number(n.getAttribute("y")), size: parseFloat(getComputedStyle(n).fontSize), ...box(n) }));
    const ends = Object.fromEntries([...el.querySelectorAll("path.sd-line")].filter((p) => p.getAttribute("d")).map((p) => {
      const pts = p.getAttribute("d").split(/[ML]/).filter(Boolean).map((s) => s.split(",").map(Number));
      return [p.dataset.series, pts.at(-1)];
    }));
    const plotRight = Number(el.querySelector(".sd-axis-line").getAttribute("x2"));
    return {
      ticker: ticker && { text: ticker.textContent, size: parseFloat(getComputedStyle(ticker).fontSize), numerals: getComputedStyle(ticker).fontVariantNumeric, ...box(ticker) },
      labels, ends, plotRight,
      cursors: el.querySelectorAll("line.sd-sweep-cursor").length,
      styled: el.querySelectorAll("svg [style]").length,
    };
  });

const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

test("sweep: the cursor advances and the lines lengthen while playing", async () => {
  await withPage({ root, url: pages.url("sweep", "step=on&motion=full") }, async (page, ctx) => {
    const before = await read(page);
    const r = await sampleFrames(page, "sweep", "late", "chart", sweepProbe);
    const swept = r.frames.filter((f) => f.cursor !== null);
    assert.ok(swept.length >= 3, `the cursor is seen on several frames (${swept.length})`);
    const [from, to] = [before.xOf(2020), before.xOf(2042)];
    for (let i = 1; i < swept.length; i++) assert.ok(swept[i].cursor >= swept[i - 1].cursor - 1e-6, "the cursor never goes back");
    assert.ok(swept.some((f) => f.cursor > from + 1 && f.cursor < to - 1), "the cursor was seen between the two ends");
    assert.ok(swept.every((f) => f.cursor >= from - 1e-6 && f.cursor <= to + 1e-6), "the cursor stays between the two ends");
    for (let i = 1; i < r.frames.length; i++) assert.ok(r.frames[i].length >= r.frames[i - 1].length - 1e-6, "the lines never shorten");
    const [first, last] = [r.frames[0].length, r.end.length];
    assert.ok(last > first + 1, "the lines are longer at the end");
    assert.ok(r.frames.some((f) => f.length > first + 1 && f.length < last - 1), "a line length between the two ends was seen");
    assert.equal(r.end.cursor, null, "no cursor at rest");
    assert.deepEqual(ctx.errors, []);
  });
});

test("sweep: the x axis never moves", async () => {
  await withPage({ root, url: pages.url("sweep", "step=full") }, async (page, ctx) => {
    const ticks = [];
    for (const step of SWEEP) {
      await ctx.open(pages.url("sweep", `step=${step}`));
      ticks.push(await page.evaluate(() => [...document.querySelectorAll('[data-el="chart"] g.sd-tick-x')].map((g) => g.getAttribute("transform")).join("|")));
    }
    assert.ok(ticks[0].includes("translate"), "the x ticks were read");
    assert.deepEqual(new Set(ticks).size, 1, `the x ticks are the same at every step: ${ticks.join(" / ")}`);
    await ctx.open(pages.url("sweep", "step=on&motion=full"));
    const r = await sampleFrames(page, "sweep", "late", "chart", sweepProbe);
    assert.deepEqual(new Set(r.frames.map((f) => f.ticks)).size, 1, "the x ticks stay put while the sweep plays");
    assert.equal(r.frames[0].ticks, ticks[0]);
    assert.deepEqual(ctx.errors, []);
  });
});

test("until outside the data", async () => {
  await withPage({ root, url: pages.url("sweep", "step=full") }, async (page, ctx) => {
    const full = await read(page);
    await ctx.open(pages.url("sweep", "step=before"));
    const early = await read(page);
    assert.deepEqual(early.lines, { north: [], south: [] }, "before the first x there is no line");
    assert.deepEqual(early.bands, ["", ""], "and no band");
    assert.equal(early.dots.length, 0, "and no dot");
    const none = await boxes(page);
    assert.equal(none.labels.length, 0, "and no series label");
    assert.equal(none.ticker.text, "1990", "the ticker rests on `until`, even outside the data");
    assert.equal(none.cursors, 0);
    await ctx.open(pages.url("sweep", "step=after"));
    const late = await read(page);
    assert.deepEqual(late.lines, full.lines, "after the last x the whole line is drawn");
    assert.deepEqual(late.bands, full.bands, "and the whole band");
    assert.equal(late.dots.length, 22);
    assert.equal((await boxes(page)).ticker.text, "2060");
    assert.deepEqual(ctx.errors, [], "no NaN or negative size reaches the markup");
  });
});

test("until on the first x draws no line: a part of one point is not a dot", async () => {
  await withPage({ root, url: pages.url("sweep", "step=first") }, async (page, ctx) => {
    const paths = await page.evaluate(() => [...document.querySelectorAll('[data-el="chart"] path.sd-line, [data-el="chart"] path.sd-band')].map((p) => ({ cls: p.getAttribute("class"), d: p.getAttribute("d") })));
    assert.equal(paths.length, 4, "a line and a band per series stay in the markup");
    assert.deepEqual(paths.filter((p) => p.d !== ""), [], "with an empty path each");
    const s = await read(page);
    assert.equal(s.dots.length, 2, "the first point of each series is shown");
    assert.equal((await boxes(page)).labels.length, 2, "and so is each label");
    assert.deepEqual(ctx.errors, []);
  });
});

test("until on a data x has no duplicate point", async () => {
  await withPage({ root, url: pages.url("sweep", "step=on") }, async (page, ctx) => {
    const s = await read(page);
    for (const name of ["north", "south"]) {
      assert.equal(s.lines[name].length, 5, `${name}: 2000 to 2020, five points`);
      near(s.lines[name].at(-1)[0], s.xOf(2020), `${name}: the line ends at 2020`);
      assert.equal(new Set(s.lines[name].map((p) => p.join())).size, 5, `${name}: no point twice`);
      assert.equal(s.dots.filter((d) => d.series === name).length, 5, `${name}: a dot per point, none for a cut`);
    }
    assert.deepEqual(ctx.errors, []);
  });
  // Between two data x, the cut adds one point at the cut and no dot.
  await withPage({ root, url: pages.url("sweep", "step=between") }, async (page) => {
    const s = await read(page);
    for (const name of ["north", "south"]) {
      assert.equal(s.lines[name].length, 3, `${name}: 2000, 2005 and the cut at 2007`);
      near(s.lines[name].at(-1)[0], s.xOf(2007), `${name}: the line ends at 2007`);
      assert.equal(s.dots.filter((d) => d.series === name).length, 2, `${name}: a dot per data point only`);
    }
  });
});

test("ticker counts and rests on until", async () => {
  await withPage({ root, url: pages.url("sweep", "step=on&motion=full") }, async (page, ctx) => {
    const r = await sampleFrames(page, "sweep", "late", "chart", sweepProbe);
    const texts = r.frames.map((f) => f.ticker).filter((t) => t !== null);
    const numbers = texts.map(Number);
    assert.ok(numbers.every(Number.isFinite), `every text is a number: ${texts.join(" ")}`);
    for (let i = 1; i < numbers.length; i++) assert.ok(numbers[i] >= numbers[i - 1], "the ticker never counts back");
    assert.ok(numbers.some((n) => n > 2020 && n < 2042), `a value between the two ends was seen: ${[...new Set(texts)].join(" ")}`);
    assert.equal(r.end.ticker, "2042", "it rests on `until`, formatted with format.x");
    assert.ok(numbers.every((n) => n >= 2020 && n <= 2042));
    assert.deepEqual(ctx.errors, []);
  });
  // At rest it is the size of a heading, tabular, in the plot's upper left.
  await withPage({ root, url: pages.url("sweep", "step=on") }, async (page) => {
    const b = await boxes(page);
    assert.equal(b.ticker.text, "2020");
    assert.ok(b.ticker.size >= 48, `a large size from a token (${b.ticker.size})`);
    assert.match(b.ticker.numerals, /tabular-nums/);
    assert.ok(b.ticker.left < b.plotRight * 0.15 && b.ticker.top < 60, `in the plot's upper left (${b.ticker.left}, ${b.ticker.top})`);
  });
  for (const step of Object.keys(UNTIL)) {
    await withPage({ root, url: pages.url("sweep", `step=${step}`) }, async (page) => {
      assert.equal((await boxes(page)).ticker.text, String(UNTIL[step]), `${step}: the text is until`);
    });
  }
  await withPage({ root, url: pages.url("sweep", "step=full") }, async (page) => {
    assert.equal((await boxes(page)).ticker, null, "no ticker without `until`");
  });
});

test("ticker counts to until even when it lies outside the x domain", async () => {
  await withPage({ root, url: pages.url("sweep", "step=late&motion=full") }, async (page, ctx) => {
    const r = await sampleFrames(page, "sweep", "after", "chart", sweepProbe);
    const texts = r.frames.map((f) => f.ticker).filter((t) => t !== null);
    const numbers = texts.map(Number);
    for (let i = 1; i < numbers.length; i++) assert.ok(numbers[i] >= numbers[i - 1], "the ticker never counts back");
    assert.ok(numbers.every((n) => n >= 2042 && n <= 2060), `between the two values: ${[...new Set(texts)].join(" ")}`);
    assert.ok(numbers.some((n) => n > 2050), "it counts past the end of the x axis, to `until`");
    const swept = r.frames.filter((f) => f.cursor !== null);
    assert.ok(2060 - Number(swept.at(-1).ticker) <= 3, `no jump at the end: the last frame of the sweep shows ${swept.at(-1).ticker}`);
    assert.equal(r.end.ticker, "2060");
    assert.deepEqual(ctx.errors, []);
  });
});

test("dots the sweep reveals arrive at full opacity", async () => {
  await withPage({ root, url: pages.url("sweep", "step=on&motion=full") }, async (page, ctx) => {
    const r = await sampleFrames(page, "sweep", "late", "chart", (el) => {
      const dots = [...el.querySelectorAll("circle.sd-dot")].filter((c) => getComputedStyle(c).display !== "none");
      return { count: dots.length, opacities: dots.map((c) => getComputedStyle(c).opacity) };
    });
    const first = r.frames[0].count;
    assert.ok(r.frames.some((f) => f.count > first && f.count < r.end.count), "dots were seen appearing one by one");
    for (const f of r.frames) assert.ok(f.opacities.every((o) => o === "1"), `every shown dot is opaque (${[...new Set(f.opacities)].join(", ")})`);
    assert.deepEqual(ctx.errors, []);
  });
});

test("series labels follow the visible end of each line", async () => {
  for (const step of ["first", "between", "on", "late"]) {
    await withPage({ root, url: pages.url("sweep", `step=${step}`) }, async (page, ctx) => {
      const b = await boxes(page);
      assert.equal(b.labels.length, 2);
      for (const l of b.labels) {
        const end = b.ends[l.name] ?? null;
        if (end) {
          assert.ok(l.x > end[0] && l.x - end[0] < l.size, `${step}/${l.name}: just right of the line's end (${l.x - end[0]})`);
          assert.ok(Math.abs(l.y - end[1]) < l.size * 2.5, `${step}/${l.name}: at the height of the end`);
        }
        assert.ok(Number.isFinite(l.y) && Number.isFinite(l.x));
      }
      assert.deepEqual(ctx.errors, []);
    });
  }
  // Past the last x the labels are where they always were: in the right margin.
  for (const step of ["full", "after"]) {
    await withPage({ root, url: pages.url("sweep", `step=${step}`) }, async (page) => {
      const b = await boxes(page);
      for (const l of b.labels) near(l.x, b.plotRight + l.size * 0.4, `${step}/${l.name}: in the right margin`);
    });
  }
});

test("the ticker never overlaps a series label", async () => {
  for (const [slide, steps] of [["sweep", SWEEP.slice(1)], ["story", STORY], ["clash", ["start", "next", "more"]]]) {
    for (const step of steps) {
      await withPage({ root, url: pages.url(slide, `step=${step}`) }, async (page, ctx) => {
        const b = await boxes(page);
        assert.ok(b.ticker, `${slide}/${step}: a ticker`);
        for (const l of b.labels) assert.ok(!overlap(b.ticker, l), `${slide}/${step}: label ${l.name} (${l.top.toFixed(0)}..${l.bottom.toFixed(0)}) clear of the ticker (${b.ticker.top.toFixed(0)}..${b.ticker.bottom.toFixed(0)})`);
        assert.deepEqual(ctx.errors, []);
      });
    }
  }
  // The clash slide's peak series starts at the top of the plot (80, the axis maximum), where the ticker is: its label moved down.
  await withPage({ root, url: pages.url("clash", "step=start") }, async (page) => {
    const b = await boxes(page);
    const peak = b.labels.find((l) => l.name === "peak");
    assert.ok(peak.top >= b.ticker.bottom, `the label (${peak.top.toFixed(0)}) is below the ticker (${b.ticker.bottom.toFixed(0)}), not at the line's end at the top`);
    const base = b.labels.find((l) => l.name === "base");
    assert.ok(base.y > peak.y, "the labels keep their order");
  });
});

test("sweep: jump equals played, backward and interrupted", async () => {
  await withPage({ root, url: pages.url("sweep", "step=full") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { ...sweepRun, steps: SWEEP });
    await expectBackwardEqualsJump(ctx, page, { ...sweepRun, steps: SWEEP });
    await expectInterruptEqualsJump(ctx, page, { ...sweepRun, from: "first", via: "between", to: "on" });
    await expectInterruptEqualsJump(ctx, page, { ...sweepRun, from: "between", via: "on", to: "late" });
    await expectInterruptEqualsJump(ctx, page, { ...sweepRun, from: "on", via: "late", to: "after" });
  });
});

test("abort mid-sweep equals jump", async () => {
  await withPage({ root, url: pages.url("sweep", "step=on") }, async (page, ctx) => {
    await expectInterruptEqualsJump(ctx, page, { ...sweepRun, from: "on", via: "late", to: "after" });
    await expectInterruptEqualsJump(ctx, page, { ...sweepRun, from: "between", via: "on", to: "late" });
    await expectInterruptEqualsJump(ctx, page, { ...storyRun, from: "start", via: "observed", to: "forecast" });
    // A sweep that was cut short leaves no cursor behind.
    assert.equal((await boxes(page)).cursors, 0);
  });
});

test("sweep under ?capture and reduced motion renders the end state at once", async () => {
  for (const [how, query] of [["reduced motion", "step=on"], ["capture", "step=on&capture"]]) {
    await withPage({ root }, async (page, ctx) => {
      if (how === "reduced motion") await page.emulateMedia({ reducedMotion: "reduce" });
      await ctx.open(pages.url("sweep", query));
      assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), false, `${how}: no motion`);
      const old = (await page.evaluate(`(${sweepProbe})(document.querySelector('[data-el="chart"]'))`)).length;
      const r = await sampleFrames(page, "sweep", "late", "chart", sweepProbe);
      const now = r.end.length;
      assert.ok(now > old + 1, "the step does change the lines");
      for (const f of r.frames) {
        assert.equal(f.cursor, null, `${how}: never a cursor`);
        assert.ok(Math.abs(f.length - old) < 0.5 || Math.abs(f.length - now) < 0.5, `${how}: never a partial line (${f.length})`);
      }
      assert.equal(r.end.ticker, "2042");
      assert.deepEqual(ctx.errors, []);
    });
  }
});

test("story: data then forecast", async () => {
  await withPage({ root, url: pages.url("story", "step=start") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { ...storyRun, steps: STORY });
    await expectBackwardEqualsJump(ctx, page, { ...storyRun, steps: STORY });
  });
  // The cut falls where the forecast starts, a year with no data: the whole line is observed and there is no stray dotted dot.
  await withPage({ root, url: pages.url("story", "step=observed") }, async (page, ctx) => {
    const s = await read(page);
    for (const name of ["north", "south"]) {
      assert.deepEqual(s.lines[name].at(-1)[0], s.xOf(2023), `${name}: the observed line ends exactly at the forecast start`);
      assert.equal(s.lines[name].length, 6, `${name}: 2000 to 2020 and the cut`);
    }
    assert.ok(s.dots.every((d) => !d.hollow), "no hollow dot yet");
    const paths = await page.evaluate(() => [...document.querySelectorAll('[data-el="chart"] path.sd-forecast-line, [data-el="chart"] path.sd-band-forecast')].map((p) => p.getAttribute("d")));
    assert.equal(paths.length, 4, "the forecast parts stay in the markup");
    assert.deepEqual(paths.filter((d) => d !== ""), [], "and draw nothing");
    near(s.region.w, 0, "the region has no width yet");
    assert.ok(s.divider && s.label === "Forecast", "the divider is already there");
    assert.deepEqual(ctx.errors, []);
  });
  await withPage({ root, url: pages.url("story", "step=forecast") }, async (page, ctx) => {
    const s = await read(page);
    near(s.region.x, s.xOf(2023), "the region starts at the divider");
    near(s.region.x + s.region.w, s.baselineEnd, "and ends at the plot's end");
    assert.equal(s.dotted.north.length, 7, "the dotted line has the cut point and 2025 to 2050");
    assert.deepEqual(ctx.errors, []);
  });
  // The sweep before the forecast start never shows the region; the one across it reveals it as it passes.
  await withPage({ root, url: pages.url("story", "step=start&motion=full") }, async (page, ctx) => {
    const x = (await read(page)).xOf;
    const early = await sampleFrames(page, "story", "observed", "chart", sweepProbe);
    assert.ok(early.frames.every((f) => f.region.w < 0.5), "the region stays empty while the sweep is before the forecast start");
    const r = await sampleFrames(page, "story", "forecast", "chart", sweepProbe);
    const swept = r.frames.filter((f) => f.cursor !== null);
    assert.ok(swept.length >= 3, "the sweep was seen");
    for (const f of swept) near(f.region.x + f.region.w, Math.min(f.cursor, r.end.region.x + r.end.region.w), "the region reaches the cursor, no further");
    for (let i = 1; i < swept.length; i++) assert.ok(swept[i].region.w >= swept[i - 1].region.w - 1e-6, "the region only grows");
    assert.ok(swept.some((f) => f.region.w > 1 && f.region.w < r.end.region.w - 1), "part of the region was seen");
    assert.ok(Math.abs(r.end.region.x - x(2023)) < 0.5);
    assert.deepEqual(ctx.errors, []);
  });
});

test("no cursor at rest after any arrival", async () => {
  await withPage({ root, url: pages.url("sweep", "step=full&motion=full") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    for (const step of SWEEP.slice(1)) {
      await page.evaluate((step) => window.STEPDECK.goTo("sweep", step), step);
      await page.evaluate(() => window.STEPDECK.settled());
      const b = await boxes(page);
      assert.equal(b.cursors, 0, `${step}: no cursor after playing forward`);
      assert.equal(b.styled, 0, `${step}: no inline style left`);
    }
    for (const step of ["between", "first", "full"]) {
      await page.evaluate((step) => window.STEPDECK.goTo("sweep", step), step);
      await page.evaluate(() => window.STEPDECK.settled());
      assert.equal((await boxes(page)).cursors, 0, `${step}: no cursor after a jump back`);
    }
    assert.deepEqual(ctx.errors, []);
  });
});

// The draw fan (`draws`): uncertainty draws painted on a canvas under the lines.
const FAN = ["none", "one", "few", "many", "fewer"];
const SHOWN = { none: 0, one: 1, few: 20, many: 200, fewer: 20 };
const FAN_SWEEP = ["start", "fan", "swept", "focus"];
const fanRun = { pages, slide: "fan", id: "chart" };
const fanSweepRun = { pages, slide: "fan-sweep", id: "chart" };

/** The fan's canvas in the page: its data-* attributes, its place in the element and how much of it is painted. */
const fanState = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-el="chart"]');
    const c = el.querySelector("canvas.sd-canvas-layer");
    if (!c) return null;
    const alpha = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const counts = new Map();
    let painted = 0;
    for (let i = 3; i < alpha.length; i += 4) {
      if (!alpha[i]) continue;
      painted++;
      counts.set(alpha[i], (counts.get(alpha[i]) ?? 0) + 1);
    }
    const mode = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
    return { attrs: { ...c.dataset }, painted, mode, first: el.firstElementChild === c, canvases: el.querySelectorAll("canvas").length };
  });

/** The y axis: tick labels and their places, one string. */
const yTicks = (page) => page.evaluate(() => [...document.querySelectorAll('[data-el="chart"] g.sd-tick-y')].map((g) => `${g.textContent}@${g.getAttribute("transform")}`).join("|"));

test("fan zero and one", async () => {
  await withPage({ root, url: pages.url("fan", "step=none") }, async (page, ctx) => {
    const zero = await fanState(page);
    assert.ok(zero, "at 0 draws the canvas is there");
    assert.equal(zero.first, true, "as the element's first child");
    assert.deepEqual(zero.attrs, { draws: "0", until: "", seed: "1", signature: zero.attrs.signature }, "with its state attributes, and no others");
    assert.match(zero.attrs.signature, /^[0-9a-f]{8}$/);
    assert.equal(zero.painted, 0, "and blank");
    await ctx.open(pages.url("fan", "step=one"));
    const one = await fanState(page);
    assert.equal(one.attrs.draws, "1");
    assert.notEqual(one.attrs.signature, zero.attrs.signature, "the signature changes with what is painted");
    assert.ok(one.painted > 500, `one draw per series is painted (${one.painted} pixels)`);
    // A single draw takes the opacity cap, 0.85: the pixels a line covers whole are that opaque.
    assert.ok(Math.abs(one.mode - Math.round(0.85 * 255)) <= 2, `the cores of the lines are 0.85 opaque (alpha ${one.mode})`);
    assert.equal(one.canvases, 1);
    assert.deepEqual(ctx.errors, []);
  });
});

test("fan: jump equals played at every step, markup and canvas pixels", async () => {
  await withPage({ root, url: pages.url("fan", "step=none") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { ...fanRun, steps: FAN });
    await expectJumpEqualsPlayed(ctx, page, { ...fanSweepRun, steps: FAN_SWEEP });
    for (const step of FAN) {
      await ctx.open(pages.url("fan", `step=${step}`));
      assert.equal((await fanState(page)).attrs.draws, String(SHOWN[step]), `${step}: data-draws is draws.shown`);
    }
  });
});

test("fan lower shown equals jump", async () => {
  await withPage({ root, url: pages.url("fan", "step=many") }, async (page, ctx) => {
    // 200 -> 20, played forward on its own: the fewer draws, pixel for pixel.
    await ctx.open(pages.url("fan", "step=fewer"));
    const jumped = { html: await page.evaluate(() => document.querySelector('[data-el="chart"]').outerHTML), pixels: await canvasPixels(page, "chart") };
    assert.equal(jumped.pixels.length, 1, "one canvas");
    await ctx.open(pages.url("fan", "step=many&motion=full"));
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    await goTo(page, "fan", "fewer");
    assert.equal(await page.evaluate(() => document.querySelector('[data-el="chart"]').outerHTML), jumped.html, "200 -> 20 played: the markup of a jump");
    assert.ok((await canvasPixels(page, "chart"))[0] === jumped.pixels[0], "200 -> 20 played: the pixels of a jump");
    // Every backward move and an interrupted rise.
    await expectBackwardEqualsJump(ctx, page, { ...fanRun, steps: FAN });
    await expectInterruptEqualsJump(ctx, page, { ...fanRun, from: "few", via: "many", to: "fewer" });
    await expectInterruptEqualsJump(ctx, page, { ...fanRun, from: "none", via: "one", to: "few" });
    await expectBackwardEqualsJump(ctx, page, { ...fanSweepRun, steps: FAN_SWEEP });
    await expectInterruptEqualsJump(ctx, page, { ...fanSweepRun, from: "start", via: "fan", to: "swept" });
  });
});

test("fan: a played change of shown fades the draws in", async () => {
  await withPage({ root, url: pages.url("fan", "step=few&motion=full") }, async (page, ctx) => {
    const painted = (el) => {
      const c = el.querySelector("canvas.sd-canvas-layer");
      const a = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < a.length; i += 4) if (a[i]) n++;
      return { painted: n };
    };
    const r = await sampleFrames(page, "fan", "many", "chart", painted);
    const [start, end] = [r.frames[0].painted, r.end.painted];
    assert.ok(end > start * 1.5, `more draws cover more of the plot (${start} -> ${end})`);
    assert.ok(r.frames.some((f) => f.painted > start + 1000 && f.painted < end - 1000), "the canvas was seen between the two states");
    assert.ok(r.settledMs >= 400, `the change plays over the morph's duration (${r.settledMs.toFixed(0)} ms)`);
    assert.deepEqual(ctx.errors, []);
  });
});

test("fan: raising shown keeps the earlier draws", async () => {
  // The draws painted at 20 are the first 20 of the order of 200, so they are still there at 200. Thinner and lighter (the
  // width tier and the opacity fall with n): a pixel at the anti-aliased rim of a line at 20 can round to 0 at 200, so the
  // check is on the pixels a line at 20 covers whole (alpha at least 0.9 of one draw's), which a kept draw covers at 200 too.
  for (const [from, to] of [["one", "few"], ["few", "many"]]) {
    await withPage({ root, url: pages.url("fan", `step=${from}`) }, async (page, ctx) => {
      const r = await page.evaluate(async ([from, to, n]) => {
        const read = () => {
          const c = document.querySelector('[data-el="chart"] canvas.sd-canvas-layer');
          return c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
        };
        const before = read();
        await window.STEPDECK.goTo("fan", to);
        await window.STEPDECK.settled();
        const after = read();
        const core = 0.9 * Math.round(Math.min(0.85, 1.9 / Math.sqrt(n)) * 255);
        let checked = 0;
        let lost = 0;
        for (let i = 3; i < before.length; i += 4) {
          if (before[i] < core) continue;
          checked++;
          if (!after[i]) lost++;
        }
        return { checked, lost, same: before.length === after.length };
      }, [from, to, SHOWN[from]]);
      assert.equal(r.same, true, "the canvas keeps its size");
      assert.ok(r.checked > 1000, `${from} -> ${to}: enough pixels checked (${r.checked})`);
      assert.equal(r.lost, 0, `${from} -> ${to}: every pixel a draw covered is still painted`);
      assert.deepEqual(ctx.errors, []);
    });
  }
});

test("fan dims with highlight", async () => {
  await withPage({ root, url: pages.url("fan-sweep", "step=focus") }, async (page, ctx) => {
    // The brightest pixel of the draws near each line's end (at 2050, past the forecast start, the two series are far apart).
    const probe = await page.evaluate(() => {
      const el = document.querySelector('[data-el="chart"]');
      const c = el.querySelector("canvas.sd-canvas-layer");
      const ratio = c.width / parseFloat(c.style.width);
      const g = c.getContext("2d");
      const at = (series) => {
        const d = el.querySelector(`path.sd-forecast-line[data-forecast="${series}"]`).getAttribute("d");
        const [px, py] = d.split(/[ML]/).filter(Boolean).at(-1).split(",").map(Number);
        const [x0, y0, w, h] = [Math.round((px - 14) * ratio), Math.round((py - 16) * ratio), Math.round(10 * ratio), Math.round(32 * ratio)];
        const a = g.getImageData(x0, y0, w, h).data;
        let best = 3;
        for (let i = 3; i < a.length; i += 4) if (a[i] > a[best]) best = i;
        return { rgb: [a[best - 3], a[best - 2], a[best - 1]], alpha: a[best] };
      };
      return { north: at("north"), south: at("south") };
    });
    const rgb = (s) => s.match(/\d+/g).slice(0, 3).map(Number);
    const far = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    const [dim, north, south] = [rgb(await tokenRgb(page, "--sd-color-dim")), rgb(paletteRgb("modern", 0)), rgb(paletteRgb("modern", 1))];
    assert.ok(probe.north.alpha > 120 && probe.south.alpha > 120, `opaque enough to read a colour (${probe.north.alpha}, ${probe.south.alpha})`);
    assert.ok(far(probe.north.rgb, dim) <= 12, `the dimmed series' draws are --sd-color-dim (${probe.north.rgb} vs ${dim})`);
    assert.ok(far(probe.north.rgb, north) > 40, `not the series colour (${probe.north.rgb} vs ${north})`);
    assert.ok(far(probe.south.rgb, south) <= 12, `the highlighted series' draws keep its colour (${probe.south.rgb} vs ${south})`);
    assert.deepEqual(ctx.errors, []);
  });
});

test("fan: the axis does not move when the fan appears", async () => {
  await withPage({ root, url: pages.url("fan", "step=none") }, async (page, ctx) => {
    const seen = [];
    for (const [slide, steps] of [["fan", FAN], ["fan-sweep", FAN_SWEEP]]) {
      for (const step of steps) {
        await ctx.open(pages.url(slide, `step=${step}`));
        seen.push(await yTicks(page));
      }
    }
    assert.ok(seen[0].includes("translate"), "the y ticks were read");
    assert.equal(new Set(seen).size, 1, `the y axis is the same at every step: ${[...new Set(seen)].join(" / ")}`);
    // The draws reach past the trend's own range: the axis made room for them before they were shown.
    const top = Number(seen[0].split("|").at(-1).split("@")[0]);
    assert.ok(top >= 77, `the axis covers the highest draw (top tick ${top})`);
    // And it stays put while the fan appears in a played step.
    await ctx.open(pages.url("fan-sweep", "step=start&motion=full"));
    const r = await sampleFrames(page, "fan-sweep", "fan", "chart", (el) => ({ ticks: [...el.querySelectorAll("g.sd-tick-y")].map((g) => `${g.textContent}@${g.getAttribute("transform")}`).join("|") }));
    assert.deepEqual([...new Set(r.frames.map((f) => f.ticks))], [seen[0]], "no frame moves the axis");
    assert.deepEqual(ctx.errors, []);
  });
});

test("fan: summary lines paint above the fan", async () => {
  await withPage({ root, url: pages.url("fan", "step=many") }, async (page, ctx) => {
    const probe = await page.evaluate(() => {
      const el = document.querySelector('[data-el="chart"]');
      const canvas = el.querySelector("canvas.sd-canvas-layer");
      const svg = el.querySelector("svg.sd-chart-line");
      const out = { canvasFirst: el.firstElementChild === canvas && canvas.nextElementSibling === svg, svgPosition: getComputedStyle(svg).position, hits: {}, halos: {} };
      // A canvas ignores the pointer, so let it take it: the hit test then shows what is on top.
      canvas.style.pointerEvents = "auto";
      for (const line of el.querySelectorAll("path.sd-line")) {
        const p = line.getPointAtLength(line.getTotalLength() * 0.37);
        const m = line.getScreenCTM();
        const hit = document.elementFromPoint(m.a * p.x + m.c * p.y + m.e, m.b * p.x + m.d * p.y + m.f);
        out.hits[line.dataset.series] = hit === line;
        const halo = line.previousElementSibling;
        out.halos[line.dataset.series] = halo?.classList.contains("sd-halo-under") && halo.getAttribute("d") === line.getAttribute("d");
      }
      canvas.style.pointerEvents = "";
      return out;
    });
    assert.equal(probe.canvasFirst, true, "the canvas comes before the svg");
    assert.equal(probe.svgPosition, "relative", "and the svg is positioned, so it paints above the canvas");
    assert.deepEqual(probe.hits, { north: true, south: true }, "a point of each summary line hits its path.sd-line");
    assert.deepEqual(probe.halos, { north: true, south: true }, "each summary line sits on a halo of its own shape");
    assert.deepEqual(ctx.errors, []);
  });
  // Without draws there is no canvas and no halo: the markup is the one the chart always had.
  await withPage({ root, url: pages.url("fan-sweep", "step=start") }, async (page) => {
    const none = await page.evaluate(() => [...document.querySelectorAll('[data-el="chart"] canvas, [data-el="chart"] .sd-halo-under')].length);
    assert.equal(none, 0);
  });
});

test("fan errors show on the slide", async () => {
  const broken = deckPages("test/fixtures/decks/line-story-broken/");
  await withPage({ root, url: broken.url("fan-errors", "") }, async (page, ctx) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.deepEqual(errors, ["fan-errors/chart: `draws.shown` is 5 but data/draws.csv has only 3 draws"]);
    const shown = await page.evaluate(() => document.querySelector('[data-el="chart"] .sd-error')?.textContent);
    assert.match(shown ?? "", /`draws\.shown` is 5 but data\/draws\.csv has only 3 draws/);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-el="src"]')).visibility), "visible", "the sibling carries on");
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("fan with a sweep", async () => {
  /** The canvas right of the cut: how many pixels are painted there (the cut in plot pixels, plus `slack`). */
  const rightOf = (el, cut, slack) => {
    const c = el.querySelector("canvas.sd-canvas-layer");
    const ratio = c.width / parseFloat(c.style.width);
    const x0 = Math.ceil((cut + slack) * ratio);
    if (x0 >= c.width) return 0;
    const a = c.getContext("2d").getImageData(x0, 0, c.width - x0, c.height).data;
    let n = 0;
    for (let i = 3; i < a.length; i += 4) if (a[i]) n++;
    return n;
  };
  await withPage({ root, url: pages.url("fan-sweep", "step=fan") }, async (page, ctx) => {
    const s = await read(page);
    const at = await page.evaluate(`(${rightOf})(document.querySelector('[data-el="chart"]'), ${s.xOf(2020)}, 3)`);
    assert.equal(at, 0, "no draw is painted right of until");
    const before = await page.evaluate(`(${rightOf})(document.querySelector('[data-el="chart"]'), ${s.xOf(2020) - 40}, 0)`);
    assert.ok(before > 100, `the draws reach the cut (${before} pixels in the last 40 px)`);
    assert.equal((await fanState(page)).attrs.until, "2020");
    // Over a fan the forecast region tints the draws instead of covering them.
    const region = await page.evaluate(() => getComputedStyle(document.querySelector('[data-el="chart"] rect.sd-forecast-region')).fill);
    const alpha = Number(/[\d.]+(?=\)$)/.exec(region.replace(/\s/g, ""))?.[0] ?? 1);
    assert.ok(/\/|rgba/.test(region) && alpha < 0.5, `a translucent fill (${region})`);
    // Every frame of the played sweep cuts the draws where the cursor is.
    await ctx.open(pages.url("fan-sweep", "step=fan&motion=full"));
    const r = await sampleFrames(page, "fan-sweep", "swept", "chart", `(el) => {
      const cursor = el.querySelector("line.sd-sweep-cursor");
      if (!cursor) return { cursor: null };
      const cut = Number(cursor.getAttribute("x1"));
      return { cursor: cut, beyond: (${rightOf})(el, cut, 3) };
    }`);
    const swept = r.frames.filter((f) => f.cursor !== null);
    assert.ok(swept.length >= 3, `the sweep was seen (${swept.length} frames)`);
    for (const f of swept) assert.equal(f.beyond, 0, `nothing painted right of the cursor at ${f.cursor.toFixed(1)}`);
    assert.equal((await fanState(page)).attrs.until, "2050");
    assert.deepEqual(ctx.errors, []);
  });
});
