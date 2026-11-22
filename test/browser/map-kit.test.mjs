// The painters, the raster loader, the inset frame and the scale bar of `ctx.map` in Chrome. The painters are exercised
// through a deck component that uses nothing else (test/fixtures/decks/map-kit), the loader and the SVG pieces directly. Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/map-kit.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { d3 } from "../../engine/core/d3.js";
import { deckPages, goTo, canvasPixels, tokenRgb, paletteRgb, expectJumpEqualsPlayed, expectBackwardEqualsJump } from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const pages = deckPages("test/fixtures/decks/map-kit/");
const brokenPages = deckPages("test/fixtures/decks/map-kit-broken/");
const THEME = "academic-light";
/** The element is 1400 x 760 canvas pixels, and the one square sits at its middle. */
const [W, H] = [1400, 760];
const [CX, CY] = [W / 2, H / 2];

/** The rgba of the pixels in a box of a layer's canvas, row by row: [[r, g, b, a], ...]. */
const readPixels = (page, layer, x, y, w, h) =>
  page.evaluate(([layer, x, y, w, h]) => {
    const canvas = document.querySelector(`[data-el="map"] canvas[data-layer="${layer}"]`);
    const data = canvas.getContext("2d").getImageData(x, y, w, h).data;
    return Array.from({ length: w * h }, (_, i) => [...data.subarray(i * 4, i * 4 + 4)]);
  }, [layer, x, y, w, h]);
const rgb = ([r, g, b]) => `rgb(${r}, ${g}, ${b})`;
const parse = (css) => css.match(/\d+/g).map(Number);
const signatureOf = (page, layer) => page.evaluate((layer) => document.querySelector(`[data-el="map"] canvas[data-layer="${layer}"]`).getAttribute("data-sig"), layer);

/** Opens a slide at a step and waits for it to settle. */
async function at(ctx, slide, step) {
  await ctx.open(pages.url(slide, `step=${step}`));
}

/** Runs `fn(paint, d3)` in the page, where `paint` is the module of the painters. */
const inPage = (page, fn, arg) =>
  page.evaluate(`(async () => {
    const paint = await import(new URL("map-paint.js", document.baseURI).href);
    const { d3 } = await import(new URL("d3.js", document.baseURI).href);
    return (${fn})(paint, d3, ${JSON.stringify(arg ?? null)});
  })()`);

/**
 * Runs `fn(M, ctx, arg)` in the page, where `M` is the module of `core/map.js` and `ctx` is what a component reads of its
 * own: `ctx.data` and `ctx.assetUrl` of `deck`, a fixture deck (the map-kit deck by default; the engine's own data loader,
 * so the paths are the deck's).
 */
const withKit = (page, fn, arg, deck = "map-kit") =>
  page.evaluate(`(async () => {
    const M = await import(new URL("map.js", document.baseURI).href);
    const { createDataLoader } = await import(new URL("data.js", document.baseURI).href);
    const root = new URL("../../test/fixtures/decks/${deck}", document.baseURI).href;
    const data = createDataLoader({ root, read: (url) => fetch(url) });
    return (${fn})(M, { data, assetUrl: data.url }, ${JSON.stringify(arg ?? null)});
  })()`);

test("paintAreas: same scene same signature, any change in fills changes it", async () => {
  await withPage({ root, url: pages.url("kit", "step=a") }, async (page, ctx) => {
    const first = await signatureOf(page, "areas");
    assert.match(first, /^[0-9a-f]{8}$/);
    const pixels = await canvasPixels(page, "map");
    await at(ctx, "kit", "a");
    assert.equal(await signatureOf(page, "areas"), first, "the same step again, the same signature");
    assert.deepEqual(await canvasPixels(page, "map"), pixels, "and the same pixels");

    const seen = new Set([first]);
    for (const step of ["b", "c", "d", "e"]) {
      await at(ctx, "kit", step);
      seen.add(await signatureOf(page, "areas"));
    }
    assert.equal(seen.size, 5, "shifted fills, a hatched region, a dot and a zoom each change the signature");
    assert.deepEqual(ctx.errors, []);
  });
});

test("paintAreas: a null fill is hatched", async () => {
  await withPage({ root, url: pages.url("square", "step=hatch") }, async (page, ctx) => {
    const [dim, surface] = [await tokenRgb(page, "--sd-color-dim"), await tokenRgb(page, "--sd-color-surface")];
    const seen = new Set((await readPixels(page, "areas", CX - 3, CY - 3, 6, 6)).map(rgb));
    assert.ok(seen.has(dim), `a stripe pixel in the dim colour (${[...seen].join(" | ")})`);
    assert.ok(seen.has(surface), `a pixel between stripes in the surface colour (${[...seen].join(" | ")})`);

    // The stripes are 6 px apart across, so 6 x sqrt(2) along a row.
    const wide = await readPixels(page, "areas", CX - 60, CY, 120, 1);
    const dark = wide.map(([r, g, b]) => (Math.abs(r - parse(dim)[0]) + Math.abs(g - parse(dim)[1]) + Math.abs(b - parse(dim)[2]) < 30 ? 1 : 0));
    const starts = dark.flatMap((v, i) => (v && !dark[i - 1] ? [i] : []));
    const gaps = starts.slice(1).map((s, i) => s - starts[i]);
    for (const gap of gaps) assert.ok(Math.abs(gap - 6 * Math.SQRT2) <= 1.1, `stripes ${gap} px apart along a row (6 px across, at 45 degrees)`);
    assert.ok(gaps.length >= 8, "many stripes in 120 px");
    assert.deepEqual(ctx.errors, []);
  });
});

test("paintAreas: dot items are 5 px circles", async () => {
  await withPage({ root, url: pages.url("square", "step=dot") }, async (page, ctx) => {
    const fill = paletteRgb(THEME, 0);
    const pixel = async (dx, dy) => (await readPixels(page, "areas", CX + dx, CY + dy, 1, 1))[0];
    assert.equal(rgb(await pixel(0, 0)), fill, "the centroid is filled");
    assert.equal(rgb(await pixel(3, 0)), fill, "and so is 3 px in");
    assert.equal((await pixel(8, 0))[3], 0, "8 px away is background");
    assert.equal((await pixel(0, -8))[3], 0, "above too");
    assert.equal((await pixel(60, 0))[3], 0, "the region itself is not painted");
    const outline = await pixel(5, 0);
    assert.ok(outline[3] > 0 && rgb(outline) !== fill, "the 1.5 px outline sits on the circle's edge");
    assert.deepEqual(ctx.errors, []);
  });
});

/** The ink on a canvas pixel, 0 to 1, with the canvas laid over the background: how much of the ink colour the pixel holds. */
const inkOf = ([r, , , a], background, ink) => {
  const over = (a / 255) * r + (1 - a / 255) * background;
  return (background - over) / (background - ink);
};

