// The built-in `map` in Chrome: boundaries, choropleth areas, labels, highlight and the legend, on the map fixture deck
// (test/fixtures/decks/map) and its broken twin. Played equals jumped is checked on markup and canvas pixels; pixel
// positions come from the same projection the component fits, computed here in Node. Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/map.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { d3 } from "../../engine/core/d3.js";
import { boundaries, projection } from "../../engine/core/map.js";
import { deckPages, goTo, canvasPixels, tokenRgb, sampleFrames, colorMove, expectJumpEqualsPlayed, expectBackwardEqualsJump, expectInterruptEqualsJump } from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const DECK = "test/fixtures/decks/map/";
const pages = deckPages(DECK);
const broken = deckPages("test/fixtures/decks/map-broken/");
const STEPS = { areas: ["base", "rates", "focus", "named"], legends: ["steps", "classes", "ramp"], projection: ["equal", "conic"] };
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
    assert.ok(move.arrived <= r.settledMs - 0.4 * fast, `on the fast clock, before the step's own duration ends (${move.arrived.toFixed(0)} of ${r.settledMs.toFixed(0)} ms)`);
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
