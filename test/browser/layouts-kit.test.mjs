// Kit layouts statement, halves and title-with-figure, in Chrome.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const kit = (slide) => `engine/core/render.html?deck=../../test/fixtures/decks/layouts-kit/&slide=${slide}`;
const spike = (slide) => `engine/core/render.html?deck=../../examples/spike/&slide=${slide}`;

// Canvas-pixel boxes (offset*, unaffected by the shell's scale) of every region and element.
const boxes = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector(".sd-canvas");
    const box = (el) => {
      let x = 0, y = 0;
      for (let n = el; n && n !== canvas; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
      return { x, y, w: el.offsetWidth, h: el.offsetHeight };
    };
    const out = { regions: {}, els: {} };
    for (const r of canvas.querySelectorAll(":scope > .sd-region")) out.regions[r.dataset.region] = box(r);
    for (const e of canvas.querySelectorAll(".sd-el")) out.els[e.dataset.el] = box(e);
    out.order = [...canvas.querySelectorAll(":scope > .sd-region")].map((r) => r.dataset.region);
    return out;
  });

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test("statement centres its main text", async () => {
  await withPage({ root, url: kit("statement") }, async (page, ctx) => {
    // The text's own box (a range over its lines), in canvas pixels.
    const m = await page.evaluate(() => {
      const canvas = document.querySelector(".sd-canvas");
      const k = canvas.getBoundingClientRect().width / canvas.offsetWidth;
      const p = document.querySelector('[data-el="claim"] .sd-text');
      const range = document.createRange();
      range.selectNodeContents(p);
      const r = range.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      return {
        cx: (r.left + r.width / 2 - c.left) / k,
        cy: (r.top + r.height / 2 - c.top) / k,
        w: r.width / k,
        fontSize: getComputedStyle(p).fontSize,
        token: getComputedStyle(canvas).getPropertyValue("--sd-font-size-statement").trim(),
        align: getComputedStyle(p).textAlign,
        lines: Math.round(r.height / k / parseFloat(getComputedStyle(p).lineHeight)),
      };
    });
    assert.equal(m.token, "64px", "the theme defines --sd-font-size-statement");
    assert.equal(m.fontSize, m.token, "main text uses the statement size");
    assert.ok(Math.abs(m.cx - 960) <= 4, `horizontal centre ${m.cx}`);
    assert.ok(m.cy > 360 && m.cy < 720, `vertical centre ${m.cy} inside the middle third`);
    assert.ok(m.w <= 1500, `text measure ${m.w} within --statement-width`);
    assert.ok(m.lines >= 2, "the sentence wraps (balanced) inside the measure");
    const d = await boxes(page);
    assert.deepEqual(d.order, ["title", "main", "footer"]);
    assert.equal(d.regions.main.w, 1500, "default --statement-width");
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});

test("statement: a markdown main element takes the statement size, centred and balanced, bold kept", async () => {
  await withPage({ root, url: kit("statement-markdown") }, async (page, ctx) => {
    const m = await page.evaluate(() => {
      const canvas = document.querySelector(".sd-canvas");
      const k = canvas.getBoundingClientRect().width / canvas.offsetWidth;
      const md = document.querySelector('[data-el="claim"] .sd-markdown');
      const p = md.querySelector("p");
      const range = document.createRange();
      range.selectNodeContents(p);
      const r = range.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      const cs = getComputedStyle(p);
      return {
        fontSize: cs.fontSize,
        token: getComputedStyle(canvas).getPropertyValue("--sd-font-size-statement").trim(),
        align: cs.textAlign,
        wrap: cs.textWrap || cs.textWrapStyle,
        cx: (r.left + r.width / 2 - c.left) / k,
        lines: Math.round(r.height / k / parseFloat(cs.lineHeight)),
        strong: md.querySelector("strong")?.textContent,
        strongSize: md.querySelector("strong") ? getComputedStyle(md.querySelector("strong")).fontSize : null,
      };
    });
    assert.equal(m.token, "64px");
    assert.equal(m.fontSize, "64px", "markdown paragraph uses --sd-font-size-statement");
    assert.equal(m.strongSize, "64px", "bold words keep the statement size");
    assert.equal(m.strong, "above");
    assert.equal(m.align, "center");
    assert.match(m.wrap, /balance/, `text-wrap ${m.wrap}`);
    assert.ok(Math.abs(m.cx - 960) <= 4, `horizontal centre ${m.cx}`);
    assert.ok(m.lines >= 2, "the sentence wraps inside the measure");
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});

test("statement: an optional title sits above and the main text stays centred", async () => {
  await withPage({ root, url: kit("statement-title") }, async (page, ctx) => {
    const d = await boxes(page);
    assert.ok(d.regions.title.y + d.regions.title.h <= d.regions.main.y, "title above main");
    const cy = d.els.claim.y + d.els.claim.h / 2;
    assert.ok(Math.abs(cy - 540) <= 40, `main text vertical centre ${cy} stays near the canvas centre`);
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});

test("halves splits the canvas", async () => {
  await withPage({ root, url: kit("halves-default") }, async (page, ctx) => {
    const d = await boxes(page);
    assert.deepEqual(d.order, ["title", "left", "right", "footer"]);
    const { left, right, title, footer } = d.regions;
    assert.ok(Math.abs(left.w - right.w) <= 1, `equal halves: ${left.w} vs ${right.w}`);
    assert.equal(left.y, right.y, "halves share a row");
    assert.ok(left.x + left.w <= right.x, "left of right");
    assert.equal(right.x - (left.x + left.w), 24, "default --gutter is --sd-region-gap");
    assert.ok(title.y + title.h <= left.y, "title above the halves");
    assert.ok(left.y + left.h <= footer.y, "footer below the halves");
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);

    await ctx.open(kit("halves-wide"));
    const w = await boxes(page);
    assert.ok(Math.abs(w.regions.left.w - 2 * w.regions.right.w) <= 1, `2fr 1fr: ${w.regions.left.w} vs ${w.regions.right.w}`);
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});

test("halves --align: start by default, center centres the content of both halves", async () => {
  // Vertical extent of the visible content in a region (text ranges), in canvas pixels, and the region's own.
  const extents = (page) =>
    page.evaluate(() => {
      const canvas = document.querySelector(".sd-canvas");
      const k = canvas.getBoundingClientRect().width / canvas.offsetWidth;
      const c = canvas.getBoundingClientRect();
      const out = {};
      for (const name of ["left", "right"]) {
        const region = canvas.querySelector(`:scope > [data-region="${name}"]`);
        const r = region.getBoundingClientRect();
        const style = getComputedStyle(region);
        // Union of the text nodes' own boxes (an element's box would include a stretched element's empty space).
        let top = Infinity, bottom = -Infinity;
        const walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          const t = range.getBoundingClientRect();
          top = Math.min(top, t.top);
          bottom = Math.max(bottom, t.bottom);
        }
        out[name] = {
          top: (r.top - c.top) / k + parseFloat(style.paddingTop),
          bottom: (r.bottom - c.top) / k - parseFloat(style.paddingBottom),
          textTop: (top - c.top) / k,
          textBottom: (bottom - c.top) / k,
        };
      }
      return out;
    });
  await withPage({ root, url: kit("halves-default") }, async (page, ctx) => {
    const d = await extents(page);
    for (const half of ["left", "right"]) assert.ok(Math.abs(d[half].textTop - d[half].top) <= 12, `${half}: content starts at the top by default (${JSON.stringify(d[half])})`);

    await ctx.open(kit("halves-align"));
    const a = await extents(page);
    for (const half of ["left", "right"]) {
      const above = a[half].textTop - a[half].top;
      const below = a[half].bottom - a[half].textBottom;
      assert.ok(above > 100, `${half}: content moved down from the top (${above}px above)`);
      assert.ok(Math.abs(above - below) <= 24, `${half}: content centred (${above}px above, ${below}px below)`);
    }
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});

// The spike deck's cover region and element boxes under academic-light. They moved on purpose with the cover
// geometry: the title region spans the top rows with the title at the bottom
// of the band, and the meta block sits on the bottom margin above the footer line. Before, the cover was
// centred a little above the middle (title y 355, subtitle 488, meta 607). With no element in `figure` the layout
// is still the plain one-column cover, whatever the figure region does.
const COVER_PLAIN = {
  regions: {
    title: { x: 96, y: 96, w: 1400, h: 373 },
    subtitle: { x: 96, y: 469, w: 1400, h: 87 },
    meta: { x: 96, y: 930, w: 1400, h: 42 },
    footer: { x: 96, y: 972, w: 1728, h: 60 },
  },
  els: {
    title: { x: 96, y: 368, w: 1400, h: 101 },
    subtitle: { x: 96, y: 501, w: 1400, h: 55 },
    meta: { x: 96, y: 930, w: 1400, h: 42 },
    src: { x: 96, y: 996, w: 1728, h: 36 },
  },
};

test("title without figure keeps the one-column cover", async () => {
  await withPage({ root, url: spike("cover") }, async (page, ctx) => {
    const d = await boxes(page);
    for (const name of Object.keys(COVER_PLAIN.regions)) assert.deepEqual(d.regions[name], COVER_PLAIN.regions[name], `region ${name}`);
    assert.deepEqual(d.els, COVER_PLAIN.els);
    // The new, empty figure region sits in the spare right column and overlaps nothing.
    for (const name of Object.keys(COVER_PLAIN.regions)) assert.ok(!overlap(d.regions[name], d.regions.figure), `${name} vs the empty figure`);
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});

test("title with figure makes two columns", async () => {
  await withPage({ root, url: kit("cover-figure") }, async (page, ctx) => {
    const d = await boxes(page);
    const { title, subtitle, meta, figure, footer } = d.regions;
    assert.equal(figure.w, 720, "default --figure-width");
    assert.equal(figure.x + figure.w, 1920 - 96, "figure on the right margin");
    for (const [name, r] of Object.entries({ title, subtitle, meta })) {
      assert.ok(r.x + r.w <= figure.x, `${name} column is left of the figure`);
      assert.ok(!overlap(r, figure), `${name} does not overlap the figure`);
    }
    assert.equal(title.x, 96);
    assert.equal(title.x, subtitle.x);
    assert.equal(title.x, meta.x);
    assert.ok(title.w > 720, `the title column takes the remaining width (${title.w})`);
    assert.ok(title.y + title.h <= subtitle.y && subtitle.y + subtitle.h <= meta.y, "title, subtitle, meta still stack");
    assert.ok(figure.y + figure.h <= footer.y, "footer below the figure");
    assert.ok(meta.y + meta.h <= footer.y);
    assert.ok(footer.y + footer.h <= 1080);
    const els = d.els;
    assert.ok(!overlap(els.title, els.figure) && !overlap(els.subtitle, els.figure) && !overlap(els.meta, els.figure));
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);

    await ctx.open(kit("cover-figure-wide"));
    const w = await boxes(page);
    assert.equal(w.regions.figure.w, 900, "regions: { --figure-width: 900px }");
    assert.ok(w.regions.title.x + w.regions.title.w <= w.regions.figure.x);
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});

// Cover with a figure and a ~40 character title: the title stays within
// 3 lines at 1920 under both themes, and the kicker and the meta block still sit on the margins.
test("cover with figure keeps the title to 3 lines or fewer, kicker on the top margin, meta on the bottom", async () => {
  for (const theme of ["academic-light", "modern"]) {
    await withPage({ root, url: `${kit("cover-figure-long")}&theme=${theme}` }, async (page, ctx) => {
      const d = await boxes(page);
      const m = await page.evaluate(() => {
        const t = document.querySelector('[data-el="title"] .sd-text');
        const cs = getComputedStyle(t);
        return { lines: Math.round(t.offsetHeight / parseFloat(cs.lineHeight)), size: cs.fontSize, margin: parseFloat(getComputedStyle(document.querySelector(".sd-canvas")).getPropertyValue("--sd-canvas-margin")) };
      });
      assert.ok(m.lines >= 1 && m.lines <= 3, `${theme}: the title takes ${m.lines} lines at ${m.size}`);
      const { kicker, title, subtitle, meta, figure, venue } = d.els;
      assert.ok(kicker.y >= m.margin && kicker.y <= m.margin + 8, `${theme}: kicker top ${kicker.y}`);
      assert.ok(kicker.y + kicker.h <= title.y, `${theme}: kicker above the title`);
      assert.ok(title.y + title.h <= subtitle.y && subtitle.y + subtitle.h <= meta.y, `${theme}: title, subtitle, meta stack`);
      assert.ok(meta.y + meta.h <= venue.y && meta.y + meta.h >= 1080 - 2 * m.margin, `${theme}: meta ${meta.y + meta.h} above the footer, on the bottom margin`);
      for (const [name, el] of Object.entries({ kicker, title, subtitle, meta })) assert.ok(!overlap(el, figure), `${theme}: ${name} does not overlap the figure`);
      assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
      assert.deepEqual(ctx.errors, []);
    });
  }
});