test("paintAreas: the view transform moves pixels, widths stay", async () => {
  await withPage({ root, url: pages.url("square", "step=a") }, async (page, ctx) => {
    const background = parse(await tokenRgb(page, "--sd-color-background"))[0];
    const ink = parse(await tokenRgb(page, "--sd-color-ink"))[0];
    /** The ink across `n` pixels of a row or a column starting at (x, y). */
    const run = async (x, y, n, vertical) =>
      (await readPixels(page, "areas", x, y, vertical ? 1 : n, vertical ? n : 1)).map((p) => inkOf(p, background, ink));
    const total = (xs) => xs.reduce((s, v) => s + v, 0);
    /** The left edge of the square: where, along the middle row, the ink peaks, and how much ink is within 6 px of it. */
    const leftEdge = async () => {
      const row = await run(0, CY, W, false);
      const peak = row.indexOf(Math.max(...row));
      return { at: peak, width: total(row.slice(peak - 6, peak + 7)) };
    };

    const one = await leftEdge();
    assert.ok(Math.abs(one.width - 1) < 0.15, `a 1 px stroke holds 1 px of ink at k = 1 (${one.width})`);
    const topAt = (await run(CX, 0, CY, true)).reduce((best, v, i, all) => (v > all[best] ? i : best), 0);
    assert.ok(topAt > 20 && topAt < CY, `the top edge is on screen (${topAt})`);

    await goTo(page, "square", "zoom");
    const three = await leftEdge();
    assert.ok(Math.abs(three.at - one.at) <= 1, `the zoom keeps the point it is about in place (${one.at} to ${three.at})`);
    assert.ok(Math.abs(three.width - 1) < 0.15, `and the stroke is still 1 px at k = 3 (${three.width})`);
    const old = total((await run(CX, topAt - 6, 13, true)));
    assert.ok(old < 0.05, `the top edge moved away from where it was (${old} ink there)`);
    assert.deepEqual(ctx.errors, []);
  });
});

test("paintBorders: strokes only, keeps its width under zoom, and rings a dot where paintAreas draws it", async () => {
  await withPage({ root, url: pages.url("kit", "step=a") }, async (page, ctx) => {
    // A 200 x 200 layer with a 400 x 400 backing store (2x); the square at base px (10, 10)-(60, 60), centroid (35, 35).
    const got = await inPage(page, (paint) => {
      const layer = () => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 400;
        canvas.style.width = canvas.style.height = "200px";
        return canvas;
      };
      const res = { path: () => new Path2D("M10,10H60V60H10Z"), centroid: () => [35, 35] };
      const blue = "rgb(0, 0, 200)";
      const alpha = (canvas) => {
        const data = canvas.getContext("2d").getImageData(0, 0, 400, 400).data;
        return Array.from({ length: 400 * 400 }, (_, i) => data[i * 4 + 3]);
      };
      const row = (canvas, y, from, to) => [...canvas.getContext("2d").getImageData(from, y, to - from, 1).data].filter((_, i) => i % 4 === 3);
      const outline = (k) => {
        const canvas = layer();
        const sig = paint.paintBorders(canvas, { source: "s", view: { k, x: 0, y: 0 }, items: [{ id: "a", stroke: blue, width: 2, alpha: 1, dot: false }] }, res);
        return { canvas, sig };
      };
      // Stroke only: at k = 1 the outline runs along CSS x = 10 (device 18 to 22); the inside (CSS 35, 35) stays clear.
      const one = outline(1);
      const four = outline(4);
      const inside = [...one.canvas.getContext("2d").getImageData(70, 70, 1, 1).data];
      const opaque = (a) => a.filter((v) => v === 255).length;
      // The same 2 px on screen at k = 4, where the left edge is at CSS x = 40 (device 78 to 82).
      const widths = [opaque(row(one.canvas, 70, 0, 60)), opaque(row(four.canvas, 200, 40, 120))];

      // A dot ring over a dot: the ring's outer edge is the dot's own.
      const dot = layer();
      paint.paintAreas(dot, { source: "s", view: { k: 1, x: 0, y: 0 }, alpha: 1, hatch: { line: blue, background: blue }, items: [{ id: "a", fill: blue, stroke: blue, width: 1.5, dot: true }] }, res);
      const ring = layer();
      paint.paintBorders(ring, { source: "s", view: { k: 1, x: 0, y: 0 }, items: [{ id: "a", stroke: blue, width: 1.5, alpha: 1, dot: true }] }, res);
      const [a, b] = [alpha(dot), alpha(ring)];
      const edge = a.flatMap((v, i) => (v > 0 && v < 255 ? [[v, b[i]]] : []));
      return {
        inside, widths, sigs: [one.sig, four.sig],
        edge, ringOutsideDot: b.filter((v, i) => v > 0 && a[i] === 0).length, centre: b[70 * 400 + 70],
      };
    });
    assert.deepEqual(got.inside, [0, 0, 0, 0], "nothing is filled inside the region");
    assert.deepEqual(got.widths, [4, 4], "2 CSS px (4 device px) wide at k = 1 and at k = 4");
    assert.notEqual(got.sigs[0], got.sigs[1], "the view is in the signature");
    assert.ok(got.edge.length > 10, "the dot has an anti-aliased rim");
    assert.ok(got.edge.every(([dot, ring]) => dot === ring), "the ring's outer edge matches the dot's, pixel by pixel");
    assert.equal(got.ringOutsideDot, 0, "the ring never leaves the dot");
    assert.equal(got.centre, 0, "and its middle stays clear");
    assert.deepEqual(ctx.errors, []);
  });
});

