// The built-in `map` in Chrome: boundaries, choropleth areas, raster layers, points, labels, highlight, the legend and flights, on the map fixture deck
// (test/fixtures/decks/map) and its broken twin. Played equals jumped is checked on markup and canvas pixels; pixel
// positions come from the same projection the component fits, computed here in Node. Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/map.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { d3 } from "../../engine/core/d3.js";
import { applyView, boundaries, landCells, projection, view } from "../../engine/core/map.js";
import { pngPixels } from "../../cli/png.js";
import { deckPages, goTo, canvasPixels, tokenRgb, paletteRgb, sampleFrames, colorMove, expectJumpEqualsPlayed, expectBackwardEqualsJump, expectInterruptEqualsJump } from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const DECK = "test/fixtures/decks/map/";
const pages = deckPages(DECK);
const broken = deckPages("test/fixtures/decks/map-broken/");
const STEPS = { areas: ["base", "rates", "focus", "named"], legends: ["steps", "classes", "ramp"], projection: ["equal", "conic"] };
const RASTER_STEPS = ["base", "density", "whole", "cover", "wells", "alert", "half", "log", "gone"];
/** The main map of the fixture slides is 1400 x 700 px; the small one 140 x 76. */
const SIZE = [1400, 700];
const SMALL = [140, 76];
const AREAS = "main:areas:rate";
/** A legend swatch and a ramp carry their colour inline: content, not motion residue. */
const LEGEND_COLOURS = ".sd-legend-swatch, .sd-legend-ramp";

/**
 * Where each region's dot and label sit in an element of `size`: the centroid of its polygon (every fixture region is
 * one convex polygon), through the same projection the map fits, rounded to a pixel.
 */
function anchors(file, size) {
  const { features, byId } = boundaries(JSON.parse(readFileSync(`${root}${DECK}${file}`, "utf8")), { id: "code" });
  const base = projection("equal-earth", features, size);
  const path = d3.geoPath(base);
  const at = new Map([...byId].map(([id, feature]) => [id, path.centroid(feature).map(Math.round)]));
  /** The pixel under the middle of a region's first edge: on its outline. */
  at.edge = (id) => {
    const [a, b] = byId.get(id).geometry.coordinates[0].map((p) => base(p));
    return [Math.floor((a[0] + b[0]) / 2), Math.floor((a[1] + b[1]) / 2)];
  };
  return at;
}
const AT = anchors("data/regions.geojson", SIZE);

/** The rgba of the pixels of a canvas layer of element `el` in a box centred on [x, y], `r` px each way: [[r, g, b, a], ...]. */
const pixelsAround = (page, layer, [x, y], r, el = "map") =>
  page.evaluate(([el, layer, x, y, r]) => {
    const canvas = document.querySelector(`[data-el="${el}"] canvas[data-layer="${layer}"]`);
    const data = canvas.getContext("2d").getImageData(x - r, y - r, 2 * r + 1, 2 * r + 1).data;
    return Array.from({ length: data.length / 4 }, (_, i) => [...data.subarray(i * 4, i * 4 + 4)]);
  }, [el, layer, x, y, r]);
const pixelAt = async (page, layer, at, el) => (await pixelsAround(page, layer, at, 0, el))[0];
const rgb = ([r, g, b]) => `rgb(${r}, ${g}, ${b})`;

/** The legend as the page shows it: each row's title, items (label, inline colour, whether hatched), ramp and labels. */
const legendOf = (page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-el="map"] .sd-map-legend .sd-legend-row')].map((row) => ({
    title: row.querySelector(".sd-legend-title")?.textContent ?? null,
    items: [...row.querySelectorAll(".sd-legend-item")].map((item) => {
      const swatch = item.querySelector(".sd-legend-swatch");
      return { label: item.querySelector(".sd-legend-label").textContent, color: swatch.style.backgroundColor, nodata: swatch.classList.contains("sd-legend-nodata") };
    }),
    ramp: row.querySelector(".sd-legend-ramp")?.style.backgroundImage ?? null,
    ends: [...row.children].filter((n) => n.classList.contains("sd-legend-label")).map((n) => n.textContent),
  })));

const errorsOf = (page) => page.evaluate(() => window.STEPDECK.errors);

/** A `sampleFrames` probe of the colour of one pixel of a canvas layer: its source is sent to the page, so the pixel is written into it. */
const colourProbe = (layer, [x, y]) =>
  new Function("el", `const d = el.querySelector('canvas[data-layer="${layer}"]').getContext("2d").getImageData(${x}, ${y}, 1, 1).data; return { color: \`rgb(\${d[0]}, \${d[1]}, \${d[2]})\` };`);
/** A `sampleFrames` probe of the alpha of one pixel of a canvas layer. */
const alphaProbe = (layer, [x, y]) =>
  new Function("el", `return { alpha: el.querySelector('canvas[data-layer="${layer}"]').getContext("2d").getImageData(${x}, ${y}, 1, 1).data[3] };`);
/** Whether `c` lies strictly between colours `a` and `b`: different from both, and every channel within theirs. */
const strictlyBetween = (c, a, b) => {
  const [x, p, q] = [c, a, b].map((s) => s.match(/\d+/g).map(Number));
  return c !== a && c !== b && x.every((v, i) => v >= Math.min(p[i], q[i]) && v <= Math.max(p[i], q[i]));
};

test("areas: played equals jumped, pixels too", async () => {
  await withPage({ root, url: pages.url("areas", "step=base") }, async (page, ctx) => {
    for (const [slide, steps] of Object.entries(STEPS)) await expectJumpEqualsPlayed(ctx, page, { pages, slide, steps, id: "map" });
  });
});

test("areas: backward and interrupted equal the jump", async () => {
  await withPage({ root, url: pages.url("areas", "step=base") }, async (page, ctx) => {
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "areas", steps: STEPS.areas, id: "map" });
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "legends", steps: STEPS.legends, id: "map" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "areas", from: "base", via: "rates", to: "focus", id: "map", keep: LEGEND_COLOURS });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "areas", from: "rates", via: "focus", to: "named", id: "map", keep: LEGEND_COLOURS });
    assert.deepEqual(await errorsOf(page), []);
  });
});

test("areas: the no-data region is hatched", async () => {
  await withPage({ root, url: pages.url("areas", "step=rates") }, async (page, ctx) => {
    const [dim, surface] = [await tokenRgb(page, "--sd-color-dim"), await tokenRgb(page, "--sd-color-surface")];
    const seen = new Set((await pixelsAround(page, AREAS, AT.get("E1"), 3)).map(rgb));
    assert.ok(seen.has(dim), `Eastport has a stripe in the dim colour (${[...seen].join(" | ")})`);
    assert.ok(seen.has(surface), `and the surface between stripes (${[...seen].join(" | ")})`);
    const filled = new Set((await pixelsAround(page, AREAS, AT.get("N1"), 3)).map(rgb));
    assert.equal(filled.size, 1, "a region with a value is one flat colour");
    assert.deepEqual(ctx.errors, []);
  });
});

test("areas: tiny islands are dots", async () => {
  await withPage({ root, url: pages.url("small", "") }, async (page, ctx) => {
    const small = anchors("data/regions.geojson", SMALL);
    const background = await tokenRgb(page, "--sd-color-background");
    for (const id of ["I1", "I2"]) {
      const at = small.get(id);
      const box = await pixelsAround(page, AREAS, at, 7);
      const colour = rgb(await pixelAt(page, AREAS, at));
      // The island is a triangle of about 3 x 5 px (some 8 px); its dot is a disc of radius 5, ringed in the background colour.
      const fill = box.filter((p) => p[3] === 255 && rgb(p) === colour).length;
      assert.ok(fill >= 40, `${id}: the dot covers ${fill} px of its colour ${colour}`);
      assert.ok(box.some((p) => p[3] === 255 && rgb(p) === background), `${id}: the dot has an outline in the background colour`);
    }
    // A mainland region stays an area: its colour does not spill past its own box into a dot.
    assert.notEqual(rgb(await pixelAt(page, AREAS, small.get("N3"))), background);
    assert.deepEqual(ctx.errors, []);
  });
});

