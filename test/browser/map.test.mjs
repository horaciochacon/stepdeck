// The built-in `map` in Chrome: boundaries, choropleth areas, raster layers, points, labels, highlight, the legend, flights, the inset and time-lapse runs, on the map fixture deck
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
import { deckPages, goTo, settled, elementHtml, canvasPixels, tokenRgb, paletteRgb, sampleFrames, colorMove, expectJumpEqualsPlayed, expectBackwardEqualsJump, expectInterruptEqualsJump } from "./helpers.mjs";

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
    assert.ok(move.arrived - move.start <= fast + 2000, `done within a generous bound of ${fast} ms (${(move.arrived - move.start).toFixed(0)} ms)`);
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

/**
 * The map fixture deck in the reveal shell, which pauses a slide it leaves (the bare shell destroys it). The page is
 * served by a route, so the deck folder holds no page of its own; its import map points at the repository's engine.
 */
const REVEAL_PAGE = `${DECK}reveal.html`;
const revealPage = (page) =>
  page.route(`**/${REVEAL_PAGE}`, (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:,">
<script type="importmap">{ "imports": { "stepdeck/": "../../../../engine/" } }</script></head>
<body><script type="module">import { boot } from "stepdeck/core/stepdeck.js"; boot({ shell: "reveal" });</script></body></html>` }));

test("map: leaving the slide frees its caches, and coming back draws the same", async () => {
  await withPage({ root }, async (page, ctx) => {
    await revealPage(page);
    await ctx.open(`${REVEAL_PAGE}#/flight/north`);
    // reveal keeps the slides around this one mounted: read the flight slide's own map
    const map = '[data-sd-slide="flight"] [data-el="map"]';
    const read = () => page.evaluate((map) => {
      const el = document.querySelector(map);
      return { html: el.outerHTML, pixels: [...el.querySelectorAll("canvas")].map((c) => c.toDataURL()), lookups: el.sdMapLookups() };
    }, map);
    const go = async (slide, step) => {
      await page.evaluate(([slide, step]) => window.STEPDECK.goTo(slide, step), [slide, step]);
      await settled(page);
    };
    const north = await read();
    assert.ok(north.lookups > 0, "the raster's lookup tables are built");
    await go("flight", "home");
    await go("areas", "base");
    assert.equal((await read()).lookups, 0, "leaving the slide (pause) clears them");
    await go("flight", "north");
    const back = await read();
    assert.ok(back.lookups > 0, "coming back builds what the step needs");
    assert.equal(back.html, north.html, "the markup is the same");
    assert.deepEqual(back.pixels, north.pixels, "so are the pixels");
    assert.deepEqual(await errorsOf(page), []);
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

// --- the inset --------------------------------------------------------------------------------------------------

const INSET_STEPS = ["home", "inset", "pair", "named", "corner", "main", "off"];
/** The inset's room in the 1400 x 700 element: 36% of its width, the element's aspect, a margin of 3% of its width. */
const [IW, IH, MARGIN] = [504, 252, 42];
const INSET = ".sd-map-inset-stage";
const INSET_KEEP = `${LEGEND_COLOURS}, ${INSET}`;
const toRect = ([x, y, w, h]) => [x, y, x + w, y + h];
const corners = ([x0, y0, x1, y1]) => [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
const near = (a, b, by = 0.51) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= by);

/** What the inset shows through `target` (region ids) at `main`, the main map's view: the rectangle of the inset's px as seen on the main map. */
function boxOf(target, main = { k: 1, x: 0, y: 0 }) {
  const fitted = view(BASE, target.map((id) => REGIONS.get(id)), SIZE);
  const s = IW / SIZE[0];
  const [k, x, y] = [fitted.k * s, fitted.x * s, fitted.y * s];
  const [x0, y0] = applyView(main, [(0 - x) / k, (0 - y) / k]);
  const [x1, y1] = applyView(main, [(IW - x) / k, (IH - y) / k]);
  return [x0, y0, x1, y1];
}

/** The inset's furniture on the page: its stage's place, the box, the frame and the leaders in the main SVG, the scale bar in its own. */
const insetOf = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-el="map"]');
    const stage = el.querySelector(".sd-map-inset-stage");
    const g = el.querySelector("g.sd-map-inset");
    const num = (node, name) => Number(node.getAttribute(name));
    const rect = (name) => { const r = g.querySelector(name); return [num(r, "x"), num(r, "y"), num(r, "x") + num(r, "width"), num(r, "y") + num(r, "height")]; };
    const bar = stage?.querySelector("g.sd-map-scale");
    return {
      stage: stage ? { style: stage.getAttribute("style"), parent: stage.parentElement === el } : null,
      group: g ? { box: rect(".sd-map-inset-box"), frame: rect(".sd-map-inset-frame"), mainSvg: g.parentElement === el.querySelector(":scope > svg.sd-map-labels"),
        leaders: [...g.querySelectorAll("line.sd-map-inset-leader")].map((l) => ({ a: [num(l, "x1"), num(l, "y1")], b: [num(l, "x2"), num(l, "y2")], dash: l.getAttribute("stroke-dasharray"), hidden: l.getAttribute("display") === "none" })) } : null,
      scale: bar ? { label: bar.querySelector("text").textContent, bar: ["x1", "y1", "x2", "y2"].map((n) => num(bar.querySelector("line"), n)) } : null,
      canvases: [...el.querySelectorAll("canvas")].map((c) => c.dataset.layer),
    };
  });