test("paintAreas: the transform holds the backing-store ratio, so the same scene is the same at 2x", async () => {
  await withPage({ root, url: pages.url("kit", "step=a") }, async (page, ctx) => {
    // A 200 x 200 layer with a 400 x 400 backing store (2x). The square at base px (10, 10)-(60, 60), seen at k = 2 from
    // (10, 10), lands on CSS px 30-130: device px 60-260. Its centroid (35, 35) is CSS (80, 80): device (160, 160).
    const got = await inPage(page, (paint) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 400;
      canvas.style.width = canvas.style.height = "200px";
      const res = { path: () => new Path2D("M10,10H60V60H10Z"), centroid: () => [35, 35] };
      const [fill, stroke] = ["rgb(200, 0, 0)", "rgb(0, 0, 200)"];
      const scene = (item) => ({ source: "s", view: { k: 2, x: 10, y: 10 }, alpha: 1, hatch: { line: stroke, background: fill }, items: [item] });
      const at = (x, y) => [...canvas.getContext("2d").getImageData(x, y, 1, 1).data].join(",");
      paint.paintAreas(canvas, scene({ id: "a", fill, stroke, width: 2, dot: false }), res);
      const area = { in: at(64, 100), edge: [57, 58, 61, 62].map((x) => at(x, 100)), far: at(256, 256), out: at(268, 268) };
      paint.paintAreas(canvas, scene({ id: "a", fill, stroke: fill, width: 0, dot: true }), res);
      const dot = { centre: at(160, 160), inside: at(168, 160), outside: at(172, 160), square: at(70, 100) };
      return { area, dot };
    });
    const [red, blue, clear] = ["200,0,0,255", "0,0,200,255", "0,0,0,0"];
    assert.equal(got.area.in, red, "the square covers device px 60 to 260");
    assert.equal(got.area.far, red);
    assert.equal(got.area.out, clear, "and nothing past it");
    assert.deepEqual(got.area.edge, [clear, blue, blue, red], "a 2 px outline is 2 CSS px, 4 device px, wide at k = 2: 58 to 61");
    assert.deepEqual([got.dot.centre, got.dot.inside], [red, red], "a dot is a circle at the centroid seen through the view");
    assert.equal(got.dot.outside, clear, "of 5 CSS px: 10 device px at 2x, so 12 out is clear");
    assert.equal(got.dot.square, clear, "and the region's own path is not painted");
    assert.deepEqual(ctx.errors, []);
  });
});

test("paintPoints: radius and fill", async () => {
  await withPage({ root, url: pages.url("square", "step=points") }, async (page, ctx) => {
    const fill = paletteRgb(THEME, 0);
    const pixel = async (dx, dy) => (await readPixels(page, "points", CX + dx, CY + dy, 1, 1))[0];
    assert.equal(rgb(await pixel(0, 0)), fill, "the centre has the fill");
    assert.equal(rgb(await pixel(10, 0)), fill, "10 px out, inside the 12 px radius");
    assert.equal(rgb(await pixel(0, -10)), fill);
    assert.equal((await pixel(14, 0))[3], 0, "14 px out is clear");
    assert.equal((await pixel(-14, 0))[3], 0);
    assert.equal((await pixel(0, 14))[3], 0);
    assert.match(await signatureOf(page, "points"), /^[0-9a-f]{8}$/);
    await goTo(page, "square", "a");
    assert.equal((await readPixels(page, "points", CX, CY, 1, 1))[0][3], 0, "with no points the layer is clear");
    assert.deepEqual(ctx.errors, []);
  });
});

/** The leaders of an inset as "x1,y1,x2,y2", sorted. */
const leadersOf = (paint, d3, { box, frame }) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const g = paint.insetFrame(svg, { box, frame });
  return [...g.querySelectorAll("line.sd-map-inset-leader")]
    .map((l) => ["x1", "y1", "x2", "y2"].map((a) => Number(l.getAttribute(a))).join(",") + `|${l.getAttribute("stroke-dasharray")}`)
    .sort();
};

test("insetFrame: leaders join the nearest corners", async () => {
  await withPage({ root, url: pages.url("kit", "step=a") }, async (page, ctx) => {
    const leaders = (box, frame) => inPage(page, leadersOf, { box, frame });
    const dash = (...lines) => lines.map((l) => `${l}|6 4`).sort();
    const box = [100, 100, 140, 130];
    // Diagonal: the two corners off the diagonal, to the same corners of the frame.
    assert.deepEqual(await leaders(box, [600, 300, 900, 500]), dash("140,100,900,300", "100,130,600,500"), "frame below and right");
    assert.deepEqual(await leaders([600, 300, 640, 330], [100, 100, 400, 280]), dash("640,300,400,100", "600,330,100,280"), "frame above and left");
    // Side by side: the box's near corners, top to top and bottom to bottom.
    assert.deepEqual(await leaders(box, [600, 90, 900, 340]), dash("140,100,600,90", "140,130,600,340"), "frame to the right");
    assert.deepEqual(await leaders([600, 300, 640, 330], [100, 290, 400, 500]), dash("600,300,400,290", "600,330,400,500"), "frame to the left");
    // Above or below: the near corners, left to left and right to right.
    assert.deepEqual(await leaders(box, [60, 300, 300, 500]), dash("100,130,60,300", "140,130,300,300"), "frame below");
    assert.deepEqual(await leaders([100, 300, 140, 330], [60, 100, 300, 200]), dash("100,300,60,200", "140,300,300,200"), "frame above");
    assert.deepEqual(ctx.errors, []);
  });
});

test("insetFrame: a frame over the box has two hidden leaders, bare of any earlier position", async () => {
  await withPage({ root, url: pages.url("kit", "step=a") }, async (page, ctx) => {
    const html = (frame) => inPage(page, (paint, d3, { box, frames }) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      for (const frame of frames) paint.insetFrame(svg, { box, frame });
      return svg.outerHTML;
    }, { box: [100, 100, 140, 130], frames: frame });
    const hidden = await html([[600, 300, 900, 500], [110, 110, 300, 200]]);
    assert.equal(hidden, await html([[110, 110, 300, 200]]), "after a call with leaders, a call without them writes what a first call does");
    assert.equal(hidden.match(/<line[^>]*>/g).join(""), '<line class="sd-map-inset-leader" display="none"><line class="sd-map-inset-leader" display="none">'); // opening tags: no coordinates, no dash
    assert.deepEqual(ctx.errors, []);
  });
});

test("insetFrame: idempotent", async () => {
  await withPage({ root, url: pages.url("kit", "step=a") }, async (page, ctx) => {
    const result = await inPage(page, (paint) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const args = { box: [100, 100, 140, 130], frame: [600, 300, 900, 500] };
      const first = paint.insetFrame(svg, args);
      const html = svg.outerHTML;
      const second = paint.insetFrame(svg, args);
      const same = second === first && svg.outerHTML === html;
      const moved = paint.insetFrame(svg, { box: [100, 100, 140, 130], frame: [10, 10, 20, 20] });
      return {
        groups: svg.querySelectorAll("g.sd-map-inset").length, same, reused: moved === first,
        parts: [...first.children].map((c) => `${c.localName}.${c.getAttribute("class")}`),
        frame: [...first.querySelectorAll("rect")].map((r) => ["x", "y", "width", "height"].map((a) => Number(r.getAttribute(a)))),
      };
    });
    assert.equal(result.groups, 1, "one group after three calls");
    assert.ok(result.same && result.reused, "the same group, unchanged by a repeat, updated in place by a change");
    assert.deepEqual(result.parts, [
      "line.sd-map-inset-leader", "line.sd-map-inset-leader", "rect.sd-map-inset-box", "rect.sd-map-inset-frame",
    ]);
    assert.deepEqual(result.frame, [[100, 100, 40, 30], [10, 10, 10, 10]], "the box and the frame as x, y, width, height");
    assert.deepEqual(ctx.errors, []);
  });
});

