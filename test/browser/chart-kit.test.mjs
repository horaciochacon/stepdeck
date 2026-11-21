// The shared chart building blocks (`ctx.chart`) in Chrome, through a deck component that uses nothing else.
// Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test --test-concurrency=1 test/browser/chart-kit.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { checkPlayed } from "../../cli/check.js";
import { deckPages, goTo, htmlAfterJump, canvasPixels, tokenRgb, expectJumpEqualsPlayed, expectBackwardEqualsJump, expectInterruptEqualsJump } from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const deck = fileURLToPath(new URL("../fixtures/decks/chart-kit/", import.meta.url));
const pages = deckPages("test/fixtures/decks/chart-kit/");
const STEPS = ["a", "b", "c"];
const run = { pages, slide: "marks", id: "marks" };

/** The canvas pixels after loading the slide straight at `step`. */
async function pixelsAfterJump(ctx, page, step) {
  await ctx.open(pages.url("marks", `step=${step}`));
  return canvasPixels(page, "marks");
}

test("marks render with theme colours", async () => {
  await withPage({ root, url: pages.url("marks", "step=a") }, async (page, ctx) => {
    const background = await tokenRgb(page, "--sd-color-background");
    const paint = await page.evaluate(() => {
      const style = (sel) => getComputedStyle(document.querySelector(sel));
      return {
        filled: style('[data-el="marks"] .sd-dot:not(.sd-dot-hollow)').stroke,
        hollow: style('[data-el="marks"] .sd-dot-hollow').fill,
        whisker: style('[data-el="marks"] .sd-whisker-line').stroke,
        halo: style('[data-el="marks"] .sd-halo').stroke,
        under: style('[data-el="marks"] .sd-halo-under').stroke,
        rule: style('[data-el="marks"] .sd-rule').stroke,
      };
    });
    assert.equal(paint.filled, background, "a filled dot is outlined in the background colour");
    assert.equal(paint.hollow, background, "a hollow dot is filled with the background colour");
    assert.equal(paint.halo, background, "a text halo is the background colour");
    assert.equal(paint.under, background, "a halo under a line is the background colour");
    assert.equal(paint.whisker, await tokenRgb(page, "--sd-color-ink"), "a whisker is the ink colour");
    assert.equal(paint.rule, await tokenRgb(page, "--sd-color-muted"), "a rule is the muted colour");

    const shape = await page.evaluate(() => {
      const q = (sel) => document.querySelectorAll(`[data-el="marks"] ${sel}`).length;
      const hollow = document.querySelector('[data-el="marks"] .sd-dot-hollow');
      const filled = document.querySelector('[data-el="marks"] .sd-dot:not(.sd-dot-hollow)');
      return {
        dots: q(".sd-dot"), hollowDots: q(".sd-dot-hollow"),
        whiskerParts: [...document.querySelector('[data-el="marks"] .sd-whisker').children].map((c) => c.getAttribute("class")),
        rules: q("line.sd-rule"), ruleLabels: q("text.sd-rule-label"), under: q(".sd-halo-under"), canvases: q("canvas.sd-canvas-layer"),
        firstChild: document.querySelector('[data-el="marks"]').firstElementChild.localName,
        hollowPaint: [hollow.getAttribute("stroke"), hollow.getAttribute("fill")],
        filledPaint: [filled.getAttribute("fill"), filled.getAttribute("stroke")],
        ruleLabel: document.querySelector('[data-el="marks"] .sd-rule-label').textContent,
      };
    });
    assert.deepEqual(shape.whiskerParts, ["sd-whisker-line", "sd-whisker-cap sd-whisker-cap-lower", "sd-whisker-cap sd-whisker-cap-upper"]);
    assert.deepEqual([shape.dots, shape.hollowDots, shape.rules, shape.ruleLabels, shape.under, shape.canvases], [2, 1, 1, 1, 1, 1]);
    assert.equal(shape.firstChild, "canvas", "the canvas layer is the element's first child");
    assert.ok(shape.hollowPaint[0] && shape.hollowPaint[1] === null, "a hollow dot has a stroke and no fill attribute");
    assert.ok(shape.filledPaint[0] && shape.filledPaint[1] === null, "a filled dot has a fill and no stroke attribute");
    assert.equal(shape.ruleLabel, "Reference");
    assert.deepEqual(ctx.errors, []);
  });
});