test("inset: played equals jumped, pixels too", async () => {
  await withPage({ root, url: pages.url("inset", "step=home") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "inset", steps: INSET_STEPS, id: "map" });
    assert.deepEqual(await errorsOf(page), []);
  });
});

test("inset: backward and interrupted, even in the middle of its flight, equal the jump", async () => {
  await withPage({ root, url: pages.url("inset", "step=home") }, async (page, ctx) => {
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "inset", steps: INSET_STEPS, id: "map" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "inset", from: "home", via: "inset", to: "pair", id: "map", keep: INSET_KEEP });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "inset", from: "inset", via: "pair", to: "corner", id: "map", keep: INSET_KEEP });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "inset", from: "main", via: "off", to: "main", id: "map", keep: INSET_KEEP });
    assert.deepEqual(await errorsOf(page), []);
  });
});

test("inset: shows the shown layers at its view", async () => {
  await withPage({ root, url: pages.url("inset", "step=inset") }, async (page, ctx) => {
    const state = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-el="map"] canvas')].map((c) => [c.dataset.layer, { ...c.dataset }])));
    assert.deepEqual(Object.keys(state), ["main:base", "main:raster:density", "main:borders", "inset:base", "inset:raster:density", "inset:borders"]);
    const west = view(BASE, [REGIONS.get("W1")], SIZE);
    const kOf = (layer) => Number(state[layer].view.split(",")[0]);
    assert.equal(kOf("main:base"), 1, "the main map is at home");
    for (const part of ["base", "raster:density", "borders"]) {
      assert.ok(state[`inset:${part}`].view.startsWith(`${west.k.toFixed(3)},`), `inset:${part} is at Westmere's scale (${state[`inset:${part}`].view})`);
      assert.ok(kOf(`inset:${part}`) > kOf(`main:${part}`), `inset:${part} is zoomed in on main:${part}`);
      assert.equal(state[`inset:${part}`].shown, "density", `inset:${part} has the shown layers`);
      assert.match(state[`inset:${part}`].sig, /^[0-9a-f]{8}$/, `inset:${part} says what it painted`);
    }
    // the raster is drawn at the inset's size (a table for its px, not the element's) and fills its middle, with what the main map shows there
    const middle = await pixelAt(page, "inset:raster:density", [IW / 2, IH / 2]);
    assert.equal(middle[3], 255, "the inset's raster is opaque in the middle");
    const scale = IW / SIZE[0];
    const [px, py] = [(IW / 2 - west.x * scale) / (west.k * scale), (IH / 2 - west.y * scale) / (west.k * scale)];
    const seen = new Set((await pixelsAround(page, "main:raster:density", [Math.round(px), Math.round(py)], 2)).map(rgb));
    assert.ok(seen.has(rgb(middle)), `the inset's middle pixel ${rgb(middle)} is a colour the main map has there (${[...seen].join(" | ")})`);
    // its sea is the page's background, not the main map showing through
    const sea = await page.evaluate(() => getComputedStyle(document.querySelector(".sd-map-inset-stage")).backgroundColor);
    assert.equal(sea, await tokenRgb(page, "--sd-color-background"));
    assert.deepEqual(ctx.errors, []);
  });
});