test("areas: highlight dims the rest to --sd-color-dim", async () => {
  await withPage({ root, url: pages.url("areas", "step=rates") }, async (page, ctx) => {
    const before = new Map();
    for (const id of ["N1", "W1", "S2"]) before.set(id, rgb(await pixelAt(page, AREAS, AT.get(id))));
    await goTo(page, "areas", "focus");
    const dim = await tokenRgb(page, "--sd-color-dim");
    assert.equal(rgb(await pixelAt(page, AREAS, AT.get("S2"))), dim, "Marshby, not highlighted, turns the dim colour");
    for (const id of ["N1", "W1"]) assert.equal(rgb(await pixelAt(page, AREAS, AT.get(id))), before.get(id), `${id} keeps its class colour`);
    const surface = await tokenRgb(page, "--sd-color-surface");
    assert.ok((await pixelsAround(page, AREAS, AT.get("E1"), 3)).map(rgb).includes(surface), "the no-data region stays hatched");
    // A highlighted region gets an ink outline on the borders layer, over the thin rule-coloured border it has otherwise.
    const ink = await tokenRgb(page, "--sd-color-ink");
    const edge = AT.edge("N1");
    assert.equal(rgb(await pixelAt(page, "main:borders", edge)), ink, "North is outlined in ink");
    await goTo(page, "areas", "rates");
    assert.notEqual(rgb(await pixelAt(page, "main:borders", edge)), ink, "and only while it is highlighted");
    assert.deepEqual(ctx.errors, []);
  });
});