test("jump equals played and backward, markup and canvas pixels", async () => {
  await withPage({ root, url: pages.url("marks", "step=a") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { ...run, steps: STEPS });
    await expectBackwardEqualsJump(ctx, page, { ...run, steps: STEPS });

    const jumped = [];
    for (const step of STEPS) jumped.push(await pixelsAfterJump(ctx, page, step));
    assert.equal(jumped.every((px) => px.length === 1 && px[0].startsWith("data:image/png")), true, "one canvas with pixels");
    assert.equal(new Set(jumped.map((px) => px[0])).size, 3, "every step paints something different");

    await ctx.open(pages.url("marks", "step=a&motion=full"));
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    for (let i = 1; i < STEPS.length; i++) {
      await goTo(page, "marks", STEPS[i]);
      assert.deepEqual(await canvasPixels(page, "marks"), jumped[i], `played to '${STEPS[i]}': pixels differ from a jump`);
    }
    for (let i = STEPS.length - 2; i >= 0; i--) {
      await goTo(page, "marks", STEPS[i]);
      assert.deepEqual(await canvasPixels(page, "marks"), jumped[i], `backward to '${STEPS[i]}': pixels differ from a jump`);
    }
    assert.deepEqual(ctx.errors, []);
  });
});

test("a played step really moves the marks and the canvas", async () => {
  await withPage({ root, url: pages.url("marks", "step=a&motion=full") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    const before = await canvasPixels(page, "marks");
    await page.evaluate(() => { window.STEPDECK.goTo("marks", "b"); });
    await page.waitForTimeout(120);
    const mid = { px: await canvasPixels(page, "marks"), html: await page.evaluate(() => document.querySelector('[data-el="marks"]').outerHTML) };
    await page.evaluate(() => window.STEPDECK.settled());
    const end = { px: await canvasPixels(page, "marks"), html: await page.evaluate(() => document.querySelector('[data-el="marks"]').outerHTML) };
    assert.notDeepEqual(mid.px, end.px, "the canvas is mid-way 120 ms in");
    assert.notDeepEqual(mid.px, before, "and has left the start");
    assert.notEqual(mid.html, end.html);
    assert.deepEqual(ctx.errors, []);
  });
});

test("interrupt equals jump", async () => {
  await withPage({ root, url: pages.url("marks", "step=a") }, async (page, ctx) => {
    await expectInterruptEqualsJump(ctx, page, { ...run, from: "a", via: "b", to: "c" });
    assert.deepEqual(await canvasPixels(page, "marks"), await pixelsAfterJump(ctx, page, "c"), "the canvas of an interrupted move equals a jump's");
    await expectInterruptEqualsJump(ctx, page, { ...run, from: "c", via: "b", to: "a" });
  });
});

test("canvas layer sits on the plot at the device pixel ratio", async () => {
  await withPage({ root, url: pages.url("marks", "step=a") }, async (page, ctx) => {
    const read = () => page.evaluate(() => {
      const canvas = document.querySelector('[data-el="marks"] canvas.sd-canvas-layer');
      const area = document.querySelector('[data-el="marks"] .fixture-plot-area');
      const [c, a] = [canvas.getBoundingClientRect(), area.getBoundingClientRect()];
      return {
        box: [c.left - a.left, c.top - a.top, c.width - a.width, c.height - a.height],
        pw: Number(area.getAttribute("width")),
        ph: Number(area.getAttribute("height")),
        width: canvas.width, height: canvas.height,
        cssWidth: parseFloat(canvas.style.width), cssHeight: parseFloat(canvas.style.height),
        dpr: window.devicePixelRatio,
        canvases: document.querySelectorAll('[data-el="marks"] canvas').length,
      };
    });
    const at1 = await read();
    for (const d of at1.box) assert.ok(Math.abs(d) <= 1, `the canvas is on the plot rectangle (${at1.box.join(", ")})`);
    assert.equal(at1.dpr, 1);
    assert.deepEqual([at1.width, at1.height], [Math.round(at1.pw), Math.round(at1.ph)]);
    assert.deepEqual([at1.cssWidth, at1.cssHeight], [at1.pw, at1.ph], "the css size is the plot size");

    // A denser screen: the backing store follows the ratio, capped at 3, and the css box stays put.
    for (const dpr of [2, 5]) {
      await page.evaluate((dpr) => Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => dpr }), dpr);
      await goTo(page, "marks", dpr === 2 ? "b" : "c");
      const dense = await read();
      const scale = Math.min(3, dpr);
      assert.equal(dense.width, Math.round(dense.pw * scale), `width at devicePixelRatio ${dpr}`);
      assert.equal(dense.height, Math.round(dense.ph * scale), `height at devicePixelRatio ${dpr}`);
      for (const d of dense.box) assert.ok(Math.abs(d) <= 1, "still on the plot rectangle");
      assert.equal(dense.canvases, 1, "one canvas, however many updates");
    }
    assert.deepEqual(ctx.errors, []);
  });
});