test("inset: box and leaders match the inset view", async () => {
  await withPage({ root, url: pages.url("inset", "step=inset") }, async (page, ctx) => {
    const check = async (target, main, frame, where) => {
      const { stage, group } = await insetOf(page);
      assert.ok(stage.parent, `${where}: the inset's stage is a child of the element`);
      assert.ok(group.mainSvg, `${where}: the box and leaders are in the main SVG`);
      const box = boxOf(target, main);
      assert.ok(near(group.box, box), `${where}: the box ${group.box} is ${box}`);
      assert.ok(near(group.frame, frame, 0), `${where}: the frame ${group.frame} is ${frame}`);
      assert.equal(group.leaders.length, 2);
      const shown = group.leaders.filter((l) => !l.hidden);
      // a frame that overlaps the box has no leaders
      const overlap = box[0] < frame[2] && frame[0] < box[2] && box[1] < frame[3] && frame[1] < box[3];
      assert.equal(shown.length, overlap ? 0 : 2, `${where}: ${overlap ? "the frame overlaps the box, so no" : "two"} leaders`);
      if (overlap) return group;
      const [fromBox, fromFrame] = [corners(group.box), corners(group.frame)];
      for (const { a, b, dash } of shown) {
        assert.equal(dash, "6 4");
        assert.ok(fromBox.some((c) => near(c, a, 0.01)), `${where}: a leader starts at a corner of the box (${a})`);
        assert.ok(fromFrame.some((c) => near(c, b, 0.01)), `${where}: and ends at a corner of the frame (${b})`);
      }
      assert.notDeepEqual(shown[0].a, shown[1].a, `${where}: the leaders start at two corners`);
      return group;
    };
    const home = await check(["W1"], undefined, [SIZE[0] - MARGIN - IW, MARGIN, SIZE[0] - MARGIN, MARGIN + IH], "home");
    const bounds = d3.geoPath(BASE).bounds(REGIONS.get("W1"));
    assert.ok(home.box[0] <= bounds[0][0] && home.box[1] <= bounds[0][1] && home.box[2] >= bounds[1][0] && home.box[3] >= bounds[1][1], "the box holds all of Westmere");
    // the box has the aspect of the element, as the frame does
    assert.ok(Math.abs((home.box[2] - home.box[0]) / (home.box[3] - home.box[1]) - SIZE[0] / SIZE[1]) < 0.01);

    assert.equal(home.leaders.filter((l) => !l.hidden).length, 2, "Westmere's box is beside the frame: it has its two leaders");
    await goTo(page, "inset", "pair");
    const pair = await check(["W1", "S2"], undefined, [SIZE[0] - MARGIN - IW, MARGIN, SIZE[0] - MARGIN, MARGIN + IH], "pair");
    assert.equal(pair.leaders.filter((l) => !l.hidden).length, 0, "the pair's box overlaps the frame: none");
    await goTo(page, "inset", "corner");
    await check(["W1", "S2"], undefined, [SIZE[0] - MARGIN - IW, SIZE[1] - MARGIN - IH, SIZE[0] - MARGIN, SIZE[1] - MARGIN], "corner");
    // the map flies: the box is seen through the map's new view
    await goTo(page, "inset", "main");
    await check(["W1", "S2"], view(BASE, [REGIONS.get("N1")], SIZE), [SIZE[0] - MARGIN - IW, SIZE[1] - MARGIN - IH, SIZE[0] - MARGIN, SIZE[1] - MARGIN], "main");
    assert.deepEqual(ctx.errors, []);
  });
});

test("inset: the stage sits at its corner, 36% wide, and goes with the inset", async () => {
  await withPage({ root, url: pages.url("inset", "step=home") }, async (page, ctx) => {
    const style = async () => (await insetOf(page)).stage?.style;
    assert.deepEqual((({ stage, group, scale, canvases }) => [stage, group, scale, canvases])(await insetOf(page)), [null, null, null, ["main:base", "main:raster:density", "main:borders"]], "no inset, none of its markup");
    await goTo(page, "inset", "inset");
    assert.equal(await style(), `left: ${SIZE[0] - MARGIN - IW}px; top: ${MARGIN}px; width: ${IW}px; height: ${IH}px;`);
    await goTo(page, "inset", "corner");
    assert.equal(await style(), `left: ${SIZE[0] - MARGIN - IW}px; top: ${SIZE[1] - MARGIN - IH}px; width: ${IW}px; height: ${IH}px;`);
    await goTo(page, "inset", "off");
    assert.deepEqual((({ stage, group, scale, canvases }) => [stage, group, scale, canvases])(await insetOf(page)), [null, null, null, ["main:base", "main:raster:density", "main:borders"]], "and none again");
    assert.deepEqual(ctx.errors, []);
  });
});

test("inset: scale bar label is a round km length", async () => {
  await withPage({ root, url: pages.url("inset", "step=inset") }, async (page, ctx) => {
    const west = view(BASE, [REGIONS.get("W1")], SIZE);
    const s = IW / SIZE[0];
    const check = async (fitted) => {
      const { scale } = await insetOf(page);
      assert.match(scale.label, /^[125](0|,000)* km$/, `the label ${scale.label} is 1, 2 or 5 x 10^n km`);
      const km = Number(scale.label.replace(/[ ,]|km/g, ""));
      assert.ok(/^[125]0*$/.test(String(km)), `${km} is 1, 2 or 5 followed by zeros`);
      // the bar is that long at its own place: one px along its row is this many km
      const [x1, y1, x2, y2] = scale.bar;
      assert.equal(y1, y2);
      assert.deepEqual([x1, y1], [16, IH - 16], "the bar starts 16 px in from the inset's bottom-left corner");
      const lonLat = (x) => BASE.invert([(x - fitted.x * s) / (fitted.k * s), (y1 - fitted.y * s) / (fitted.k * s)]);
      const kmPerPx = 6371 * d3.geoDistance(lonLat(x1), lonLat(x1 + 1));
      assert.ok(Math.abs((x2 - x1) * kmPerPx - km) <= 0.01 * km + kmPerPx, `the bar of ${x2 - x1} px is ${((x2 - x1) * kmPerPx).toFixed(1)} km, labelled ${km}`);
      // the longest 1, 2 or 5 x 10^n km that fits in 40% of the inset's width: at least 2/5 of it, at most all of it
      assert.ok(x2 - x1 <= 0.4 * IW + 0.5 && x2 - x1 >= 0.4 * 0.4 * IW - 0.5, `${x2 - x1} px is within 40% of the inset's width, and above 40% of that`);
      return km;
    };
    const near1 = await check(west);
    await goTo(page, "inset", "pair");
    const pair = view(BASE, ["W1", "S2"].map((id) => REGIONS.get(id)), SIZE);
    const wide = await check(pair);
    assert.ok(wide >= near1, "the wider view's bar is no shorter");
    await goTo(page, "inset", "corner");
    assert.equal((await insetOf(page)).scale, null, "scale: false has no bar");
    assert.deepEqual(ctx.errors, []);
  });
});