test("scaleBar: a round length", async () => {
  await withPage({ root, url: pages.url("kit", "step=a") }, async (page, ctx) => {
    // A Mercator map of scale 1000 px per radian: at the equator one pixel is 6.371 km, at 60 degrees 3.1855 km.
    const bar = (spec) => inPage(page, (paint, d3, { at, k, maxWidth }) => {
      const base = d3.geoMercator().scale(1000).translate([0, 0]);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const v = { k, x: 0, y: 0 };
      const point = [base(at)[0] * k, base(at)[1] * k];
      const g = paint.scaleBar(svg, { base, view: v, at: point, maxWidth, format: d3.format(",") });
      paint.scaleBar(svg, { base, view: v, at: point, maxWidth, format: d3.format(",") });
      const line = g.querySelector("line.sd-map-scale-bar");
      return { groups: svg.querySelectorAll("g.sd-map-scale").length, width: Number(line.getAttribute("x2")) - Number(line.getAttribute("x1")),
        x: Number(line.getAttribute("x1")), label: g.querySelector("text").textContent, point };
    }, spec);

    const equator = await bar({ at: [0, 0], k: 1, maxWidth: 200 });
    assert.equal(equator.label, "1,000 km", "1,274 km fit in 200 px: the round length below is 1,000");
    assert.ok(Math.abs(equator.width - 1000 / 6.371) < 0.5, `1,000 km is ${equator.width} px`);
    assert.equal(equator.groups, 1, "one group after two calls");
    assert.equal(equator.x, equator.point[0], "the bar starts at the point it is measured at");

    const north = await bar({ at: [0, 60], k: 1, maxWidth: 200 });
    assert.equal(north.label, "500 km", "a pixel is half as long at 60 degrees");
    assert.ok(Math.abs(north.width - 500 / 3.1855) < 0.5, `500 km is ${north.width} px`);

    const zoomed = await bar({ at: [0, 0], k: 4, maxWidth: 200 });
    assert.equal(zoomed.label, "200 km", "zoomed in four times, 318 km fit: 200");
    assert.ok(Math.abs(zoomed.width - 200 / (6.371 / 4)) < 0.5, `200 km is ${zoomed.width} px`);

    for (const r of [equator, north, zoomed]) assert.ok(r.width <= 200 && r.width > 200 / 2.5, `${r.width} px: a nice length is within 2.5 of the room`);
    assert.deepEqual(ctx.errors, []);
  });
});

// --- rasters -----------------------------------------------------------------------------------------------------------

const HOME = "test/fixtures/decks/map-kit/";
/** The canvas pixel of a lon/lat on the raster slide's map (Mercator, the square region), zoomed by `zoom` about [-14, -27] as `about` says. */
const pixelOf = (page, lon, lat, zoom = 1) =>
  withKit(page, async (M, ctx, [lon, lat, zoom]) => {
    const { features } = M.boundaries(await ctx.data("data/square-cw.geojson"), { id: "code" });
    const base = M.projection("mercator", features, [1400, 760]);
    const [ax, ay] = base([-14, -27]);
    return M.applyView({ k: zoom, x: ax * (1 - zoom), y: ay * (1 - zoom) }, base([lon, lat])).map(Math.round);
  }, [lon, lat, zoom]);
/** The colour of a raster level on the fixture's ramp (the first palette colour up to the second), as "rgb(r, g, b)". */
const rampRgb = (level) => d3.scaleLinear().domain([0, 255]).range([paletteRgb(THEME, 0), paletteRgb(THEME, 1)])(level);
/** The pixel of the raster layer at (x, y), as "rgb(r, g, b)" or "clear". */
const rasterPixel = async (page, [x, y]) => {
  const [pixel] = await readPixels(page, "raster", x, y, 1, 1);
  return pixel[3] === 0 ? "clear" : pixel[3] === 255 ? rgb(pixel) : `partial ${pixel}`;
};

test("loadRaster: levels decode exactly", async () => {
  await withPage({ root, url: pages.url("kit", "step=a") }, async (page, ctx) => {
    const got = await withKit(page, async (M, ctx) => {
      const raster = await M.loadRaster("data/levels.json", ctx);
      const grid = await raster.grid(0);
      return {
        size: raster.size, bounds: raster.bounds, value: raster.value, frames: raster.frames,
        cols: grid.cols, rows: grid.rows, levels: Array.from(grid.levels), data: Array.from(grid.data),
        kinds: [grid.levels.constructor.name, grid.data.constructor.name], decoded: raster.decoded(0) === grid,
        again: (await M.loadRaster("data/levels.json", ctx)) === raster,
        otherLoader: (await M.loadRaster("data/levels.json", { ...ctx, data: (path) => ctx.data(path) })) !== raster,
      };
    });
    assert.deepEqual(got.size, [4, 1]);
    assert.deepEqual([got.cols, got.rows], [4, 1]);
    assert.deepEqual(got.bounds, [-16, -28, -10, -26]);
    assert.deepEqual(got.value, { scale: "linear", min: 0, max: 255 });
    assert.deepEqual(got.frames, [{ label: "", numbers: {}, src: "data/levels.png" }], "a single image is one frame, named by its deck path");
    // 0, 254 and 255 come back as written (no colour conversion); the second pixel has no data, and its level is 0
    assert.deepEqual(got.levels, [0, 0, 254, 255]);
    assert.deepEqual(got.data, [1, 0, 1, 1]);
    assert.deepEqual(got.kinds, ["Uint8Array", "Uint8Array"]);
    assert.ok(got.decoded, "decoded(0) is the grid grid(0) resolved to");
    assert.ok(got.again, "a second load shares the first");
    assert.ok(got.otherLoader, "another ctx.data has its own rasters");
    assert.deepEqual(ctx.errors, []);
  });
});

test("loadRaster: a time-lapse lists its frames, and keeps the 12 most recently used decoded", async () => {
  await withPage({ root, url: pages.url("kit", "step=a") }, async (page, ctx) => {
    const got = await withKit(page, async (M, ctx) => {
      const raster = await M.loadRaster("data/lapse.json", ctx);
      const decoded = () => Array.from({ length: 13 }, (_, i) => raster.decoded(i) !== undefined);
      const out = { labels: raster.frames.map((f) => f.label), srcs: [raster.frames[0].src, raster.frames[12].src], start: decoded() };
      const grids = [];
      for (let i = 1; i < 12; i++) grids.push(await raster.grid(i));
      out.levels = grids.map((grid) => grid.levels[0]);
      out.full = decoded();
      const old = grids[0];
      await raster.grid(0); // uses frame 0 again, so frame 1 is now the least recently used
      await raster.grid(12);
      out.after = decoded();
      out.redecoded = (await raster.grid(1)) !== old;
      out.missing = await raster.grid(13).catch((e) => e.message);
      return out;
    });
    assert.deepEqual(got.labels, Array.from({ length: 13 }, (_, i) => `f${i}`));
    assert.deepEqual(got.srcs, ["data/lapse/f0.png", "data/lapse/f12.png"]);
    assert.deepEqual(got.start, [true, ...Array(12).fill(false)], "only the first frame is decoded on load");
    assert.deepEqual(got.levels, Array.from({ length: 11 }, (_, i) => 20 * (i + 1)), "each frame holds its own level");
    assert.deepEqual(got.full, [...Array(12).fill(true), false], "12 frames are kept");
    assert.deepEqual(got.after, [true, false, ...Array(11).fill(true)], "frame 1, the least recently used, went");
    assert.ok(got.redecoded, "and a frame that went decodes again on request");
    assert.equal(got.missing, "data/lapse.json: there is no frame 13");
    assert.deepEqual(ctx.errors, []);
  });
});