test("the SVG paints above the canvas", async () => {
  await withPage({ root, url: pages.url("marks", "step=a") }, async (page, ctx) => {
    const probe = await page.evaluate(() => {
      const box = document.querySelector('[data-el="marks"]');
      const canvas = box.querySelector("canvas.sd-canvas-layer");
      const svg = box.querySelector("svg");
      const vline = box.querySelector("path.fixture-vline");
      // The canvas's horizontal line (12 px wide) crosses the vertical SVG line at 25% of the plot's height.
      const area = box.querySelector(".fixture-plot-area").getBoundingClientRect();
      const point = [area.left + area.width * 0.5, area.top + area.height * 0.25];
      // A canvas ignores the pointer, so let it take it: the hit test then shows what is on top.
      const was = canvas.style.pointerEvents;
      canvas.style.pointerEvents = "auto";
      const hit = document.elementFromPoint(...point);
      canvas.style.pointerEvents = was;
      return { svgPosition: getComputedStyle(svg).position, hitIsVline: hit === vline, hit: hit?.outerHTML.slice(0, 60), canvasPosition: getComputedStyle(canvas).position, pointer: getComputedStyle(canvas).pointerEvents };
    });
    assert.equal(probe.canvasPosition, "absolute");
    assert.equal(probe.pointer, "none");
    assert.equal(probe.svgPosition, "relative", "a positioned svg paints above the positioned canvas whatever the DOM order");
    assert.equal(probe.hitIsVline, true, `the SVG line is on top where a canvas line crosses it (got ${probe.hit})`);
    assert.deepEqual(ctx.errors, []);
  });
});

test("check --played is clean on the fixture deck", async () => {
  assert.deepEqual(await checkPlayed(deck), []);
});

// chart.bar keeps its whisker markup when it moves onto `whisker`: the kit's output is the bar's, byte for byte.
test("whisker markup equals chart.bar's, and a vertical one is the same marks across", async () => {
  const url = "engine/core/render.html?deck=../../test/fixtures/decks/bars/&slide=interval&step=three";
  await withPage({ root, url }, async (page, ctx) => {
    const result = await page.evaluate(async () => {
      const { chartKit } = await import("/engine/core/chart.js");
      const { d3 } = await import("/engine/core/d3.js");
      const num = (node, name) => Number(node.getAttribute(name));
      const bar = document.querySelector('[data-el="bars"] g.sd-whisker').parentNode;
      const whole = bar.querySelector("g.sd-whisker");
      const line = whole.querySelector(".sd-whisker-line");
      const [at, lo, hi] = [num(line, "y1"), num(line, "x1"), num(line, "x2")];
      const cap = num(bar.querySelector("rect"), "height") * 0.45; // as chart.bar computes it
      const make = (orient) => {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        document.querySelector('[data-el="bars"] svg').appendChild(g);
        chartKit.whisker(d3.select(g), { at, lo, hi, cap, orient });
        chartKit.whisker(d3.select(g), { at, lo, hi, cap, orient }); // idempotent
        const html = g.outerHTML;
        const lines = [...g.querySelectorAll("line")].map((l) => ["x1", "y1", "x2", "y2"].map((a) => num(l, a)));
        g.remove();
        return { html, lines };
      };
      return { want: whole.outerHTML, horizontal: make("horizontal"), vertical: make("vertical") };
    });
    assert.equal(result.horizontal.html, result.want, "the same markup as chart.bar's whisker");
    // Vertical: the span runs along y, so every line is the horizontal one with x and y swapped.
    assert.deepEqual(result.vertical.lines, result.horizontal.lines.map(([x1, y1, x2, y2]) => [y1, x1, y2, x2]));
    assert.deepEqual(ctx.errors, []);
  });
});

