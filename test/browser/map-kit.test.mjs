// The vector painters, the inset frame and the scale bar of `ctx.map` in Chrome. The painters are exercised through a
// deck component that uses nothing else (test/fixtures/decks/map-kit), the SVG pieces directly. Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/map-kit.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { deckPages, goTo, canvasPixels, tokenRgb, paletteRgb, expectJumpEqualsPlayed, expectBackwardEqualsJump } from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const pages = deckPages("test/fixtures/decks/map-kit/");
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

test("the painters keep played equal to jumped, forward and backward", async () => {
  for (const [slide, steps] of [["kit", ["a", "b", "c", "d", "e", "f"]], ["square", ["a", "hatch", "dot", "zoom", "points"]]]) {
    await withPage({ root, url: pages.url(slide, "step=a") }, async (page, ctx) => {
      const run = { pages, slide, id: "map", steps };
      await expectJumpEqualsPlayed(ctx, page, run);
      await expectBackwardEqualsJump(ctx, page, run);
      assert.deepEqual(ctx.errors, []);
    });
  }
});