test("inset: names are in the inset where it shows them, and not under it on the map", async () => {
  await withPage({ root, url: pages.url("inset", "step=named") }, async (page, ctx) => {
    const centroid = d3.geoPath(BASE);
    const pair = view(BASE, ["W1", "S2"].map((id) => REGIONS.get(id)), SIZE);
    const s = IW / SIZE[0];
    const frame = [SIZE[0] - MARGIN - IW, MARGIN, SIZE[0] - MARGIN, MARGIN + IH];
    const inside = ([x, y], [x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    const names = ["N1", "W1", "S2"];
    const onMap = names.filter((id) => !inside(applyView({ k: 1, x: 0, y: 0 }, centroid.centroid(REGIONS.get(id))), frame));
    const inInset = names.filter((id) => inside(applyView({ k: pair.k * s, x: pair.x * s, y: pair.y * s }, centroid.centroid(REGIONS.get(id))), [0, 0, IW, IH]));
    assert.ok(onMap.length > 0 && inInset.length > 0, "the slide has names on both");
    const found = await page.evaluate(() => {
      const el = document.querySelector('[data-el="map"]');
      const ids = (root) => [...root.querySelectorAll("text.sd-map-label")].map((t) => t.dataset.region);
      return { map: ids(el.querySelector(":scope > svg.sd-map-labels")), inset: ids(el.querySelector(".sd-map-inset-stage")) };
    });
    assert.deepEqual(found, { map: onMap, inset: inInset });
    assert.deepEqual(ctx.errors, []);
  });
});

test("inset: fade in and out", async () => {
  await withPage({ root, url: pages.url("inset", "step=home&motion=full") }, async (page, ctx) => {
    const probe = new Function("el", `
      const stage = el.querySelector(".sd-map-inset-stage");
      const frame = el.querySelector("g.sd-map-inset");
      return { opacity: stage ? Number(getComputedStyle(stage).opacity) : 0, frame: frame ? Number(frame.getAttribute("opacity") ?? 1) : 0, style: stage?.getAttribute("style") ?? "" };`);
    const shows = await sampleFrames(page, "inset", "inset", "map", probe);
    assert.equal(shows.frames[0].opacity, 0, "no inset to start");
    assert.equal(shows.end.opacity, 1, "and a whole one at the end");
    assert.ok(shows.frames.filter((f) => f.opacity > 0 && f.opacity < 1).length >= 2, `passing through partial opacity (${shows.frames.map((f) => f.opacity.toFixed(2)).join(" ")})`);
    assert.ok(shows.frames.every((f, i) => i === 0 || f.opacity >= shows.frames[i - 1].opacity), "only rising");
    assert.ok(shows.frames.filter((f) => f.frame > 0 && f.frame < 1).length >= 2, "the box and leaders fade with it");
    assert.ok(!shows.end.style.includes("opacity") && shows.end.frame === 1, "no opacity is left at rest");

    await ctx.open(pages.url("inset", "step=main&motion=full"));
    const hides = await sampleFrames(page, "inset", "off", "map", probe);
    assert.equal(hides.frames[0].opacity, 1, "a whole inset to start");
    assert.equal(hides.end.opacity, 0, "and none at the end");
    assert.ok(hides.frames.filter((f) => f.opacity > 0 && f.opacity < 1).length >= 2, "passing through partial opacity");
    assert.ok(hides.frames.every((f, i) => i === 0 || f.opacity <= hides.frames[i - 1].opacity), "only falling");
    assert.deepEqual(ctx.errors, []);
  });
});

test("inset: a view change flies the inset only", async () => {
  await withPage({ root, url: pages.url("inset", "step=inset&motion=full") }, async (page, ctx) => {
    const duration = parseFloat(await page.evaluate(() => getComputedStyle(document.querySelector(".sd-canvas")).getPropertyValue("--sd-duration")));
    const probe = new Function("el", `
      const at = (layer) => el.querySelector('canvas[data-layer="' + layer + '"]');
      const main = ["main:base", "main:raster:density", "main:borders"].map((layer) => at(layer).dataset.view + "|" + at(layer).dataset.sig).join(" ");
      return { main, k: Number(at("inset:base").dataset.view.split(",")[0]), box: el.querySelector("rect.sd-map-inset-box").getAttribute("x") };`);
    const before = await lookupsOf(page);
    const { frames, end, settledMs } = await sampleFrames(page, "inset", "pair", "map", probe);
    const [west, pair] = [["W1"], ["W1", "S2"]].map((ids) => view(BASE, ids.map((id) => REGIONS.get(id)), SIZE));
    assert.ok(frames.every((f) => f.main === frames[0].main) && end.main === frames[0].main, "the main map's canvases keep their view and signature in every frame");
    assert.ok(Math.abs(frames[0].k - west.k) < 0.001, `the inset starts at Westmere (${frames[0].k})`);
    assert.ok(Math.abs(end.k - pair.k) < 0.001, `and ends at the pair (${end.k})`);
    const [lo, hi] = [Math.min(west.k, pair.k), Math.max(west.k, pair.k)];
    assert.ok(frames.filter((f) => f.k > lo + 1e-3 && f.k < hi - 1e-3).length >= 2, `frames at a scale strictly between ${lo.toFixed(3)} and ${hi.toFixed(3)}`);
    const arrived = frames.find((f) => Math.abs(f.k - pair.k) < 0.001)?.ms ?? end.ms;
    assert.ok(arrived >= 0.8 * 2 * duration, `it takes about ${2 * duration} ms (arrived at ${arrived.toFixed(0)} ms)`);
    assert.ok(settledMs <= 2 * 2 * duration + 1000, `within a generous bound (${settledMs.toFixed(0)} ms)`);
    assert.ok(new Set(frames.map((f) => f.box)).size > 3, "the box moves with the inset");
    assert.equal(await lookupsOf(page), before, "no table was built for a view in between");
    assert.deepEqual(ctx.errors, []);
  });
});

test("inset: lookups for its views are ready after mount", async () => {
  await withPage({ root, url: pages.url("inset", "step=home&motion=full") }, async (page, ctx) => {
    // the slide's views: home and North for the map, North and the pair for the inset (its own size)
    const ready = await lookupsOf(page);
    assert.ok(ready >= 4, `${ready} lookup tables after mount, one per view and size at least (4)`);
    for (const step of INSET_STEPS.slice(1)) await goTo(page, "inset", step);
    assert.equal(await lookupsOf(page), ready, "none was built while the steps played");
    assert.deepEqual(ctx.errors, []);
  });
});

// --- time-lapse runs --------------------------------------------------------------------------------------------

/** The steps of the time-lapse slide up to the long run (12.6 s), which has its own test. */
const LAPSE_STEPS = ["first", "last", "back", "north", "long"];
/** The people of each frame of the 12-frame file, in list order, read in Node. */
const YEARS = JSON.parse(readFileSync(`${root}${DECK}data/years.json`, "utf8")).frames.map(({ label, numbers }) => ({ label, people: numbers.people }));
const people = (text) => Number(text.replace(/,/g, ""));
/** A `sampleFrames` probe of the frame and view the land's canvas says it shows, and the panel's year and first number. */
const lapseProbe = new Function("el", `
  const base = el.querySelector('canvas[data-layer="main:base"]');
  const panel = el.querySelector(".sd-map-panel");
  return { frame: base.dataset.frame, view: base.dataset.view, label: panel?.querySelector(".sd-map-panel-frame")?.textContent ?? null,
           value: panel?.querySelector(".sd-map-panel-value")?.textContent ?? null };`);
/** The panel as the page shows it: its corner, its year and its numbers. */
const panelOf = (page) =>
  page.evaluate(() => {
    const panel = document.querySelector('[data-el="map"] .sd-map-panel');
    return panel && {
      at: panel.dataset.at,
      label: panel.querySelector(".sd-map-panel-frame").textContent,
      numbers: [...panel.querySelectorAll(".sd-map-panel-number")].map((row) => ({ key: row.dataset.key, name: row.querySelector(".sd-map-panel-name").textContent, value: row.querySelector(".sd-map-panel-value").textContent })),
    };
  });
const framesShown = (page) => page.evaluate(() => [...new Set([...document.querySelectorAll('[data-el="map"] canvas')].map((c) => c.dataset.frame))]);
/** The element's markup and canvas pixels after loading the slide at `step` (no motion). */
const jumpTo = async (ctx, page, step) => {
  await ctx.open(pages.url("timelapse", `step=${step}`));
  return { html: await elementHtml(page, "map"), pixels: await canvasPixels(page, "map") };
};
/** Labels in list order: each sample's place in the 12-frame list. */
const yearIndex = (label) => YEARS.findIndex((f) => f.label === label);

test("timelapse: played equals jumped, pixels too", async () => {
  await withPage({ root, url: pages.url("timelapse", "step=first") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "timelapse", steps: LAPSE_STEPS, id: "map" });
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "timelapse", steps: LAPSE_STEPS, id: "map" });
    // at rest: every canvas says the frame, and the panel at the top-left shows its year and its people
    await ctx.open(pages.url("timelapse", "step=back"));
    assert.deepEqual(await framesShown(page), ["2015"]);
    assert.deepEqual(await panelOf(page), { at: "top-left", label: "2015", numbers: [{ key: "people", name: "People", value: "56,993,430" }] });
    await ctx.open(pages.url("timelapse", "step=first"));
    assert.deepEqual(await framesShown(page), ["2010"], "without `frame`, the first frame");
    assert.deepEqual(await errorsOf(page), []);
  });
});