test("a mark that leaves is removed with its halo copy, however the step is reached", async () => {
  const count = (page) =>
    page.evaluate(() => ({
      extra: document.querySelectorAll('[data-el="marks"] .fixture-extra').length,
      under: document.querySelectorAll('[data-el="marks"] .sd-halo-under').length,
      exiting: document.querySelectorAll('[data-el="marks"] .sd-exiting').length,
    }));
  // Without motion: a jump within the slide and a backward move.
  await withPage({ root, url: pages.url("marks", "step=a") }, async (page, ctx) => {
    assert.deepEqual(await count(page), { extra: 0, under: 1, exiting: 0 }, "step a: the extra mark is not there");
    await goTo(page, "marks", "b");
    assert.deepEqual(await count(page), { extra: 1, under: 2, exiting: 0 }, "step b: it is, with a halo under it");
    await goTo(page, "marks", "a");
    assert.deepEqual(await count(page), { extra: 0, under: 1, exiting: 0 }, "back to a: the leaver and its halo copy are gone");
    await goTo(page, "marks", "b");
    await goTo(page, "marks", "c");
    assert.deepEqual(await count(page), { extra: 0, under: 1, exiting: 0 }, "a jump b -> c removes it too");
    assert.deepEqual(ctx.errors, []);
  });
  // Played forward: the leaver stays through the morph and is gone at its end.
  await withPage({ root, url: pages.url("marks", "step=b&motion=full") }, async (page, ctx) => {
    await goTo(page, "marks", "c");
    assert.deepEqual(await count(page), { extra: 0, under: 1, exiting: 0 }, "played b -> c");
    assert.deepEqual(ctx.errors, []);
  });
});

test("a halo on a dot changes nothing: the dot keeps its outline and its colour", async () => {
  await withPage({ root, url: pages.url("marks", "step=a") }, async (page, ctx) => {
    const look = (selector) => page.evaluate((selector) => {
      const s = getComputedStyle(document.querySelector(selector));
      return { stroke: s.stroke, fill: s.fill, width: s.strokeWidth, order: s.paintOrder };
    }, selector);
    for (const selector of ['[data-el="marks"] .sd-dot-hollow', '[data-el="marks"] .sd-dot:not(.sd-dot-hollow)']) {
      const before = await look(selector);
      await page.evaluate(async (selector) => {
        const { chartKit } = await import("/engine/core/chart.js");
        const { d3 } = await import("/engine/core/d3.js");
        chartKit.halo(d3.select(selector));
      }, selector);
      assert.deepEqual(await look(selector), before, `${selector}: unchanged by a halo`);
      assert.equal(await page.evaluate((selector) => document.querySelector(selector).classList.contains("sd-halo"), selector), true);
    }
    const hollow = await look('[data-el="marks"] .sd-dot-hollow');
    assert.notEqual(hollow.stroke, await tokenRgb(page, "--sd-color-background"), "a hollow dot's stroke is its colour, not the background");
    assert.deepEqual(ctx.errors, []);
  });
});

test("halo under: the copy follows the node's transform, and has its tag", async () => {
  await withPage({ root, url: pages.url("marks", "step=a") }, async (page, ctx) => {
    const out = await page.evaluate(async () => {
      const { chartKit } = await import("/engine/core/chart.js");
      const { d3 } = await import("/engine/core/d3.js");
      const svg = d3.select(document.body).append("svg");
      const path = svg.append("path").attr("class", "probe").attr("d", "M0,0L10,10").attr("transform", "translate(5,7)");
      const copy = chartKit.halo(path, { under: true }).node();
      const first = { tag: copy.localName, transform: copy.getAttribute("transform"), d: copy.getAttribute("d") };
      path.attr("transform", null);
      chartKit.halo(path, { under: true });
      const second = copy.hasAttribute("transform");
      svg.remove();
      return { first, second };
    });
    assert.deepEqual(out.first, { tag: "path", transform: "translate(5,7)", d: "M0,0L10,10" });
    assert.equal(out.second, false, "a transform the node loses, the copy loses");
    assert.deepEqual(ctx.errors, []);
  });
});