test("loadRaster: a frame of another size errors", async () => {
  await withPage({ root, url: pages.url("kit", "step=a") }, async (page) => {
    const got = await withKit(page, async (M, ctx) => {
      const raster = await M.loadRaster("data/mismatch.json", ctx);
      const first = await raster.grid(0);
      return { size: raster.size, first: [first.cols, first.rows], error: await raster.grid(1).then(() => null, (e) => e.message), decoded: raster.decoded(1) };
    });
    assert.deepEqual(got.size, [8, 6]);
    assert.deepEqual(got.first, [8, 6]);
    assert.equal(got.error, "data/mismatch/2001.png: 9×6 does not match the first frame (8×6)");
    assert.equal(got.decoded, undefined, "a frame that failed is not kept");
  });
});

test("loadRaster: too many pixels errors, as an element error on a slide", async () => {
  await withPage({ root, url: pages.url("kit", "step=a") }, async (page) => {
    const got = await withKit(page, async (M, ctx) => {
      const attempt = () => M.loadRaster("data/wide.json", ctx).then(() => null, (e) => e.message);
      return [await attempt(), await attempt()];
    }, null, "map-kit-broken");
    const message = "data/wide.png: 2001×2000 is more than 2,000×2,000 pixels";
    assert.deepEqual(got, [message, message], "the limit is on the area: 2001 wide is fine on its own, and a failure is tried again");
  });
  await withPage({ root, url: brokenPages.url("broken", "step=a") }, async (page) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.deepEqual(errors, [`broken/map: data/wide.png: 2001×2000 is more than 2,000×2,000 pixels`]);
  });
});

test("loadRaster: a time-lapse over 100 million pixels errors once its first frame gives the size", async () => {
  await withPage({ root, url: pages.url("kit", "step=a") }, async (page) => {
    const got = await withKit(page, async (M, ctx) => {
      // every frame names one 1000×1000 image: 100 frames are 100 million pixels, 101 are more
      const canvas = new OffscreenCanvas(1000, 1000);
      canvas.getContext("2d").fillRect(0, 0, 1000, 1000);
      const url = URL.createObjectURL(await canvas.convertToBlob({ type: "image/png" }));
      const json = (n) => ({ bounds: [-16, -28, -10, -26], value: { scale: "linear", min: 0, max: 1 }, frames: Array.from({ length: n }, (_, i) => ({ src: `f/${i}.png`, label: String(i) })) });
      const fetch = window.fetch;
      let fetched = 0;
      window.fetch = (input, init) => {
        if (String(input) === url) fetched += 1;
        return fetch(input, init);
      };
      try {
        const load = async (n) => {
          fetched = 0;
          const result = await M.loadRaster("data/big.json", { data: async () => json(n), assetUrl: () => url }).then((r) => r.size, (e) => e.message);
          return { result, fetched };
        };
        return { within: await load(100), over: await load(101) };
      } finally {
        window.fetch = fetch;
        URL.revokeObjectURL(url);
      }
    });
    assert.deepEqual(got.within, { result: [1000, 1000], fetched: 1 });
    assert.deepEqual(got.over, {
      result: "data/big.json: 101 frames of 1000×1000 is 101 million pixels, more than 100 million; use fewer or smaller frames",
      fetched: 1,
    }, "refused after the first frame, before decoding another");
  });
});

test("loadRaster: an image is read next to its JSON and must be a path inside the deck", async () => {
  await withPage({ root, url: pages.url("kit", "step=a") }, async (page) => {
    const got = await withKit(page, async (M, ctx) => {
      const bounds = [-16, -28, -10, -26], value = { scale: "linear", min: 0, max: 1 };
      const asking = (file, json) => M.loadRaster(file, { data: async () => json, assetUrl: ctx.assetUrl }).then(() => null, (e) => e.message);
      const out = {};
      for (const src of ["../x.png", "f/../x.png", "/x.png", "https://host/x.png", "a\\b.png", "%2e%2e/x.png"]) {
        out[src] = await asking("data/a/b.json", { bounds, value, src });
      }
      out.resolved = await asking("data/a/b.json", { bounds, value, src: "f/1.png" });
      out.frame = await asking("data/a/b.json", { bounds, value, frames: [{ src: "f/1.png", label: "x" }, { src: "../2.png", label: "y" }] });
      out.rootFolder = await asking("b.json", { bounds, value, src: "1.png" });
      out.problem = await asking("data/a/b.json", { bounds, value });
      out.noAssetUrl = await M.loadRaster("data/levels.json", { data: ctx.data }).then(() => null, (e) => e.message);
      out.otherError = await M.loadRaster("data/a/b.json", { data: async () => ({ bounds, value, src: "x.png" }), assetUrl: () => { throw new Error("boom"); } }).then(() => null, (e) => e.message);
      return out;
    });
    for (const src of ["../x.png", "f/../x.png", "/x.png", "https://host/x.png", "a\\b.png", "%2e%2e/x.png"]) {
      assert.equal(got[src], `data/a/b.json: '${src}' is not a path inside the deck`, src);
    }
    assert.equal(got.resolved, "data/a/f/1.png: not found", "f/1.png beside data/a/b.json is data/a/f/1.png");
    assert.equal(got.frame, "data/a/b.json: '../2.png' is not a path inside the deck", "every frame's path is checked before any is read");
    assert.equal(got.rootFolder, "1.png: not found", "a JSON at the root has the root as its folder");
    assert.equal(got.noAssetUrl, "loadRaster needs ctx.assetUrl");
    assert.equal(got.otherError, "boom", "only the loader's path error is reworded");
    assert.equal(got.problem, "data/a/b.json: needs `src` or `frames`", "what rasterProblems finds is thrown");
  });
});