test("timelapse: a run passes intermediate frames", async () => {
  await withPage({ root, url: pages.url("timelapse", "step=first&motion=full") }, async (page, ctx) => {
    const { frames, end } = await sampleFrames(page, "timelapse", "last", "map", lapseProbe);
    const seen = [...new Set(frames.map((f) => f.frame))];
    assert.ok(seen.length >= 3, `the canvases pass ${seen.length} frames (${seen.join(" ")})`);
    assert.ok(seen.some((label) => label !== "2010" && label !== "2021"), "some of them between the two ends");
    assert.ok(frames.every((f, i) => i === 0 || yearIndex(f.frame) >= yearIndex(frames[i - 1].frame)), "in list order");
    assert.ok(frames.every((f) => f.label === f.frame), "the panel's year is the frame the canvases say, in every frame");
    assert.equal(frames[0].frame, "2010");
    assert.equal(end.frame, "2021");
    assert.deepEqual(ctx.errors, []);
  });
});

test("timelapse: numbers count between frames", async () => {
  await withPage({ root, url: pages.url("timelapse", "step=first&motion=full") }, async (page, ctx) => {
    const { frames, end } = await sampleFrames(page, "timelapse", "last", "map", lapseProbe);
    const values = frames.map((f) => people(f.value));
    const exact = new Set(YEARS.map((f) => f.people));
    const between = values.filter((v) => !exact.has(v) && YEARS.some((f, i) => i > 0 && v > YEARS[i - 1].people && v < f.people));
    assert.ok(between.length >= 2, `${between.length} sampled values strictly between two frames' values (${frames.map((f) => f.value).join(" | ")})`);
    assert.ok(values.every((v, i) => i === 0 || v >= values[i - 1]), "only rising, as the frames' values do");
    assert.equal(people(end.value), YEARS.at(-1).people, "and the last frame's value at the end");
    assert.deepEqual(ctx.errors, []);
  });
});

