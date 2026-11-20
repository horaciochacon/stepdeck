// Layouts title and figure-notes, and the academic-light theme's vendored fonts, in Chrome (spec §6.1, §7).
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const url = (slide, q = "") => `core/render.html?deck=../test/fixtures/decks/layouts/&slide=${slide}&${q}`;

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

test("figure-notes regions exist and notes width variable overrides", async () => {
  await withPage({ root, url: url("notes-default") }, async (page, ctx) => {
    const d = await boxes(page);
    assert.deepEqual(d.order, ["title", "main", "notes", "footer"]);
    assert.equal(d.regions.notes.w, 560, "default --notes-width");
    assert.ok(d.regions.main.x + d.regions.main.w <= d.regions.notes.x, "notes to the right of main");
    assert.ok(d.regions.title.y + d.regions.title.h <= d.regions.main.y, "title above the figure");
    assert.ok(d.regions.footer.y >= d.regions.main.y + d.regions.main.h, "footer below the figure");
    assert.ok(d.regions.footer.y + d.regions.footer.h <= 1080);
    assert.equal(d.regions.main.y, d.regions.notes.y, "figure and notes share a row");
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);

    await ctx.open(url("notes-wide"));
    const w = await boxes(page);
    assert.equal(w.regions.notes.w, 700, "regions: { --notes-width: 700px }");
    assert.equal(w.regions.main.w, d.regions.main.w - 140, "main gives up the difference");
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});

test("title layout: title, subtitle, meta and footer stacked, left-aligned on the margin", async () => {
  await withPage({ root, url: url("cover") }, async (page, ctx) => {
    const d = await boxes(page);
    assert.deepEqual(d.order, ["title", "subtitle", "meta", "figure", "footer"]);
    const { title, subtitle, meta, venue: footer } = d.els;
    assert.ok(title.y + title.h <= subtitle.y, "subtitle below the title");
    assert.ok(subtitle.y + subtitle.h <= meta.y, "meta below the subtitle");
    assert.ok(meta.y + meta.h <= footer.y, "footer last");
    assert.ok(footer.y + footer.h <= 1080);
    assert.equal(title.x, subtitle.x);
    assert.equal(title.x, meta.x);
    assert.ok(title.x >= 96, "inside the canvas margin");
    const sizes = await page.evaluate(() =>
      Object.fromEntries(["title", "subtitle", "meta", "venue"].map((id) => [
        id, parseFloat(getComputedStyle(document.querySelector(`[data-el="${id}"] .sd-text`)).fontSize),
      ])),
    );
    assert.ok(sizes.title > sizes.subtitle && sizes.subtitle > sizes.meta, JSON.stringify(sizes));
    for (const [id, px] of Object.entries(sizes)) assert.ok(px >= 28, `${id} is ${px}px`);
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});

const THEMES = ["academic-light", "modern"];
const marginOf = (page) => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".sd-canvas")).getPropertyValue("--sd-canvas-margin")));

// Cover geometry (default-theme spec §10.3): the kicker on the top margin, title and subtitle in the upper
// middle, the meta block on the bottom margin with the footer line below it.
test("cover kicker on the top margin", async () => {
  for (const theme of THEMES) {
    await withPage({ root, url: url("cover-kicker", `theme=${theme}`) }, async (page, ctx) => {
      const d = await boxes(page);
      const margin = await marginOf(page);
      assert.equal(margin, 96, theme);
      const { kicker, title, subtitle } = d.els;
      assert.ok(kicker, `${theme}: a kicker element`);
      assert.ok(kicker.y >= margin && kicker.y <= margin + 8, `${theme}: kicker top ${kicker.y} within ${margin}..${margin + 8}`);
      assert.ok(kicker.y + kicker.h <= title.y, `${theme}: kicker above the title`);
      assert.equal(kicker.x, title.x, `${theme}: kicker on the title's left edge`);
      // Title and subtitle in the upper middle: the block's centre is above the canvas centre.
      const centre = (title.y + subtitle.y + subtitle.h) / 2;
      assert.ok(centre < 540, `${theme}: title and subtitle centre ${centre} above the middle`);
      // The kicker takes the free space after it, so the title sits on the bottom of the band (a short title
      // under the kicker would leave the band's room above the subtitle instead).
      const band = d.regions.title;
      assert.ok(Math.abs(band.y + band.h - (title.y + title.h)) <= 1, `${theme}: the title ends where the band ends`);
      assert.ok(title.y - (kicker.y + kicker.h) > 100, `${theme}: the kicker is not jammed against the title (${title.y - (kicker.y + kicker.h)}px apart)`);
      assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
      assert.deepEqual(ctx.errors, []);
    });
  }
});