test("areas: legend rows read < 5, 5–10, 10–20, ≥ 20 and No data", async () => {
  await withPage({ root, url: pages.url("areas", "step=base") }, async (page, ctx) => {
    assert.deepEqual(await legendOf(page), [], "no layer shown, no legend");
    await goTo(page, "areas", "rates");
    const [row, ...more] = await legendOf(page);
    assert.equal(more.length, 0, "one row");
    assert.equal(row.title, "Rate per 1,000");
    assert.deepEqual(row.items.map((i) => i.label), ["< 5", "5–10", "10–20", "≥ 20", "no data"]);
    const swatches = row.items.slice(0, 4);
    assert.ok(swatches.every((i) => /^rgb\(/.test(i.color) && !i.nodata), JSON.stringify(swatches));
    assert.equal(new Set(swatches.map((i) => i.color)).size, 4, "four classes, four colours");
    assert.deepEqual(row.items[4], { label: "no data", color: "", nodata: true }, "the no-data swatch is the hatch, not a colour");
    // The swatches are the colours on the map: North (9.3) is in 5–10, Southmouth (14.0) in 10–20.
    assert.equal(rgb(await pixelAt(page, AREAS, AT.get("N1"))), swatches[1].color);
    assert.equal(rgb(await pixelAt(page, AREAS, AT.get("S1"))), swatches[2].color);
    assert.equal(await page.evaluate(() => document.querySelector('[data-el="map"] .sd-map-legend').getAttribute("data-at")), "bottom-left");

    // A continuous ramp, from a layer with no classes: a gradient between its two end labels, and no hatch row (every
    // region has a change).
    await ctx.open(pages.url("legends", "step=ramp"));
    const [ramp] = await legendOf(page);
    assert.equal(ramp.title, "Change");
    assert.deepEqual(ramp.items, []);
    assert.match(ramp.ramp, /^linear-gradient\(to right, (rgb\(\d+, \d+, \d+\)(, )?){9}\)$/);
    assert.deepEqual(ramp.ends, ["−8", "8"], "the domain is the data's extent, symmetric about the midpoint");
    assert.equal(await page.evaluate(() => document.querySelector('[data-el="map"] .sd-map-legend').getAttribute("data-at")), "top-right");
    assert.deepEqual(ctx.errors, []);
  });
});

test("areas: legend in Spanish uses decimal commas", async () => {
  await withPage({ root, url: pages.url("legends", "step=steps&lang=es") }, async (page, ctx) => {
    const [row] = await legendOf(page);
    assert.deepEqual(row.items.map((i) => i.label), ["< 2,5", "2,5–5", "≥ 5", "sin datos"]);
    assert.deepEqual(ctx.errors, []);
  });
});

test("areas: cw and ccw boundaries paint the same pixels", async () => {
  await withPage({ root, url: pages.url("square", "") }, async (page, ctx) => {
    const [cw, ccw] = [await canvasPixels(page, "cw"), await canvasPixels(page, "ccw")];
    assert.equal(cw.length, 2, "a base and a borders layer");
    assert.ok(cw.every((px, i) => px === ccw[i]), "the same pixels, layer by layer");
    // and they are a square on the sea, not a sea of land: the middle is land, a corner is clear
    assert.equal(rgb(await pixelAt(page, "main:base", [340, 350], "ccw")), await tokenRgb(page, "--sd-color-surface"));
    assert.equal((await pixelAt(page, "main:base", [5, 5], "ccw"))[3], 0);
    assert.deepEqual(ctx.errors, []);
  });
});

test("areas: values key matching no region errors", async () => {
  await withPage({ root, url: broken.url("unknown-key", "") }, async (page, ctx) => {
    assert.deepEqual(await errorsOf(page), ["unknown-key/map: data/rates.csv: key 'N1' matches no region"]);
    const shown = await page.evaluate(() => document.querySelector('[data-el="map"] .sd-error')?.textContent);
    assert.match(shown ?? "", /key 'N1' matches no region/);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-el="src"]')).visibility), "visible");
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("areas: a misspelled value column errors", async () => {
  await withPage({ root, url: broken.url("column", "") }, async (page, ctx) => {
    assert.deepEqual(await errorsOf(page), ["column/map: column 'rat' not found in data/rates.csv (columns: code, rate)"]);
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("areas: unknown region in highlight errors", async () => {
  await withPage({ root, url: broken.url("region", "") }, async (page, ctx) => {
    assert.deepEqual(await errorsOf(page), ["region/map: region 'Nowhere' not found (regions: E1, I1, I2, N1, N2, …)"]);
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("areas: an unknown label region, an unknown layer and a repeated key error", async () => {
  const cases = {
    labels: "region 'Nowhere' not found (regions: E1, I1, I2, N1, N2, …)",
    layer: "layer 'pop' not found (layers: rate)",
    twice: "data/twice.csv: key 'N1' appears twice",
  };
  await withPage({ root, url: broken.url("labels", "") }, async (page, ctx) => {
    for (const [slide, message] of Object.entries(cases)) {
      await ctx.open(broken.url(slide, ""));
      assert.deepEqual(await errorsOf(page), [`${slide}/map: ${message}`]);
    }
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("areas: a fade brings the layer in", async () => {
  await withPage({ root, url: pages.url("areas", "step=base&motion=full") }, async (page, ctx) => {
    const [x, y] = AT.get("S1");
    // The probe runs in the page from its source, so the pixel is written into it.
    const probe = new Function("el", `const c = el.querySelector('canvas[data-layer="${AREAS}"]'); return { alpha: c.getContext("2d").getImageData(${x}, ${y}, 1, 1).data[3] };`);
    const { frames, end } = await sampleFrames(page, "areas", "rates", "map", probe);
    assert.equal(frames[0].alpha, 0, "the layer starts clear");
    assert.equal(end.alpha, 255, "and ends opaque");
    const between = frames.filter((f) => f.alpha > 0 && f.alpha < 255);
    assert.ok(between.length >= 2, `the alpha passes through ${between.length} frames between the ends`);
    assert.ok(frames.every((f, i) => i === 0 || f.alpha >= frames[i - 1].alpha), "and only rises");
    assert.deepEqual(ctx.errors, []);
  });
});

test("map: canvases carry their state", async () => {
  await withPage({ root, url: pages.url("areas", "step=focus") }, async (page, ctx) => {
    const stateOf = () => page.evaluate(() => [...document.querySelectorAll('[data-el="map"] canvas')].map((c) => ({ ...c.dataset })));
    const focus = await stateOf();
    assert.deepEqual(focus.map((c) => c.layer), ["main:base", AREAS, "main:borders"], "base land, the layer, then the borders on top");
    for (const c of focus) {
      assert.deepEqual(Object.keys(c).sort(), ["frame", "highlight", "layer", "shown", "sig", "view"], c.layer);
      assert.equal(c.view, "1.000,0.000,0.000", `${c.layer}: the home view`);
      assert.equal(c.shown, "rate");
      assert.equal(c.highlight, "N1,W1");
      assert.equal(c.frame, "");
      assert.match(c.sig, /^[0-9a-f]{8}$/);
    }
    await goTo(page, "areas", "base");
    const base = await stateOf();
    assert.deepEqual(base.map((c) => [c.shown, c.highlight]), [["", ""], ["", ""], ["", ""]]);
    assert.notEqual(base[1].sig, focus[1].sig, "a hidden layer paints nothing, and says so");
    assert.equal(base[0].sig, focus[0].sig, "the land is the same whatever is shown over it");
    assert.deepEqual(ctx.errors, []);
  });
});

test("map: labels show region names at their centroids", async () => {
  await withPage({ root, url: pages.url("areas", "step=named") }, async (page, ctx) => {
    const labels = await page.evaluate(() => [...document.querySelectorAll('[data-el="map"] text.sd-map-label')].map((t) => ({ text: t.textContent, x: Number(t.getAttribute("x")), y: Number(t.getAttribute("y")) })));
    assert.deepEqual(labels.map((l) => l.text), ["North", "Westmere", "Marshby"]);
    for (const [i, id] of ["N1", "W1", "S2"].entries()) {
      const [x, y] = AT.get(id);
      assert.ok(Math.abs(labels[i].x - x) <= 1 && Math.abs(labels[i].y - y) <= 1, `${id} at ${labels[i].x},${labels[i].y}, not ${x},${y}`);
    }
    assert.deepEqual(ctx.errors, []);
  });
});

test("areas: a change of classes crossfades the colours", async () => {
  await withPage({ root, url: pages.url("legends", "step=steps&motion=full") }, async (page, ctx) => {
    // North (9.3) is in the top class of [2.5, 5] and in 5–10 of [5, 10, 20]: two colours of the sequential palette.
    const { frames, end } = await sampleFrames(page, "legends", "classes", "map", colourProbe("main:areas:low", AT.get("N1")));
    const from = frames[0].color;
    assert.notEqual(from, end.color, "the class colour changes");
    const between = frames.filter((f) => strictlyBetween(f.color, from, end.color));
    assert.ok(between.length >= 1, `a frame shows a colour between the two (${frames.map((f) => f.color).join(" | ")})`);
    assert.deepEqual(ctx.errors, []);
  });
});

test("areas: highlight colours tween over --sd-duration-fast", async () => {
  await withPage({ root, url: pages.url("areas", "step=rates&motion=full") }, async (page, ctx) => {
    const fast = parseFloat(await page.evaluate(() => getComputedStyle(document.querySelector(".sd-canvas")).getPropertyValue("--sd-duration-fast")));
    const r = await sampleFrames(page, "areas", "focus", "map", colourProbe(AREAS, AT.get("S2")));
    const move = colorMove(r.frames);
    assert.equal(move.to, await tokenRgb(page, "--sd-color-dim"), "Marshby ends in the dim colour");
    assert.ok(r.frames.some((f) => strictlyBetween(f.color, move.from, move.to)), "and passes colours between");
    assert.ok(move.arrived >= 0.8 * fast, `${fast} ms, not a snap (arrived at ${move.arrived.toFixed(0)} ms)`);
    assert.ok(move.arrived - move.start <= 3 * fast, `done within a generous bound of ${fast} ms (${(move.arrived - move.start).toFixed(0)} ms)`);
    assert.ok(move.arrived <= r.settledMs - 0.1 * fast, `on the fast clock, before the step's own duration ends (${move.arrived.toFixed(0)} of ${r.settledMs.toFixed(0)} ms)`);
    assert.deepEqual(ctx.errors, []);
  });
});

test("map: a projection change changes every signature", async () => {
  await withPage({ root, url: pages.url("projection", "step=equal") }, async (page, ctx) => {
    const sigs = () => page.evaluate(() => [...document.querySelectorAll('[data-el="map"] canvas')].map((c) => [c.dataset.layer, c.dataset.sig, c.dataset.view]));
    const equal = await sigs();
    const pixels = await canvasPixels(page, "map");
    await goTo(page, "projection", "conic");
    const conic = await sigs();
    assert.deepEqual(conic.map(([layer]) => layer), ["main:base", "main:areas:rate", "main:borders"]);
    conic.forEach(([layer, sig, view], i) => {
      assert.equal(view, equal[i][2], `${layer}: the same home view`);
      assert.notEqual(sig, equal[i][1], `${layer}: the geometry changed, so the signature does`);
    });
    assert.ok((await canvasPixels(page, "map")).some((px, i) => px !== pixels[i]), "as the pixels do");
    assert.deepEqual(ctx.errors, []);
  });
});

// --- raster layers ----------------------------------------------------------------------------------------------

const { features: LAND, byId: REGIONS } = boundaries(JSON.parse(readFileSync(`${root}${DECK}data/regions.geojson`, "utf8")), { id: "code" });
const BASE = projection("equal-earth", LAND, SIZE);
const RASTER = (name) => `main:raster:${name}`;

/** A raster of the fixture, read from its files in Node: its bounds, size, and what each cell holds ({ level, data }). */
function rasterFile(name) {
  const sidecar = JSON.parse(readFileSync(`${root}${DECK}data/${name}.json`, "utf8"));
  const { width: cols, height: rows, data: grey } = pngPixels(readFileSync(`${root}${DECK}data/${sidecar.src}`));
  const [west, south, east, north] = sidecar.bounds;
  return {
    sidecar, bounds: sidecar.bounds, size: [cols, rows],
    cell: (col, row) => ({ level: grey[(row * cols + col) * 2], data: grey[(row * cols + col) * 2 + 1] === 255 }),
    /** The cell that holds [lon, lat]. */
    cellAt: ([lon, lat]) => [Math.floor(((lon - west) / (east - west)) * cols), Math.floor(((north - lat) / (north - south)) * rows)],
    /** The pixel of the element that the middle of a cell falls on. */
    pixelOf: (col, row) => BASE([west + ((col + 0.5) * (east - west)) / cols, north - ((row + 0.5) * (north - south)) / rows]).map(Math.floor),
  };
}
/** The pixel of the middle of the cell of `file` that holds region `id`'s centre, and the cell. */
function regionCell(file, id) {
  const [col, row] = file.cellAt(d3.geoCentroid(REGIONS.get(id)));
  return { col, row, at: file.pixelOf(col, row), ...file.cell(col, row) };
}
/** Whether pixels show the hatch: a stripe close to `dim` and the surface between (the stripes are antialiased, so a pixel is rarely exactly the stripe colour). */
const hatched = (pixels, dim, surface) => {
  const near = (c, target, by) => [c, target].map((s) => s.match(/\d+/g).map(Number)).reduce((x, y) => x.every((v, i) => Math.abs(v - y[i]) <= by));
  const colours = pixels.map(rgb);
  return colours.some((c) => near(c, dim, 10)) && colours.some((c) => near(c, surface, 1));
};
const MAINLAND = ["N1", "N2", "N3", "E1", "W1", "S1", "S2"];

test("rasters: played equals jumped, pixels too", async () => {
  await withPage({ root, url: pages.url("rasters", "step=base") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "rasters", steps: RASTER_STEPS, id: "map" });
    assert.deepEqual(await errorsOf(page), []);
  });
});

test("rasters: backward and interrupted equal the jump", async () => {
  await withPage({ root, url: pages.url("rasters", "step=base") }, async (page, ctx) => {
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "rasters", steps: RASTER_STEPS, id: "map" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "rasters", from: "base", via: "density", to: "cover", id: "map", keep: LEGEND_COLOURS });
    // in the middle of a crossfade between two colours of one layer, then on
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "rasters", from: "wells", via: "alert", to: "half", id: "map", keep: LEGEND_COLOURS });
    assert.deepEqual(await errorsOf(page), []);
  });
});

test("rasters: a cell lines up with its region", async () => {
  await withPage({ root, url: pages.url("rasters", "step=cover") }, async (page, ctx) => {
    const cover = rasterFile("cover");
    const classes = new Set();
    for (const id of MAINLAND) {
      const { at, level, data } = regionCell(cover, id);
      assert.ok(data, `${id}: the cell at its centre has data`);
      classes.add(level);
      assert.equal(rgb(await pixelAt(page, RASTER("cover"), at)), paletteRgb("academic-light", level), `${id}: the pixel at ${at} has the colour of class ${level}`);
    }
    assert.ok(classes.size >= 2, `the regions' cells have ${classes.size} classes: the picture is not one flat colour`);
    // the cells in the middle of the legend's swatches: the classes take the categorical palette in order
    const [row] = await legendOf(page);
    assert.deepEqual(row.items.map((i) => [i.label, i.color]), ["Forest", "Cropland", "Urban"].map((name, i) => [name, paletteRgb("academic-light", i)]));
    assert.deepEqual(ctx.errors, []);
  });
});

test("rasters: borders stay above rasters", async () => {
  await withPage({ root, url: pages.url("rasters", "step=density") }, async (page, ctx) => {
    const layers = await page.evaluate(() => [...document.querySelectorAll('[data-el="map"] canvas')].map((c) => c.dataset.layer));
    assert.deepEqual(layers, ["main:base", ...["density", "cover", "wells", "half", "log"].map(RASTER), "main:borders"], "the land, the rasters as declared, the borders last");
    const rule = await tokenRgb(page, "--sd-color-rule");
    const edge = AT.edge("N1");
    const border = (await pixelsAround(page, "main:borders", edge, 3)).filter((p) => p[3] >= 200 && rgb(p) === rule);
    assert.ok(border.length > 0, "a border pixel of North in the rule colour");
    // and the raster is under it: the cells on both sides of the border have data, so the raster has colour right there
    const raster = (await pixelsAround(page, RASTER("density"), edge, 3)).filter((p) => p[3] === 255);
    assert.ok(raster.length > 0, "the raster has pixels where the border is");
    assert.deepEqual(ctx.errors, []);
  });
});

test("rasters: diverging no-data land is hatched and the legend has the row", async () => {
  await withPage({ root, url: pages.url("rasters", "step=density") }, async (page, ctx) => {
    const [dim, surface] = [await tokenRgb(page, "--sd-color-dim"), await tokenRgb(page, "--sd-color-surface")];
    const density = rasterFile("density");
    const [cols, rows] = density.size;
    const land = landCells({ bounds: density.bounds, size: density.size }, LAND);
    let gap = null, sea = null, filled = null;
    for (let i = 0; i < cols * rows; i++) {
      const [col, row] = [i % cols, Math.floor(i / cols)];
      const { data } = density.cell(col, row);
      if (land[i] && !data && !gap) gap = [col, row];
      if (!land[i] && !data && !sea) sea = [col, row];
      if (land[i] && data && !filled && row > 8 && row < 20 && col > 8 && col < 30) filled = [col, row];
    }
    assert.ok(gap && sea && filled, "the fixture has land without data, sea and data");
    // a cell of land with no data: a stripe in the dim colour and the surface between stripes, never the ramp's pale middle
    const stripes = await pixelsAround(page, RASTER("density"), density.pixelOf(...gap), 5);
    assert.ok(hatched(stripes, dim, surface), `the gap has stripes (${[...new Set(stripes.map(rgb))].join(" | ")})`);
    assert.equal((await pixelAt(page, RASTER("density"), density.pixelOf(...sea)))[3], 0, "sea with no data stays clear");
    const colours = new Set((await pixelsAround(page, RASTER("density"), density.pixelOf(...filled), 1)).map(rgb));
    assert.ok(![...colours].some((c) => c === dim || c === surface), "a cell with data is its colour");

    const [row] = await legendOf(page);
    assert.equal(row.title, "People per km²");
    assert.match(row.ramp, /^linear-gradient\(/, "a diverging ramp");
    assert.deepEqual(row.ends, ["0", "800"]);
    assert.deepEqual(row.items, [{ label: "no data", color: "", nodata: true }], "and the hatched No-data swatch");

    // a raster with data on all its land, and a mask, have no such row
    await goTo(page, "rasters", "cover");
    assert.deepEqual((await legendOf(page))[0].items.map((i) => i.label), ["Forest", "Cropland", "Urban"]);
    await goTo(page, "rasters", "wells");
    assert.deepEqual((await legendOf(page))[0].items.map((i) => i.label), ["Near a well"]);
    assert.deepEqual(ctx.errors, []);
  });
});

test("rasters: clipped to land by default, whole cells with clip false", async () => {
  await withPage({ root, url: pages.url("rasters", "step=density") }, async (page, ctx) => {
    const [w, h] = SIZE;
    // the land as the base layer paints it: a pixel past the coastline is one whose neighbours (3 px each way) are all clear
    const ground = await page.evaluate(() => {
      const canvas = document.querySelector('[data-el="map"] canvas[data-layer="main:base"]');
      const d = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      return Array.from({ length: d.length / 4 }, (_, i) => d[i * 4 + 3]);
    });
    const clearAround = (x, y) => {
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (ground[(y + dy) * w + x + dx] !== 0) return false;
      return true;
    };
    /** A pixel in the sea that lies inside a cell of `file` that has data and whose centre is on land: where a whole cell sticks out. */
    const pastCoast = (file) => {
      const [cols, rows] = file.size;
      const land = landCells({ bounds: file.bounds, size: file.size }, LAND);
      for (let y = 4; y < h - 4; y += 2) {
        for (let x = 4; x < w - 4; x += 2) {
          const lonLat = BASE.invert([x, y]);
          if (!lonLat || !clearAround(x, y)) continue;
          const [col, row] = file.cellAt(lonLat);
          if (col >= 0 && col < cols && row >= 0 && row < rows && land[row * cols + col] && file.cell(col, row).data) return [x, y];
        }
      }
      return null;
    };
    const density = rasterFile("density");
    const sea = pastCoast(density);
    assert.ok(sea, "the fixture has a coastal cell centred on land whose data reaches into the sea");
    const filled = regionCell(density, "N1");
    assert.ok(filled.data);

    assert.equal((await pixelAt(page, RASTER("density"), sea))[3], 0, "clipped by default: nothing is painted past the coastline");
    const inland = await pixelAt(page, RASTER("density"), filled.at);
    assert.equal(inland[3], 255, "and the land has its colour");

    await goTo(page, "rasters", "whole"); // `clip: false`
    assert.equal((await pixelAt(page, RASTER("density"), sea))[3], 255, "clip false: the cell is drawn whole, so its colour reaches past the coastline");
    assert.deepEqual(await pixelAt(page, RASTER("density"), filled.at), inland, "and the land is the same");

    // a class raster and a mask clip too
    for (const [step, name] of [["cover", "cover"], ["wells", "wells"]]) {
      await goTo(page, "rasters", step);
      const edge = pastCoast(rasterFile(name));
      if (edge) assert.equal((await pixelAt(page, RASTER(name), edge))[3], 0, `${name}: clipped`);
      else assert.equal(name, "wells", "only the mask has no cell past the coast");
    }
    assert.deepEqual(ctx.errors, []);
  });
});

test("rasters: a mask takes its role colour", async () => {
  await withPage({ root, url: pages.url("rasters", "step=wells") }, async (page, ctx) => {
    const wells = rasterFile("wells");
    const [cols, rows] = wells.size;
    let on = null, off = null;
    const land = landCells({ bounds: wells.bounds, size: wells.size }, LAND);
    for (let i = 0; i < cols * rows; i++) {
      const { data } = wells.cell(i % cols, Math.floor(i / cols));
      if (data && !on) on = [i % cols, Math.floor(i / cols)];
      if (land[i] && !data && !off) off = [i % cols, Math.floor(i / cols)];
    }
    // the default is the accent colour; a cell that is not the class stays clear, hatch or no hatch
    assert.equal(rgb(await pixelAt(page, RASTER("wells"), wells.pixelOf(...on))), await tokenRgb(page, "--sd-color-accent"), "accent by default");
    assert.equal((await pixelAt(page, RASTER("wells"), wells.pixelOf(...off)))[3], 0, "land that is not a well is clear: a mask has no no-data");
    const [row] = await legendOf(page);
    assert.deepEqual(row.items, [{ label: "Near a well", color: await tokenRgb(page, "--sd-color-accent"), nodata: false }]);
    await goTo(page, "rasters", "alert");
    const alert = await tokenRgb(page, "--sd-color-alert");
    assert.equal(rgb(await pixelAt(page, RASTER("wells"), wells.pixelOf(...on))), alert, "the layer's `color` names a theme role");
    assert.equal((await legendOf(page))[0].items[0].color, alert, "and the swatch follows");
    assert.deepEqual(ctx.errors, []);
  });
});

test("raster partly outside the boundaries", async () => {
  await withPage({ root, url: pages.url("rasters", "step=half") }, async (page, ctx) => {
    const [dim, surface] = [await tokenRgb(page, "--sd-color-dim"), await tokenRgb(page, "--sd-color-surface")];
    const half = rasterFile("half");
    // the west: a region the raster covers is painted
    const west = regionCell(half, "W1");
    assert.ok(west.data, "W1's cell has data");
    const painted = await pixelAt(page, RASTER("half"), west.at);
    assert.equal(painted[3], 255);
    assert.ok(![dim, surface].includes(rgb(painted)), "painted with its ramp colour, not hatched");
    // the east: land beyond the raster's bounds is hatched, in a canvas of its own, and the sea beside it is clear
    const east = await pixelsAround(page, RASTER("half"), AT.get("E1"), 5);
    assert.ok(hatched(east, dim, surface), `the east has stripes (${[...new Set(east.map(rgb))].join(" | ")})`);
    assert.equal((await pixelAt(page, RASTER("half"), [SIZE[0] - 5, 5]))[3], 0, "sea is clear");
    const [row] = await legendOf(page);
    assert.deepEqual(row.items, [{ label: "no data", color: "", nodata: true }], "the legend explains the hatch");
    assert.deepEqual(await errorsOf(page), []);
    assert.deepEqual(ctx.errors, []);
  });
});

test("rasters: a log raster reads its scale from the file", async () => {
  await withPage({ root, url: pages.url("rasters", "step=log") }, async (page, ctx) => {
    const [row] = await legendOf(page);
    assert.equal(row.title, "People per km², log");
    assert.deepEqual(row.ends, ["1", "1,000"]);
    assert.match(row.ramp, /^linear-gradient\(/);
    assert.deepEqual(ctx.errors, []);
  });
});

test("rasters: fade in and out", async () => {
  await withPage({ root, url: pages.url("rasters", "step=base&motion=full") }, async (page, ctx) => {
    const density = rasterFile("density");
    const { at, data } = regionCell(density, "S1");
    assert.ok(data, "S1's cell has data");
    const shows = await sampleFrames(page, "rasters", "density", "map", alphaProbe(RASTER("density"), at));
    assert.equal(shows.frames[0].alpha, 0, "the layer starts clear");
    assert.equal(shows.end.alpha, 255, "and ends opaque");
    assert.ok(shows.frames.filter((f) => f.alpha > 0 && f.alpha < 255).length >= 2, "passing through partial opacity");
    assert.ok(shows.frames.every((f, i) => i === 0 || f.alpha >= shows.frames[i - 1].alpha), "and only rising");

    // the same pixel, with the layer going away: from the step where the log raster is shown to the one that shows none
    await ctx.open(pages.url("rasters", "step=log&motion=full"));
    const hides = await sampleFrames(page, "rasters", "gone", "map", alphaProbe(RASTER("log"), at));
    assert.equal(hides.frames[0].alpha, 255, "the layer starts opaque");
    assert.equal(hides.end.alpha, 0, "and ends clear");
    assert.ok(hides.frames.filter((f) => f.alpha > 0 && f.alpha < 255).length >= 2, "passing through partial opacity");
    assert.ok(hides.frames.every((f, i) => i === 0 || f.alpha <= hides.frames[i - 1].alpha), "and only falling");
    assert.deepEqual(ctx.errors, []);
  });
});

test("rasters: a change of colour crossfades", async () => {
  await withPage({ root, url: pages.url("rasters", "step=wells&motion=full") }, async (page, ctx) => {
    const wells = rasterFile("wells");
    const [cols, rows] = wells.size;
    const on = Array.from({ length: cols * rows }, (_, i) => [i % cols, Math.floor(i / cols)]).find(([col, row]) => wells.cell(col, row).data);
    const { frames, end } = await sampleFrames(page, "rasters", "alert", "map", colourProbe(RASTER("wells"), wells.pixelOf(...on)));
    const from = frames[0].color;
    assert.equal(from, await tokenRgb(page, "--sd-color-accent"));
    assert.equal(end.color, await tokenRgb(page, "--sd-color-alert"));
    // strictly between the two on every channel: the old picture goes as the new one comes
    const [a, b] = [from, end.color].map((c) => c.match(/\d+/g).map(Number));
    const mid = frames.filter((f) => f.color.match(/\d+/g).map(Number).every((v, i) => v > Math.min(a[i], b[i]) && v < Math.max(a[i], b[i])));
    assert.ok(mid.length >= 2, `${mid.length} frames between ${from} and ${end.color} (${frames.map((f) => f.color).join(" | ")})`);
    assert.deepEqual(ctx.errors, []);
  });
});

test("rasters: a mask colour that is not a theme colour errors", async () => {
  await withPage({ root, url: broken.url("color", "") }, async (page, ctx) => {
    const [message] = await errorsOf(page);
    assert.match(message, /^color\/map: data\/mask\.json: color 'teal' is not a theme colour \(.*\baccent\b/);
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

// --- points -----------------------------------------------------------------------------------------------------

const POINTS = (name) => `main:points:${name}`;
/** The fixture's sites, read in Node: `at` is the pixel of each one (the same projection the map fits), `beds` its size. */
const SITES = new Map(readFileSync(`${root}${DECK}data/sites.csv`, "utf8").trim().split("\n").slice(1).map((line) => {
  const [id, lon, lat, beds, kind] = line.split(",");
  return [id, { at: BASE([Number(lon), Number(lat)]).map(Math.round), exact: BASE([Number(lon), Number(lat)]), beds: Number(beds), kind }];
}));
const POINT_STEPS = ["base", "sites", "focus", "role", "plain", "alert"];
/** The size of a point of the largest size `max`: the area is true to the value, 18 px across at the largest. */
const radiusOf = (beds, max = 70) => 18 * Math.sqrt(beds / max);
/** The key of the layer on screen, as the page shows it: the title, the colour swatches and the circles with their labels. */
const keyOf = (page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-el="map"] .sd-map-legend .sd-legend-row')].map((row) => ({
    title: row.querySelector(".sd-legend-title")?.textContent ?? null,
    swatches: [...row.querySelectorAll(".sd-legend-swatch")].map((s) => s.style.backgroundColor),
    labels: [...row.querySelectorAll(".sd-legend-item .sd-legend-label")].map((n) => n.textContent),
    circles: [...row.querySelectorAll(".sd-legend-circle")].map((c) => Number(c.getAttribute("width"))),
  })));
/** How wide a point is along the row of its centre, as the radius its fill covers plus the half of the 1.5 px outline. */
async function measuredRadius(page, layer, id, fill) {
  const { exact: [x, y], at } = SITES.get(id);
  const box = await pixelsAround(page, layer, [at[0], Math.round(y)], 30);
  const row = box.slice(30 * 61, 31 * 61); // the middle row of the 61 x 61 box
  return row.filter((p) => p[3] === 255 && rgb(p) === fill).length / 2 + 0.75;
}

test("points: played equals jumped", async () => {
  await withPage({ root, url: pages.url("points", "step=base") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "points", steps: POINT_STEPS, id: "map" });
    assert.deepEqual(await errorsOf(page), []);
  });
});

test("points: backward and interrupted equal the jump", async () => {
  await withPage({ root, url: pages.url("points", "step=base") }, async (page, ctx) => {
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "points", steps: POINT_STEPS, id: "map" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "points", from: "base", via: "sites", to: "focus", id: "map", keep: LEGEND_COLOURS });
    // in the middle of a recolouring, then on to another layer
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "points", from: "focus", via: "role", to: "plain", id: "map", keep: LEGEND_COLOURS });
    assert.deepEqual(await errorsOf(page), []);
  });
});

test("points: the layers stack land, borders, points, labels", async () => {
  await withPage({ root, url: pages.url("points", "step=sites") }, async (page, ctx) => {
    const order = await page.evaluate(() => [...document.querySelector('[data-el="map"]').children].filter((n) => n.localName === "canvas" || n.localName === "svg").map((n) => n.dataset.layer ?? n.getAttribute("class")));
    assert.deepEqual(order, ["main:base", "main:borders", POINTS("sites"), POINTS("plain"), "sd-map-labels"], "points are over the borders, the names over the points");
    const sites = await page.evaluate(() => document.querySelector('canvas[data-layer="main:points:sites"]').dataset);
    assert.equal(sites.shown, "sites");
    assert.match(sites.sig, /^[0-9a-f]{8}$/);
    assert.equal(await page.evaluate(() => document.querySelector('canvas[data-layer="main:points:plain"]').dataset.sig), "", "a layer that is not shown paints nothing");
    assert.deepEqual(ctx.errors, []);
  });
});

test("points: radius follows the area of the value", async () => {
  await withPage({ root, url: pages.url("points", "step=sites") }, async (page, ctx) => {
    const fill = (id) => paletteRgb("academic-light", SITES.get(id).kind === "clinic" ? 0 : 1);
    // S4 has 40 beds and S1 has 10: four times the area, twice the radius. The largest, S7 with 70, is 18 px.
    const [big, small] = [await measuredRadius(page, POINTS("sites"), "S4", fill("S4")), await measuredRadius(page, POINTS("sites"), "S1", fill("S1"))];
    assert.ok(Math.abs(big - radiusOf(40)) <= 1, `S4: ${big} px, expected ${radiusOf(40).toFixed(1)}`);
    assert.ok(Math.abs(small - radiusOf(10)) <= 1, `S1: ${small} px, expected ${radiusOf(10).toFixed(1)}`);
    assert.ok(Math.abs(big - 2 * small) <= 1, `${big} px is twice ${small} px`);
    assert.ok(Math.abs((await measuredRadius(page, POINTS("sites"), "S7", fill("S7"))) - 18) <= 1, "the largest is 18 px");
    // without `size` every point is 6 px
    await goTo(page, "points", "plain");
    const accent = await tokenRgb(page, "--sd-color-accent");
    assert.ok(Math.abs((await measuredRadius(page, POINTS("plain"), "S4", accent)) - 6) <= 1, "6 px without a size");
    assert.ok(Math.abs((await measuredRadius(page, POINTS("plain"), "S1", accent)) - 6) <= 1);
    assert.deepEqual(ctx.errors, []);
  });
});

test("points: size key values are round", async () => {
  await withPage({ root, url: pages.url("points", "step=sites") }, async (page, ctx) => {
    const [row, ...more] = await keyOf(page);
    assert.equal(more.length, 0, "one row for the layer");
    assert.equal(row.title, "Beds");
    // the largest, 70, and the round number (1, 2 or 5 times a power of ten) at most a quarter of it, at the radii those values have on the map
    assert.deepEqual(row.labels, ["clinic", "hospital", "70", "10"]);
    assert.equal(row.circles[0], 36, "the largest has the diameter of the largest point");
    assert.ok(Math.abs(row.circles[1] - 36 * Math.sqrt(10 / 70)) < 0.01, `and the other, a round value, the area its value has: ${row.circles[1]}`);
    // a layer with no size and no colour column explains nothing
    await goTo(page, "points", "plain");
    assert.deepEqual(await keyOf(page), []);
    assert.deepEqual(ctx.errors, []);
  });
});

test("points: colour column takes the categorical palette in order", async () => {
  await withPage({ root, url: pages.url("points", "step=sites") }, async (page, ctx) => {
    // clinic appears first (S1), then hospital
    const [clinic, hospital] = [paletteRgb("academic-light", 0), paletteRgb("academic-light", 1)];
    assert.deepEqual((await keyOf(page))[0].swatches, [clinic, hospital]);
    for (const [id, site] of SITES) {
      assert.equal(rgb(await pixelAt(page, POINTS("sites"), site.at)), site.kind === "clinic" ? clinic : hospital, `${id} is a ${site.kind}`);
    }
    // a colour that is not a column is a theme role: accent by default, then the alert colour
    await goTo(page, "points", "role");
    const alert = await tokenRgb(page, "--sd-color-alert");
    assert.equal(rgb(await pixelAt(page, POINTS("sites"), SITES.get("S1").at)), alert, "the role colours every point");
    assert.deepEqual((await keyOf(page))[0].swatches, [], "and the key keeps its size circles only");
    await goTo(page, "points", "plain");
    assert.equal(rgb(await pixelAt(page, POINTS("plain"), SITES.get("S1").at)), await tokenRgb(page, "--sd-color-accent"));
    await goTo(page, "points", "alert");
    assert.equal(rgb(await pixelAt(page, POINTS("plain"), SITES.get("S1").at)), alert);
    assert.deepEqual(ctx.errors, []);
  });
});

test("points: highlight dims the rest", async () => {
  await withPage({ root, url: pages.url("points", "step=sites") }, async (page, ctx) => {
    const [clinic, hospital] = [paletteRgb("academic-light", 0), paletteRgb("academic-light", 1)];
    await goTo(page, "points", "focus");
    const [dim, ink] = [await tokenRgb(page, "--sd-color-dim"), await tokenRgb(page, "--sd-color-ink")];
    assert.equal(rgb(await pixelAt(page, POINTS("sites"), SITES.get("S4").at)), hospital, "S4 keeps its colour");
    for (const id of ["S1", "S2", "S3", "S5", "S6", "S7"]) assert.equal(rgb(await pixelAt(page, POINTS("sites"), SITES.get(id).at)), dim, `${id} turns the dim colour`);
    // and S4 gets an ink outline, which the others do not
    const ring = async (id) => {
      const [x, y] = SITES.get(id).at;
      const r = Math.round(radiusOf(SITES.get(id).beds));
      return (await pixelsAround(page, POINTS("sites"), [x + r, y], 2)).filter((p) => p[3] > 0).map(rgb);
    };
    const near = (c, target, by) => c.match(/\d+/g).map(Number).every((v, i) => Math.abs(v - target.match(/\d+/g).map(Number)[i]) <= by);
    assert.ok((await ring("S4")).some((c) => near(c, ink, 90)), `S4's outline is ink (${(await ring("S4")).join(" | ")})`);
    assert.ok(!(await ring("S5")).some((c) => near(c, ink, 90)), "S5's is not");
    assert.equal((await page.evaluate(() => document.querySelector('canvas[data-layer="main:points:sites"]').dataset.highlight)), "S4");
    await goTo(page, "points", "sites");
    assert.equal(rgb(await pixelAt(page, POINTS("sites"), SITES.get("S1").at)), clinic, "and it lasts one step");
    assert.deepEqual(ctx.errors, []);
  });
});

test("points: a fade brings the layer in and a change of colour crossfades", async () => {
  await withPage({ root, url: pages.url("points", "step=base&motion=full") }, async (page, ctx) => {
    const { at } = SITES.get("S1");
    const shows = await sampleFrames(page, "points", "sites", "map", alphaProbe(POINTS("sites"), at));
    assert.equal(shows.frames[0].alpha, 0, "the layer starts clear");
    assert.equal(shows.end.alpha, 255, "and ends opaque");
    assert.ok(shows.frames.filter((f) => f.alpha > 0 && f.alpha < 255).length >= 2, "passing through partial opacity");
    await ctx.open(pages.url("points", "step=focus&motion=full"));
    const { frames, end } = await sampleFrames(page, "points", "role", "map", colourProbe(POINTS("sites"), at));
    assert.equal(end.color, await tokenRgb(page, "--sd-color-alert"));
    assert.ok(frames.some((f) => strictlyBetween(f.color, frames[0].color, end.color)), `a frame between the two colours (${frames.map((f) => f.color).join(" | ")})`);
    assert.deepEqual(ctx.errors, []);
  });
});

test("points: a row without lon or lat errors", async () => {
  await withPage({ root, url: broken.url("row", "") }, async (page, ctx) => {
    assert.deepEqual(await errorsOf(page), ["row/map: data/sites.csv: row 4 has no lon"]);
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("points: a misspelled lon column errors", async () => {
  await withPage({ root, url: broken.url("lon", "") }, async (page, ctx) => {
    assert.deepEqual(await errorsOf(page), ["lon/map: column 'lng' not found in data/sites.csv (columns: id, lon, lat, beds, kind)"]);
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("points: highlight names regions and points, and a colour that is neither a column nor a role errors", async () => {
  await withPage({ root, url: broken.url("point", "") }, async (page, ctx) => {
    assert.deepEqual(await errorsOf(page), ["point/map: 'Nowhere' not found (regions: E1, I1, I2, N1, N2, …; points: S1, S2, S3, S4, S5, …)"]);
    await ctx.open(broken.url("hue", ""));
    const [message] = await errorsOf(page);
    assert.match(message, /^hue\/map: data\/sites-ok\.csv: color 'kinds' is not a column \(id, lon, lat, beds, kind\) or a theme colour \(.*\baccent\b/);
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

// --- flights ----------------------------------------------------------------------------------------------------

const FLIGHT_STEPS = ["home", "north", "pair", "box", "back"];
/** The views the flight slide's steps name: home (twice: `back` is `view: null`), one region, two regions, a box. */
const FLIGHT_VIEWS = 4;
/** A `sampleFrames` probe of the view on the land's canvas, and the alpha of the raster at the middle of the element. */
const flightProbe = new Function("el", `
  const [k, x, y] = el.querySelector('canvas[data-layer="main:base"]').dataset.view.split(",").map(Number);
  const alpha = el.querySelector('canvas[data-layer="main:raster:density"]').getContext("2d").getImageData(700, 350, 1, 1).data[3];
  return { k, x, y, alpha };`);
const viewsOf = (page) => page.evaluate(() => [...document.querySelectorAll('[data-el="map"] canvas')].map((c) => c.dataset.view));
/** The canvases' state (every `data-*`) and pixels: what a view shows, the names (SVG) aside. */
const canvasesOf = async (page) => ({ data: await page.evaluate(() => [...document.querySelectorAll('[data-el="map"] canvas')].map((c) => ({ ...c.dataset }))), pixels: await canvasPixels(page, "map") });
const namesOf = (page) => page.evaluate(() => [...document.querySelectorAll('[data-el="map"] text.sd-map-label')].map((t) => t.dataset.region));
const lookupsOf = (page) => page.evaluate(() => document.querySelector('[data-el="map"]').sdMapLookups());

test("flight: passes intermediate scales", async () => {
  await withPage({ root, url: pages.url("flight", "step=home&motion=full") }, async (page, ctx) => {
    const duration = parseFloat(await page.evaluate(() => getComputedStyle(document.querySelector(".sd-canvas")).getPropertyValue("--sd-duration")));
    const { frames, end, settledMs } = await sampleFrames(page, "flight", "north", "map", flightProbe);
    const north = view(BASE, [REGIONS.get("N1")], SIZE);
    assert.equal(frames[0].k, 1, "the flight starts at home");
    assert.ok(Math.abs(end.k - north.k) < 0.001 && Math.abs(end.x - north.x) < 0.001 && Math.abs(end.y - north.y) < 0.001, `and ends fitted to North (${end.k},${end.x},${end.y})`);
    const inBetween = frames.filter((f) => f.k > 1 + 1e-3 && f.k < north.k - 1e-3);
    assert.ok(inBetween.length >= 2, `${inBetween.length} frames at a scale strictly between 1 and ${north.k.toFixed(3)}`);
    // over 2 × --sd-duration, never a snap
    const arrived = frames.find((f) => Math.abs(f.k - north.k) < 0.001)?.ms ?? end.ms;
    assert.ok(arrived >= 0.8 * 2 * duration, `the flight takes about ${2 * duration} ms (arrived at ${arrived.toFixed(0)} ms)`);
    assert.ok(settledMs <= 2 * 2 * duration + 1000, `within a generous bound (${settledMs.toFixed(0)} ms)`);
    // the raster stays filled while it moves: the middle of the element is on land in every frame of this flight
    assert.ok(frames.every((f) => f.alpha === 255), `the raster is opaque in every frame (${frames.map((f) => f.alpha).join(" ")})`);
    // the names follow the view
    const anchor = d3.geoPath(BASE).centroid(REGIONS.get("N1"));
    const [x, y] = applyView(north, anchor);
    const label = await page.evaluate(() => { const t = document.querySelector('[data-el="map"] text.sd-map-label[data-region="N1"]'); return [Number(t.getAttribute("x")), Number(t.getAttribute("y"))]; });
    assert.ok(Math.abs(label[0] - x) <= 0.1 && Math.abs(label[1] - y) <= 0.1, `North's name at ${label}, not ${x},${y}`);
    assert.deepEqual(ctx.errors, []);
  });
});

/** Pixels of the element near its edges and corners and in between, where a flight that zooms out shows what its start did not. */
const EDGE_PIXELS = [40, 360, 700, 1040, 1360].flatMap((x) => [40, 175, 350, 525, 660].map((y) => [x, y]));

test("flight: zooming out keeps the raster filled", async () => {
  await withPage({ root, url: pages.url("flight", "step=box&motion=full") }, async (page, ctx) => {
    const probe = new Function("el", `
      const [k, x, y] = el.querySelector('canvas[data-layer="main:base"]').dataset.view.split(",").map(Number);
      const g = el.querySelector('canvas[data-layer="main:raster:density"]').getContext("2d");
      return { k, x, y, alphas: ${JSON.stringify(EDGE_PIXELS)}.map(([px, py]) => g.getImageData(px, py, 1, 1).data[3]) };`);
    const { frames } = await sampleFrames(page, "flight", "back", "map", probe);
    const box = view(BASE, { bounds: [-15, -28, -12, -25] }, SIZE);
    const flying = frames.filter((f) => f.k < box.k - 1e-3 && f.k > 1 + 1e-3);
    // At rest at home the raster's canvas is the end's picture: whether it is opaque around the point that a pixel of
    // each frame shows (the pixel seen back through that frame's view), 5 × 5 px of it, all inside the element.
    const endHasData = await page.evaluate(([views, pixels, [w, h]]) => {
      const alpha = document.querySelector('[data-el="map"] canvas[data-layer="main:raster:density"]').getContext("2d").getImageData(0, 0, w, h).data;
      const opaque = (px, py) => px >= 0 && py >= 0 && px < w && py < h && alpha[(py * w + px) * 4 + 3] === 255;
      return views.map(({ k, x, y }) => pixels.map(([sx, sy]) => {
        const [cx, cy] = [Math.round((sx - x) / k), Math.round((sy - y) / k)];
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!opaque(cx + dx, cy + dy)) return false;
        return true;
      }));
    }, [flying.map(({ k, x, y }) => ({ k, x, y })), EDGE_PIXELS, SIZE]);
    const checked = flying.flatMap((f, i) => EDGE_PIXELS.map(([sx, sy], j) => {
      // where the start's picture reaches in this frame: the element seen at the box view, placed at this frame's view
      const scale = f.k / box.k, left = f.x - scale * box.x, top = f.y - scale * box.y;
      const beyond = sx < left || sx > left + scale * SIZE[0] || sy < top || sy > top + scale * SIZE[1];
      return { at: [sx, sy], k: f.k, alpha: f.alphas[j], data: endHasData[i][j], beyond };
    })).filter((c) => c.data);
    assert.ok(checked.filter((c) => c.beyond).length >= 3, `some samples lie where the start's picture does not reach (${checked.filter((c) => c.beyond).length})`);
    const thin = checked.filter((c) => c.alpha !== 255);
    assert.deepEqual(thin, [], "where the end's picture has data the raster is opaque in every frame of the flight");
    assert.deepEqual(ctx.errors, []);
  });
});

test("flight: played equals jumped, pixels too", async () => {
  await withPage({ root, url: pages.url("flight", "step=home") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "flight", steps: FLIGHT_STEPS, id: "map" });
    assert.deepEqual(await errorsOf(page), []);
  });
});

test("flight: abort mid-flight snaps", async () => {
  await withPage({ root, url: pages.url("flight", "step=home") }, async (page, ctx) => {
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "flight", from: "home", via: "north", to: "pair", id: "map", keep: LEGEND_COLOURS });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "flight", from: "pair", via: "box", to: "back", id: "map", keep: LEGEND_COLOURS });
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "flight", steps: FLIGHT_STEPS, id: "map" });
    assert.deepEqual(await errorsOf(page), []);
  });
});

test("flight: view null returns home", async () => {
  await withPage({ root, url: pages.url("flight", "step=home") }, async (page, ctx) => {
    const home = await canvasesOf(page);
    await ctx.open(pages.url("flight", "step=back"));
    assert.ok((await viewsOf(page)).every((v) => v === "1.000,0.000,0.000"), "every canvas is at the home view");
    assert.deepEqual(await canvasesOf(page), home, "the canvases show what the first step shows, pixels too");
    // played: from the box, home again
    await ctx.open(pages.url("flight", "step=box&motion=full"));
    assert.ok((await viewsOf(page)).every((v) => v !== "1.000,0.000,0.000"), "the box is not home");
    await goTo(page, "flight", "back");
    assert.ok((await viewsOf(page)).every((v) => v === "1.000,0.000,0.000"), "and the flight ends at home");
    assert.deepEqual(ctx.errors, []);
  });
});

test("flight: a name out of the view is not drawn", async () => {
  await withPage({ root, url: pages.url("flight", "step=north") }, async (page, ctx) => {
    // zoomed to North, Marshby's centre is far below the element
    const north = view(BASE, [REGIONS.get("N1")], SIZE);
    const [, y] = applyView(north, d3.geoPath(BASE).centroid(REGIONS.get("S2")));
    assert.ok(y > SIZE[1], `Marshby's centre is out of the view (y = ${y.toFixed(0)})`);
    assert.deepEqual(await namesOf(page), ["N1"]);
    await goTo(page, "flight", "back");
    assert.deepEqual(await namesOf(page), ["N1", "S2"], "home again, both names are drawn");
    assert.deepEqual(ctx.errors, []);
  });
});

test("flight: unknown region errors", async () => {
  await withPage({ root, url: broken.url("view", "") }, async (page, ctx) => {
    assert.deepEqual(await errorsOf(page), ["view/map: region 'Nowhere' not found (regions: E1, I1, I2, N1, N2, …)"]);
    await ctx.open(broken.url("view-point", ""));
    assert.deepEqual(await errorsOf(page), ["view-point/map: 'S4' is a point: `view` names regions only (regions: E1, I1, I2, N1, N2, …)"]);
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("flight: lookups for every view are ready after mount", async () => {
  await withPage({ root, url: pages.url("flight", "step=home&motion=full") }, async (page, ctx) => {
    const ready = await lookupsOf(page);
    assert.ok(ready >= FLIGHT_VIEWS, `${ready} lookup tables after mount, one per view at least (${FLIGHT_VIEWS})`);
    // a function the element carries, never an attribute or an own enumerable key
    const hidden = await page.evaluate(() => {
      const el = document.querySelector('[data-el="map"]');
      return { type: typeof el.sdMapLookups, keys: Object.keys(el).includes("sdMapLookups"), html: el.outerHTML.includes("sdMapLookups") || el.outerHTML.includes("lookups") };
    });
    assert.deepEqual(hidden, { type: "function", keys: false, html: false });
    // a flight draws its pictures at its two ends only, so playing every step builds no table for a view in between
    for (const step of FLIGHT_STEPS.slice(1)) await goTo(page, "flight", step);
    assert.equal(await lookupsOf(page), ready, "no lookup table was built during the flights");
    assert.deepEqual(ctx.errors, []);
  });
});