test("paintRaster: the pixel over a known cell has its LUT colour", async () => {
  await withPage({ root, url: pages.url("raster", "step=a") }, async (page, ctx) => {
    // columns of 1.5 degrees from -16: level 0 | no data | level 254 | level 255
    assert.equal(await rasterPixel(page, await pixelOf(page, -15, -27)), paletteRgb(THEME, 0), "column 0, level 0: the first colour exactly");
    assert.equal(await rasterPixel(page, await pixelOf(page, -12.25, -27)), rampRgb(254), "column 2, level 254");
    assert.equal(await rasterPixel(page, await pixelOf(page, -11, -27)), paletteRgb(THEME, 1), "column 3, level 255: the second colour exactly");
    assert.equal(await rasterPixel(page, await pixelOf(page, -15, -25.5)), "clear", "north of the raster nothing is painted");
    assert.equal(await rasterPixel(page, await pixelOf(page, -17, -27)), "clear", "nor west of it");
    assert.match(await signatureOf(page, "raster"), /^[0-9a-f]{8}$/);
    assert.deepEqual(ctx.errors, []);
  });
});

test("paintRaster: two draws at 1 and 0.5 mix", async () => {
  await withPage({ root, url: pages.url("raster", "step=mix") }, async (page, ctx) => {
    // frame 0 is level 0 and frame 12 level 240, everywhere; the second goes over the first at half strength
    const [low, high] = [parse(rampRgb(0)), parse(rampRgb(240))];
    const pixel = (await readPixels(page, "raster", ...(await pixelOf(page, -15, -27)), 1, 1))[0];
    assert.equal(pixel[3], 255);
    low.forEach((c, i) => assert.ok(Math.abs(pixel[i] - (c + high[i]) / 2) <= 2, `channel ${i}: ${pixel[i]} is the mean of ${c} and ${high[i]}`));
    assert.notDeepEqual(pixel.slice(0, 3), low);
    assert.notDeepEqual(pixel.slice(0, 3), high);
    assert.deepEqual(ctx.errors, []);
  });
});

test("paintRaster: no-data land is hatched, and nothing is hatched where there is no land cell", async () => {
  await withPage({ root, url: pages.url("raster", "step=a") }, async (page, ctx) => {
    const [dim, surface] = [await tokenRgb(page, "--sd-color-dim"), await tokenRgb(page, "--sd-color-surface")];
    const [x, y] = await pixelOf(page, -13.5, -27); // column 1, on the land
    const land = new Set((await readPixels(page, "raster", x - 10, y - 10, 20, 20)).map(rgb));
    assert.ok(land.has(dim) && land.has(surface), `the stripes and what is between them (${[...land].join(" | ")})`);
    assert.equal(await rasterPixel(page, await pixelOf(page, -17, -27)), "clear", "west of the raster, over the ocean");
    assert.equal(await rasterPixel(page, await pixelOf(page, -15, -27)), paletteRgb(THEME, 0), "and column 0, which has data, is not hatched");
    assert.equal(await rasterPixel(page, await pixelOf(page, -12.25, -27)), rampRgb(254), "where there is data, it covers the hatch");

    await goTo(page, "raster", "bare");
    const bare = new Set((await readPixels(page, "raster", x - 3, y - 3, 6, 6)).map((p) => p[3]));
    assert.deepEqual([...bare], [0], "without a hatch the land stays clear too");
    assert.deepEqual(ctx.errors, []);
  });
});

/** How many pixels of the raster layer are hatch: opaque and in the dim or surface colour, or between them (the stripes' edges mix). */
async function hatchPixels(page) {
  const [dim, surface] = [parse(await tokenRgb(page, "--sd-color-dim")), parse(await tokenRgb(page, "--sd-color-surface"))];
  return page.evaluate(([dim, surface]) => {
    const canvas = document.querySelector('[data-el="map"] canvas[data-layer="raster"]');
    const d = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 255 && [0, 1, 2].every((c) => d[i + c] >= Math.min(dim[c], surface[c]) - 2 && d[i + c] <= Math.max(dim[c], surface[c]) + 2)) count++;
    }
    return count;
  }, [dim, surface]);
}

test("paintRaster: a raster of land cells has no hatch along its coast", async () => {
  await withPage({ root, url: pages.url("raster", "step=coast") }, async (page, ctx) => {
    // 1.2 degree pixels from -14.7: the first and third are centred in the sea but cover land (-14 to -13.5, -12.3 to -12)
    assert.equal(await rasterPixel(page, await pixelOf(page, -13.7, -27)), "clear", "land under a sea-centred pixel is not hatched");
    assert.equal(await rasterPixel(page, await pixelOf(page, -12.2, -27)), "clear", "on the other side too");
    assert.equal(await rasterPixel(page, await pixelOf(page, -12.9, -27)), rampRgb(128), "the land pixel has its data");
    assert.equal(await hatchPixels(page), 0, "no hatch anywhere");
    assert.equal(await withKit(page, async (M, ctx) => {
      const { features } = M.boundaries(await ctx.data("data/square-cw.geojson"), { id: "code" });
      return M.rasterGaps(await M.loadRaster("data/coast.json", ctx), features);
    }), false, "and no gap for a legend to explain");
    assert.deepEqual(ctx.errors, []);
  });
});

test("paintRaster: a land cell with no data, and land outside the raster, are hatched; rasterGaps agrees in every case", async () => {
  await withPage({ root, url: pages.url("raster", "step=hole") }, async (page, ctx) => {
    const gaps = (file) => withKit(page, async (M, ctx, file) => {
      const { features } = M.boundaries(await ctx.data("data/square-cw.geojson"), { id: "code" });
      return M.rasterGaps(await M.loadRaster(file, ctx), features);
    }, file);
    const [dim, surface] = [await tokenRgb(page, "--sd-color-dim"), await tokenRgb(page, "--sd-color-surface")];
    /** Whether the 20 x 20 px around a lon/lat show both hatch colours. */
    const hatched = async (lon, lat) => {
      const [x, y] = await pixelOf(page, lon, lat);
      const seen = new Set((await readPixels(page, "raster", x - 10, y - 10, 20, 20)).map(rgb));
      return seen.has(dim) && seen.has(surface);
    };

    // frame 1 of `patched` has a hole of 0.4 degrees around (-13, -27); the pixels around it have data
    assert.equal(await hatched(-13, -27), true, "an interior land cell with no data is hatched");
    assert.equal(await rasterPixel(page, await pixelOf(page, -13.6, -27)), rampRgb(128), "and the cells around it are not");
    assert.equal(await gaps("data/patched.json"), true);
    assert.ok((await hatchPixels(page)) > 100);

    await goTo(page, "raster", "half"); // data over the west half of the square only
    assert.equal(await rasterPixel(page, await pixelOf(page, -13.5, -27)), rampRgb(128), "the west half has its data");
    assert.equal(await hatched(-12.5, -27), true, "land outside the raster's bounds is hatched");
    assert.equal(await rasterPixel(page, await pixelOf(page, -11, -27)), "clear", "and the sea beyond it is clear");
    assert.equal(await gaps("data/half.json"), true);

    await goTo(page, "raster", "covered");
    assert.equal(await hatchPixels(page), 0, "a raster with data on all the land has no hatch");
    assert.equal(await gaps("data/covered.json"), false);
    assert.deepEqual(ctx.errors, []);
  });
});