test("paintLines breaks a line at a missing value and never draws it to zero", async () => {
  await withPage({ root, url: pages.url("marks", "step=a") }, async (page, ctx) => {
    const out = await page.evaluate(async () => {
      const { chartKit } = await import("/engine/core/chart.js");
      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = 100;
      const alphaAt = (x, y) => canvas.getContext("2d").getImageData(x, y, 1, 1).data[3];
      const gapped = chartKit.paintLines(canvas, [{ points: [[10, 50], [30, 50], [null, 20], [50, null], [70, 50], [90, 50]], color: "#000", width: 6 }]);
      const probes = { left: alphaAt(20, 50), between: alphaAt(50, 50), right: alphaAt(80, 50), towardZero: alphaAt(40, 25), atZero: alphaAt(1, 1), axis: alphaAt(50, 1) };
      const whole = chartKit.paintLines(canvas, [{ points: [[10, 50], [30, 50], [70, 50], [90, 50]], color: "#000", width: 6 }]);
      const again = chartKit.paintLines(canvas, [{ points: [[10, 50], [30, 50], [null, 20], [50, null], [70, 50], [90, 50]], color: "#000", width: 6 }]);
      const empty = chartKit.paintLines(canvas, []);
      const loose = chartKit.paintLines(canvas, [{ points: [[10, 50], [NaN, 50], [30, 50], [Infinity, 0], [70, 70]], color: "#000" }]);
      return { gapped, whole, again, empty, loose, probes, afterLoose: alphaAt(20, 50) };
    });
    assert.ok(out.probes.left > 200 && out.probes.right > 200, "both stretches are drawn");
    assert.equal(out.probes.between, 0, "nothing across the gap");
    assert.deepEqual([out.probes.towardZero, out.probes.atZero, out.probes.axis], [0, 0, 0], "nothing toward zero");
    assert.notEqual(out.gapped, out.whole, "a gap is part of the signature");
    assert.equal(out.gapped, out.again, "the signature is a function of the input");
    assert.equal(out.loose, out.empty, "stretches of one point draw nothing, so the signature is the empty one");
    assert.equal(out.afterLoose, 0, "and the canvas is clear");
    assert.deepEqual(ctx.errors, []);
  });
});

test("axis: ticks keyed by value in the theme's look; a played change fades them in and out, then the leavers are gone", async () => {
  await withPage({ root, url: pages.url("marks", "step=a&motion=full") }, async (page, ctx) => {
    const ticks = (axis) => page.evaluate((axis) => [...document.querySelectorAll(`[data-el="marks"] .fixture-axis-${axis} > g.sd-axis-tick`)].map((g) => ({
      label: g.querySelector("text.sd-axis-label").textContent,
      exiting: g.classList.contains("sd-exiting"),
      opacity: g.getAttribute("opacity"),
      anchor: g.querySelector("text").getAttribute("text-anchor"),
    })), axis);
    const look = await page.evaluate(() => ({
      grid: getComputedStyle(document.querySelector('[data-el="marks"] .sd-axis-grid')).stroke,
      label: getComputedStyle(document.querySelector('[data-el="marks"] .sd-axis-label')).fill,
    }));
    assert.equal(look.grid, await tokenRgb(page, "--sd-color-grid"), "grid lines are the grid colour");
    assert.equal(look.label, await tokenRgb(page, "--sd-color-muted"), "tick labels are the muted colour");
    const atA = await ticks("y");
    assert.deepEqual(atA.map((t) => t.label), ["0", "2", "4", "6", "8", "10"]);
    assert.ok(atA.every((t) => t.anchor === "end" && t.opacity === null && !t.exiting), "y labels end at the axis; at rest no tick has an opacity");
    assert.deepEqual((await ticks("x")).map((t) => [t.label, t.anchor]), ["0", "1", "2", "3", "4", "5"].map((l) => [l, "middle"]));

    await page.evaluate(() => { window.STEPDECK.goTo("marks", "b"); });
    await page.waitForTimeout(120);
    const mid = new Map((await ticks("y")).map((t) => [t.label, t]));
    const between = (t) => t && t.opacity !== null && Number(t.opacity) > 0 && Number(t.opacity) < 1;
    assert.ok(mid.get("2")?.exiting && between(mid.get("2")), "a tick that leaves stays, fading out");
    assert.ok(!mid.get("15")?.exiting && between(mid.get("15")), "a new tick fades in");
    assert.equal(mid.get("10")?.opacity, null, "a tick on both steps stays at full opacity");

    await page.evaluate(() => window.STEPDECK.settled());
    const atB = await ticks("y");
    assert.deepEqual(atB.map((t) => t.label), ["0", "5", "10", "15", "20"], "the leavers are gone");
    assert.ok(atB.every((t) => t.opacity === null && !t.exiting));
    assert.deepEqual(ctx.errors, []);
  });
});