test("timelapse: frame earlier in the list runs backward at the new pace", async () => {
  await withPage({ root, url: pages.url("timelapse", "step=last&motion=full") }, async (page, ctx) => {
    const { frames, end, settledMs } = await sampleFrames(page, "timelapse", "back", "map", lapseProbe);
    const seen = [...new Set(frames.map((f) => f.frame))];
    assert.ok(seen.length >= 3, `the canvases pass ${seen.length} frames (${seen.join(" ")})`);
    assert.ok(frames.every((f, i) => i === 0 || yearIndex(f.frame) <= yearIndex(frames[i - 1].frame)), `backward in list order (${seen.join(" ")})`);
    assert.equal(frames[0].frame, "2021");
    assert.equal(end.frame, "2015");
    // 2021 back to 2015 is 6 moves at the step's pace of 200 ms
    assert.ok(settledMs >= 6 * 200 * 0.9, `about ${6 * 200} ms (settled at ${settledMs.toFixed(0)} ms)`);
    assert.ok(settledMs <= 6 * 200 + 3000, `within a generous bound (${settledMs.toFixed(0)} ms)`);
    assert.deepEqual(ctx.errors, []);
  });
});

test("timelapse: a flight then the run, in that order", async () => {
  await withPage({ root, url: pages.url("timelapse", "step=back&motion=full") }, async (page, ctx) => {
    const { frames, end } = await sampleFrames(page, "timelapse", "north", "map", lapseProbe);
    const north = view(BASE, [REGIONS.get("N1")], SIZE);
    const at = [north.k, north.x, north.y].map((v) => v.toFixed(3)).join(",");
    assert.equal(end.view, at, "the map ends at North");
    assert.equal(end.frame, "2020", "on the step's frame");
    const arrived = frames.findIndex((f) => f.view === at);
    const runs = frames.findIndex((f) => f.frame !== "2015");
    assert.ok(arrived > 0 && runs > 0, `the flight (${arrived}) and the run (${runs}) both play`);
    assert.ok(frames.slice(1, arrived).some((f) => f.view !== frames[0].view), "the map flies");
    assert.ok(runs >= arrived, `no frame changes before the flight has landed (frame ${runs}, landed ${arrived})`);
    assert.ok(frames.slice(arrived).every((f) => f.view === at), "and the run plays at the end view");
    assert.ok(new Set(frames.slice(arrived).map((f) => f.frame)).size >= 3, "passing the frames in between");
    assert.deepEqual(ctx.errors, []);
  });
});

test("timelapse: 18 frame moves at 700 ms settle past 10 s", async () => {
  await withPage({ root, url: pages.url("timelapse", "step=long") }, async (page, ctx) => {
    const jumped = await jumpTo(ctx, page, "longrun");
    await ctx.open(pages.url("timelapse", "step=long&motion=full"));
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true, "the played run really animates");
    const ms = await page.evaluate(async () => {
      const t0 = performance.now();
      await window.STEPDECK.goTo("timelapse", "longrun");
      await window.STEPDECK.settled();
      return performance.now() - t0;
    });
    // 2000 to 2018 is 18 moves at the default 700 ms: 12.6 s, past the 10 s an update has without `info.expect`
    assert.ok(ms >= 12000, `about 12.6 s (${ms.toFixed(0)} ms)`);
    assert.ok(ms <= 12600 + 7000, `within a generous bound (${ms.toFixed(0)} ms)`);
    assert.deepEqual(await errorsOf(page), [], "the watchdog let the run finish");
    assert.deepEqual(await framesShown(page), ["2018"]);
    assert.equal(await elementHtml(page, "map"), jumped.html, "the run ends where a jump does");
    assert.deepEqual(await canvasPixels(page, "map"), jumped.pixels, "pixels too");
    assert.deepEqual(ctx.errors, []);
  });
});