test("paintRaster: the same picture at any devicePixelRatio, in CSS px", async () => {
  const signatures = new Set();
  for (const ratio of [0.8, 1, 2]) {
    await withPage({ root }, async (page, ctx) => {
      await page.addInitScript((r) => Object.defineProperty(window, "devicePixelRatio", { get: () => r }), ratio);
      await ctx.open(pages.url("raster", "step=a"));
      const backing = Math.min(1, ratio); // a raster layer is made with maxRatio: 1
      const size = await page.evaluate(() => { const c = document.querySelector('canvas[data-layer="raster"]'); return [c.width, c.height]; });
      assert.deepEqual(size, [Math.round(W * backing), Math.round(H * backing)], `ratio ${ratio}: the backing store`);
      const at = async (lon, lat, half = 0) => {
        const [x, y] = await pixelOf(page, lon, lat);
        return readPixels(page, "raster", Math.round(x * backing) - half, Math.round(y * backing) - half, 2 * half + 1, 2 * half + 1);
      };
      assert.equal(rgb((await at(-15, -27))[0]), paletteRgb(THEME, 0), `ratio ${ratio}: a known cell has its colour where CSS px say`);
      assert.equal(rgb((await at(-11, -27))[0]), paletteRgb(THEME, 1));
      const hatch = new Set((await at(-13.5, -27, 10)).map(rgb));
      assert.ok(hatch.size > 2 && (await at(-13.5, -27, 10)).every((p) => p[3] === 255), `ratio ${ratio}: the no-data land is hatched (${hatch.size} colours)`);
      assert.equal((await at(-17, -27))[0][3], 0, `ratio ${ratio}: and nothing is painted west of the raster`);
      signatures.add(await signatureOf(page, "raster"));
      assert.deepEqual(ctx.errors, []);
    });
  }
  assert.equal(signatures.size, 1, "the scene, and so its signature, does not depend on the ratio");
});

test("paintRaster: drawn at another view moves as a picture", async () => {
  await withPage({ root, url: pages.url("raster", "step=moved") }, async (page, ctx) => {
    // The picture is built for zoom 1 and the map shows zoom 2 about (-14, -27): edges land where applyView says.
    const [west, mid] = [await pixelOf(page, -14.5, -27, 2), await pixelOf(page, -13, -27, 2)];
    const [oldWest] = await pixelOf(page, -14.5, -27, 1);
    assert.ok(west[0] > 0 && west[0] < 700 && Math.abs(west[0] - oldWest) > 100, `the edge at -14.5 is at ${west[0]}, not at ${oldWest}`);
    assert.equal(await rasterPixel(page, [west[0] - 4, west[1]]), paletteRgb(THEME, 0), "column 0 to the west of its edge");
    assert.notEqual(await rasterPixel(page, [west[0] + 4, west[1]]), paletteRgb(THEME, 0), "and not to the east of it, where column 1 has no data");
    assert.notEqual(await rasterPixel(page, [oldWest - 4, west[1]]), paletteRgb(THEME, 0), "nothing is left where the edge was");
    assert.equal(await rasterPixel(page, [mid[0] + 4, mid[1]]), rampRgb(254), "column 2 starts where applyView puts -13");
    assert.notEqual(await rasterPixel(page, [mid[0] - 4, mid[1]]), rampRgb(254), "and column 1 ends there");
    assert.deepEqual(ctx.errors, []);
  });
});

test("paintRaster: a frame that is not decoded throws, and the signature is the scene's", async () => {
  await withPage({ root, url: pages.url("kit", "step=a") }, async (page, ctx) => {
    const got = await inPage(page, (paint) => {
      const canvas = Object.assign(document.createElement("canvas"), { width: 4, height: 4 });
      const view = { k: 1, x: 0, y: 0 };
      const scene = (lut, alpha) => ({ source: "r.json", lut, view, hatch: null, draws: [{ frame: 3, at: view, alpha }] });
      const res = { raster: { decoded: () => undefined }, lutData: new Uint8ClampedArray(1024), lookupFor: () => new Int32Array(16), land: null, cache: new Map() };
      let error = null;
      try {
        paint.paintRaster(canvas, scene("a", 1), res);
      } catch (e) {
        error = e.message;
      }
      // with the picture already built nothing is read from the raster, and `res` is never hashed
      for (const lut of ["a", "b"]) res.cache.set(`r.json|3|1.000|0.000|0.000|${lut}|none|whole|4×4`, document.createElement("canvas"));
      const sig = (lut, alpha, r = res) => paint.paintRaster(canvas, scene(lut, alpha), r);
      return { error, same: sig("a", 1) === sig("a", 1, { ...res, lutData: new Uint8ClampedArray(1024).fill(9) }), lut: sig("a", 1) !== sig("b", 1), alpha: sig("a", 1) !== sig("a", 0.5) };
    });
    assert.equal(got.error, "paintRaster: frame 3 is not decoded");
    assert.deepEqual([got.same, got.lut, got.alpha], [true, true, true]);
    assert.deepEqual(ctx.errors, []);
  });
});

test("paintRaster: clip keeps cells inside the coastline", async () => {
  await withPage({ root, url: pages.url("raster", "step=a") }, async (page, ctx) => {
    const [dim, surface] = [await tokenRgb(page, "--sd-color-dim"), await tokenRgb(page, "--sd-color-surface")];
    /** Whether the 21 x 21 px around a lon/lat show both hatch colours. */
    const hatched = async (lon, lat) => {
      const [x, y] = await pixelOf(page, lon, lat);
      const seen = new Set((await readPixels(page, "raster", x - 10, y - 10, 21, 21)).map(rgb));
      return seen.has(dim) && seen.has(surface);
    };
    // The square is -14 to -12 degrees. Column 2 (-13 to -11.5) is centred on land and reaches 0.5 degrees into the sea;
    // column 1 (-14.5 to -13, no data) is centred on land too, and its west third is sea; column 0 is all sea.
    assert.equal(await rasterPixel(page, await pixelOf(page, -11.75, -27)), rampRgb(254), "whole cells: the sea side of a land-centred cell is coloured");
    assert.equal(await hatched(-14.25, -27), true, "and so is the hatch of a land-centred cell with no data");
    assert.equal(await rasterPixel(page, await pixelOf(page, -15, -27)), paletteRgb(THEME, 0), "and a cell in the sea");

    await goTo(page, "raster", "clip");
    assert.equal(await rasterPixel(page, await pixelOf(page, -11.75, -27)), "clear", "clipped: past the coastline nothing is painted, whatever the cell's value");
    assert.equal(await rasterPixel(page, await pixelOf(page, -12.25, -27)), rampRgb(254), "on land the cell has its colour");
    assert.equal(await hatched(-14.25, -27), false, "the hatch stops at the coast too");
    assert.equal(await hatched(-13.5, -27), true, "and is still there on land");
    assert.equal(await rasterPixel(page, await pixelOf(page, -15, -27)), "clear", "a cell with data in the sea is clear");
    assert.deepEqual(ctx.errors, []);
  });
});