test("cover meta on the bottom margin", async () => {
  for (const theme of THEMES) {
    await withPage({ root, url: url("cover-kicker", `theme=${theme}`) }, async (page, ctx) => {
      const d = await boxes(page);
      const margin = await marginOf(page);
      const { subtitle, meta, meta2, venue } = d.els;
      for (const [name, el] of Object.entries({ meta, meta2 })) {
        assert.ok(el.y + el.h <= venue.y, `${theme}: ${name} above the footer line`);
        assert.ok(el.y + el.h >= 1080 - 2 * margin, `${theme}: ${name} bottom ${el.y + el.h} within 2 margins of the canvas bottom`);
      }
      assert.ok(meta.y + meta.h <= meta2.y, `${theme}: meta lines stack`);
      assert.ok(subtitle.y + subtitle.h < meta.y, `${theme}: a gap between the subtitle and the meta block`);
      assert.ok(venue.y + venue.h <= 1080);
      // The region holds exactly the meta lines, so a rule drawn on it (a theme's accent bar) is as tall as the text.
      const region = d.regions.meta;
      assert.ok(Math.abs(region.y - meta.y) <= 1, `${theme}: the meta region starts at its first line`);
      assert.ok(Math.abs(region.y + region.h - (meta2.y + meta2.h)) <= 1, `${theme}: and ends at its last (${region.y + region.h} vs ${meta2.y + meta2.h})`);
      assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
      assert.deepEqual(ctx.errors, []);
    });
  }
});

test("cover without a kicker: the title sits on the bottom of the top band, not at the top margin", async () => {
  for (const theme of THEMES) {
    await withPage({ root, url: url("cover", `theme=${theme}`) }, async (page) => {
      const d = await boxes(page);
      assert.equal(d.els.kicker, undefined);
      const band = d.regions.title;
      assert.equal(band.y, 96, `${theme}: the band starts on the top margin`);
      assert.ok(Math.abs(band.y + band.h - (d.els.title.y + d.els.title.h)) <= 1, `${theme}: the title ends where the band ends`);
      assert.ok(d.els.subtitle.y >= band.y + band.h, `${theme}: the subtitle follows the band`);
      assert.ok(d.els.subtitle.y + d.els.subtitle.h < 600, `${theme}: title and subtitle stay in the upper middle`);
    });
  }
});

test("academic-light: vendored fonts load from the theme folder and are in use", async () => {
  await withPage({ root, url: url("cover") }, async (page, ctx) => {
    const fonts = await page.evaluate(() => ({
      faces: [...document.fonts].map((f) => ({ family: f.family.replace(/"/g, ""), weight: f.weight, style: f.style, status: f.status })),
      sans: document.fonts.check('400 40px "Source Sans 3"'),
      mono: document.fonts.check('400 28px "IBM Plex Mono"'),
      family: getComputedStyle(document.querySelector('[data-el="title"] .sd-text')).fontFamily,
    }));
    const loaded = fonts.faces.filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight} ${f.style}`);
    for (const face of ["Source Sans 3 400 normal", "Source Sans 3 600 normal", "IBM Plex Mono 400 normal"]) {
      assert.ok(loaded.includes(face), `${face} loaded (loaded: ${loaded.join(", ")})`);
    }
    assert.ok(fonts.sans && fonts.mono);
    assert.match(fonts.family, /^"?Source Sans 3"?,/);
    const woff = ctx.requests.filter((u) => u.endsWith(".woff2"));
    assert.ok(woff.length > 0);
    for (const u of woff) assert.match(u, /\/themes\/academic-light\/fonts\/(source-sans-3|ibm-plex-mono)\/[\w-]+\.woff2$/);
    assert.deepEqual(ctx.errors, []);
  });
});