test("timelapse: 29 frame moves are refused", async () => {
  await withPage({ root, url: broken.url("long", "step=first&motion=full") }, async (page, ctx) => {
    assert.deepEqual(await errorsOf(page), []);
    await goTo(page, "long", "last");
    assert.deepEqual(await errorsOf(page), ["long/map: a run of 20.3 s is longer than 20 s; split it across steps"]);
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("timelapse: leaving the slide mid-run stops it", async () => {
  await withPage({ root, url: pages.url("timelapse", "step=long&motion=full") }, async (page, ctx) => {
    const left = await page.evaluate(async () => {
      const t0 = performance.now();
      window.STEPDECK.goTo("timelapse", "longrun");
      await new Promise((r) => setTimeout(r, 1000));
      const frame = document.querySelector('[data-el="map"] canvas[data-layer="main:base"]').dataset.frame;
      await window.STEPDECK.goTo("areas", "base");
      await window.STEPDECK.settled();
      return { frame, ms: performance.now() - t0 };
    });
    assert.ok(left.frame !== "2000" && left.frame !== "2018", `the run is under way a second in (${left.frame})`);
    assert.ok(left.ms < 6000, `leaving resolves long before the 12.6 s run would end (${left.ms.toFixed(0)} ms)`);
    assert.deepEqual(await errorsOf(page), []);
    await goTo(page, "timelapse", "longrun");
    assert.deepEqual(await framesShown(page), ["2018"], "coming back shows the step's frame");
    assert.equal((await panelOf(page)).label, "2018");
    assert.deepEqual(await errorsOf(page), []);
    assert.deepEqual(ctx.errors, []);
  });
});

test("timelapse: click mid-run, the next step applies", async () => {
  await withPage({ root, url: pages.url("timelapse", "step=first") }, async (page, ctx) => {
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "timelapse", from: "first", via: "last", to: "back", id: "map", keep: LEGEND_COLOURS });
    assert.deepEqual(await framesShown(page), ["2015"]);
    assert.deepEqual(await errorsOf(page), []);
  });
});

test("timelapse: hiding mid-run leaves it at its end", async () => {
  await withPage({ root, url: pages.url("timelapse", "step=long") }, async (page, ctx) => {
    const jumped = await jumpTo(ctx, page, "longrun");
    await ctx.open(pages.url("timelapse", "step=long&motion=full"));
    // No `return`: evaluate would otherwise wait for the whole run.
    await page.evaluate(() => { window.STEPDECK.goTo("timelapse", "longrun"); });
    await page.waitForTimeout(1000);
    assert.notEqual(await elementHtml(page, "map"), jumped.html, "the run is under way when the page is hidden");
    const arrived = await page.evaluate(async (jumped) => {
      const map = () => document.querySelector('[data-el="map"]').outerHTML;
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      const t0 = performance.now();
      document.dispatchEvent(new Event("visibilitychange"));
      while (map() !== jumped && performance.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 10));
      return map() === jumped ? performance.now() - t0 : null;
    }, jumped.html);
    assert.notEqual(arrived, null, "within 5 s of the event (the run has 11.6 s left) the map shows the run's end");
    await settled(page);
    assert.equal(await elementHtml(page, "map"), jumped.html, "and stays there");
    assert.deepEqual(await canvasPixels(page, "map"), jumped.pixels, "pixels too");
    assert.deepEqual(await errorsOf(page), [], "the element is not failed");
    assert.deepEqual(ctx.errors, []);
  });
});

test("timelapse: the no-data row reflects the frames the steps show", async () => {
  await withPage({ root, url: pages.url("gaps", "step=whole") }, async (page, ctx) => {
    for (const step of ["whole", "named"]) {
      await goTo(page, "gaps", step);
      const [row] = await legendOf(page);
      assert.equal(row.title, "People per km²");
      assert.ok(row.items.every((item) => !item.nodata), `${step}: no "no data" swatch, though a frame no step shows lacks data`);
    }
    assert.deepEqual(await errorsOf(page), []);
    assert.deepEqual(ctx.errors, []);
  });
});

test("timelapse: in a map mounted by a component, the no-data row follows the frame each step shows", async () => {
  await withPage({ root, url: pages.url("child", "step=whole") }, async (page, ctx) => {
    const noData = async () => (await legendOf(page))[0].items.some((item) => item.nodata);
    assert.equal(await noData(), false, "the whole frame: no row");
    await goTo(page, "child", "holed");
    assert.equal(await noData(), true, "the holed frame: the row");
    await goTo(page, "child", "again");
    assert.equal(await noData(), false, "the whole frame again: no row");
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "child", steps: ["whole", "holed", "again"], id: "map" });
    assert.deepEqual(await errorsOf(page), []);
    assert.deepEqual(ctx.errors, []);
  });
});

