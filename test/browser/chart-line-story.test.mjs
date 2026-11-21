// chart.line points, forecast segment and time sweep in Chrome. Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test --test-concurrency=1 test/browser/chart-line-story.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { checkPlayed } from "../../cli/check.js";
import { deckPages, expectJumpEqualsPlayed, expectBackwardEqualsJump, expectInterruptEqualsJump, expectAnimatedStepMoves, sampleFrames, tokenRgb } from "./helpers.mjs";

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