test("paintRaster: clip is in the signature, and in the picture's cache entry", async () => {
  await withPage({ root, url: pages.url("kit", "step=a") }, async (page, ctx) => {
    const got = await inPage(page, (paint) => {
      const canvas = Object.assign(document.createElement("canvas"), { width: 4, height: 4 });
      const view = { k: 1, x: 0, y: 0 };
      const scene = (clip) => ({ source: "r.json", lut: "a", view, hatch: null, clip, draws: [{ frame: 0, at: view, alpha: 1 }] });
      // every cell has data, in an opaque colour, and there is no land: a clipped picture is clear
      const res = {
        raster: { decoded: () => ({ levels: new Uint8Array(16), data: new Uint8Array(16).fill(1) }) },
        lutData: new Uint8ClampedArray(1024).fill(255), lookupFor: () => Int32Array.from({ length: 16 }, (_, i) => i), land: new Path2D(), landCells: null, cache: new Map(),
      };
      const alpha = () => canvas.getContext("2d").getImageData(1, 1, 1, 1).data[3];
      const sigs = [paint.paintRaster(canvas, scene(true), res)];
      const alphas = [alpha()];
      sigs.push(paint.paintRaster(canvas, scene(false), res));
      alphas.push(alpha());
      sigs.push(paint.paintRaster(canvas, scene(true), res));
      alphas.push(alpha());
      return { same: sigs[0] === sigs[2], differs: sigs[0] !== sigs[1], alphas };
    });
    assert.deepEqual([got.same, got.differs], [true, true], "clip changes the signature");
    assert.deepEqual(got.alphas, [0, 255, 0], "and a clipped and a whole picture of one raster at one view do not share a cache entry");
    assert.deepEqual(ctx.errors, []);
  });
});

test("paintRaster: clip without res.land throws", async () => {
  await withPage({ root, url: pages.url("kit", "step=a") }, async (page, ctx) => {
    const error = await inPage(page, (paint) => {
      const canvas = Object.assign(document.createElement("canvas"), { width: 4, height: 4 });
      const view = { k: 1, x: 0, y: 0 };
      const scene = { source: "r.json", lut: "a", view, hatch: null, clip: true, draws: [{ frame: 0, at: view, alpha: 1 }] };
      const res = { raster: { decoded: () => ({ levels: new Uint8Array(16), data: new Uint8Array(16) }) }, lutData: new Uint8ClampedArray(1024), lookupFor: () => new Int32Array(16), land: null, landCells: null, cache: new Map() };
      try {
        paint.paintRaster(canvas, scene, res);
        return null;
      } catch (e) {
        return e.message;
      }
    });
    assert.equal(error, "paintRaster: clip needs res.land");
    assert.deepEqual(ctx.errors, []);
  });
});

test("rasterGaps: true with the patch, false without, true for land beyond the bounds, false for coastal pixels", async () => {
  await withPage({ root, url: pages.url("kit", "step=a") }, async (page, ctx) => {
    const got = await withKit(page, async (M, ctx) => {
      const { features } = M.boundaries(await ctx.data("data/square-cw.geojson"), { id: "code" });
      const gaps = async (file, land = features) => M.rasterGaps(await M.loadRaster(file, ctx), land);
      return {
        covered: await gaps("data/covered.json"),
        patched: await gaps("data/patched.json"),
        half: await gaps("data/half.json"),
        levels: await gaps("data/levels.json"),
        coast: await gaps("data/coast.json"),
        noLand: await gaps("data/patched.json", []),
      };
    });
    assert.equal(got.covered, false, "data on every pixel of the land: no gap");
    assert.equal(got.patched, true, "a hole in a later frame is a gap (the first frame has none)");
    assert.equal(got.half, true, "no hole at all, but half the land is outside the raster");
    assert.equal(got.levels, true, "the pixel centred on -13.75 is a land cell with no data");
    assert.equal(got.coast, false, "pixels centred in the sea have no data, and that is not a gap");
    assert.equal(got.noLand, false, "no land, no gap");
    assert.deepEqual(ctx.errors, []);
  });
});

test("rasterGaps: `frames` names the frames to look at; every frame by default", async () => {
  await withPage({ root, url: pages.url("kit", "step=a") }, async (page, ctx) => {
    const got = await withKit(page, async (M, ctx) => {
      const { features } = M.boundaries(await ctx.data("data/square-cw.geojson"), { id: "code" });
      const raster = await M.loadRaster("data/patched.json", ctx);
      const gaps = (options) => M.rasterGaps(raster, features, options).then((found) => found, (e) => e.message);
      return {
        first: await gaps({ frames: [0] }), second: await gaps({ frames: [1] }), both: await gaps({ frames: [0, 1] }), every: await gaps(),
        none: await gaps({ frames: [] }), missing: await gaps({ frames: [2] }),
        half: await M.rasterGaps(await M.loadRaster("data/half.json", ctx), features, { frames: [] }),
      };
    });
    assert.equal(got.first, false, "the first frame has data on every land cell");
    assert.equal(got.second, true, "the second has a hole");
    assert.equal(got.both, true);
    assert.equal(got.every, true, "without `frames`, every frame");
    assert.equal(got.none, false, "no frame, no gap in a frame");
    assert.equal(got.missing, "data/patched.json: there is no frame 2");
    assert.equal(got.half, true, "land outside the bounds is a gap whatever the frames");
    assert.deepEqual(ctx.errors, []);
  });
});

test("the painters keep played equal to jumped, forward and backward", async () => {
  for (const [slide, steps] of [["kit", ["a", "b", "c", "d", "e", "f"]], ["square", ["a", "hatch", "dot", "zoom", "points"]], ["raster", ["a", "bare", "mix", "moved", "gone", "covered", "hole", "half", "coast", "clip"]]]) {
    await withPage({ root, url: pages.url(slide, "step=a") }, async (page, ctx) => {
      const run = { pages, slide, id: "map", steps };
      await expectJumpEqualsPlayed(ctx, page, run);
      await expectBackwardEqualsJump(ctx, page, run);
      assert.deepEqual(ctx.errors, []);
    });
  }
});