test("timelapse: frames of another size error", async () => {
  await withPage({ root, url: broken.url("mismatch", "") }, async (page, ctx) => {
    assert.deepEqual(await errorsOf(page), ["mismatch/map: data/mismatch/2001.png: 8×7 does not match the first frame (8×6)"]);
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("timelapse: the inset shows the frame of the moment, and the panel keeps out of its corner", async () => {
  await withPage({ root, url: pages.url("timelapse", "step=corner") }, async (page, ctx) => {
    const jumped = await jumpTo(ctx, page, "corner");
    assert.equal((await panelOf(page)).at, "top-right", "the inset is at the top-left, so the panel is at the top-right");
    const insetFrames = () => page.evaluate(() => [...new Set([...document.querySelectorAll('[data-el="map"] .sd-map-inset-stage canvas')].map((c) => c.dataset.frame))]);
    assert.deepEqual(await insetFrames(), ["2010"]);
    // played: the inset fades in at 2018, then the map and the inset run back to 2010 together
    await ctx.open(pages.url("timelapse", "step=longrun&motion=full"));
    const probe = new Function("el", `
      const inset = el.querySelector('canvas[data-layer="inset:base"]');
      return { frame: el.querySelector('canvas[data-layer="main:base"]').dataset.frame, inset: inset ? inset.dataset.frame : null };`);
    const { frames, end } = await sampleFrames(page, "timelapse", "corner", "map", probe);
    const seen = [...new Set(frames.filter((f) => f.inset !== null).map((f) => f.inset))];
    assert.ok(seen.length >= 3, `the inset passes ${seen.length} frames (${seen.join(" ")})`);
    assert.ok(frames.every((f) => f.inset === null || f.inset === f.frame), "the inset shows the map's frame in every frame");
    assert.equal(end.inset, "2010");
    assert.equal(await elementHtml(page, "map"), jumped.html, "played equals jumped");
    assert.deepEqual(await canvasPixels(page, "map"), jumped.pixels, "pixels too");
    assert.deepEqual(await errorsOf(page), []);
    assert.deepEqual(ctx.errors, []);
  });
});

test("timelapse: numbers keys, formats and paces the map cannot use error", async () => {
  await withPage({ root, url: broken.url("numbers", "") }, async (page, ctx) => {
    assert.deepEqual(await errorsOf(page), ["numbers/map: `numbers` key 'people' is in time-lapse layers 'north' and 'south'"]);
    await ctx.open(broken.url("numbers-none", ""));
    assert.deepEqual(await errorsOf(page), ["numbers-none/map: `numbers` key 'births' is in no time-lapse layer (keys: people)"]);
    await ctx.open(broken.url("numbers-format", ""));
    assert.deepEqual(await errorsOf(page), ['numbers-format/map: `numbers` key \'people\' needs a `format` (a d3-format string such as ",.0f")']);
    await ctx.open(broken.url("pace", ""));
    assert.deepEqual(await errorsOf(page), ["pace/map: `pace` must be 100 to 2000 ms a frame"]);
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("timelapse: frames slow to arrive hold the run, never fail it", async () => {
  await withPage({ root, url: pages.url("timelapse", "step=last") }, async (page, ctx) => {
    const jumped = await jumpTo(ctx, page, "last");
    await ctx.open(pages.url("timelapse", "step=first&motion=full"));
    // Every frame image is 600 ms late from here on, longer than the four frames (400 ms) a run of 100 ms a frame decodes ahead.
    const DELAY = 600;
    let delayed = 0;
    await page.route("**/data/years/*.png", async (route) => {
      delayed += 1;
      await new Promise((r) => setTimeout(r, DELAY));
      await route.continue();
    });
    const { frames, end, settledMs } = await sampleFrames(page, "timelapse", "last", "map", lapseProbe);
    assert.ok(delayed >= 11, `the run's frames came late (${delayed} images delayed)`);
    assert.ok(frames.every((f, i) => i === 0 || yearIndex(f.frame) >= yearIndex(frames[i - 1].frame)), "the run still goes in list order");
    // a frame whose next has not arrived stays on screen: some frame after the first is shown well past its 100 ms
    const spans = new Map();
    for (const f of frames.filter((f) => f.frame !== "2010")) spans.set(f.frame, [spans.get(f.frame)?.[0] ?? f.ms, f.ms]);
    const held = Math.max(...[...spans.values()].map(([a, b]) => b - a));
    assert.ok(held >= 250, `the run held a frame while the next was on its way (${held.toFixed(0)} ms)`);
    assert.equal(end.frame, "2021");
    assert.ok(settledMs >= DELAY + 11 * 100 * 0.9, `the run waits for its first frames, then plays (${settledMs.toFixed(0)} ms)`);
    assert.deepEqual(await errorsOf(page), [], "nothing failed");
    assert.equal(await elementHtml(page, "map"), jumped.html, "and it ends where a jump does");
    assert.deepEqual(await canvasPixels(page, "map"), jumped.pixels, "pixels too");
    assert.deepEqual(ctx.errors, []);
  });
});
