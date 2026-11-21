// Cascade layers, theme.css and the published styling hooks, in Chrome.
//
// Two temporary engine copies (like a `stepdeck new` deck, never under the shipped layouts/):
//   plain    the engine plus a fourth layout (test/fixtures/fourth-layout) that knows nothing about any theme;
//   fixture  the same, with test-only rules appended to both themes' theme.css. Those rules are more specific
//            than the rules they must lose to, so a pass proves the layer order, not selector specificity.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/theme-hooks.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { runCheck } from "../../cli/check.js";
import { dump } from "../../cli/dump.js";
import { spawnSync } from "node:child_process";
import { formatProblem } from "../../cli/problems.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deckTarget, withPage } from "../../cli/browser.js";
import { tokenRgb } from "./helpers.mjs";
import { ENGINE, copyEngine } from "../../cli/engine.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const THEMES = ["academic-light", "modern"];
const TITLE = "Response rises with dose";
const CONTENT_LAYOUTS = ["figure-notes", "full-bleed", "halves", "statement", "fourth"];

// Test-only theme rules. Specificity (0,4,0) each: both beat the rules they must lose to
// ([data-slide] .sd-title .sd-text is (0,3,0); .sd-el.sd-collapsed is (0,2,0)) on specificity alone.
const FIXTURE_RULES = `
/* test fixture (theme-hooks.test.mjs) */
.sd-canvas .sd-region .sd-title .sd-text { color: rgb(200, 0, 0); }
.sd-canvas .sd-region .sd-title .sd-markdown p { color: rgb(200, 0, 0); }
.sd-canvas .sd-region .sd-el.sd-meta { display: flex; }
.sd-canvas .sd-region .sd-el.sd-subtitle { visibility: visible; }
`;

const slides = {
  ...Object.fromEntries(CONTENT_LAYOUTS.map((layout) => [`l-${layout}`, {
    id: `l-${layout}`, layout, title: TITLE,
    elements: [{ id: "body", region: layout === "halves" ? "left" : "main", type: "text", props: { text: "Body text." } }],
  }])),
  cover: {
    id: "cover", layout: "title", title: "A cover",
    elements: [
      { id: "subtitle", region: "subtitle", type: "text", props: { text: "Subtitle" } },
      { id: "meta", region: "meta", type: "text", props: { text: "Author" } },
    ],
  },
  "cover-figure": {
    id: "cover-figure", layout: "title", title: "A cover with a figure",
    elements: [{ id: "fig", region: "figure", type: "text", props: { text: "Figure stand-in" } }],
  },
  // A markdown element with the reserved id `title` (not the text sugar).
  ...Object.fromEntries(["full-bleed", "fourth"].map((layout) => [`md-${layout}`, {
    id: `md-${layout}`, layout,
    elements: [
      { id: "title", region: "title", type: "markdown", props: { md: "A **markdown** title" } },
      { id: "body", region: "main", type: "text", props: { text: "Body text." } },
    ],
  }])),
  "styled-md": {
    id: "styled-md", layout: "full-bleed", style: ".sd-title .sd-markdown p { color: rgb(1, 2, 3); }",
    elements: [{ id: "title", region: "title", type: "markdown", props: { md: "A **markdown** title" } }],
  },
  styled: {
    id: "styled", layout: "full-bleed", title: TITLE, style: ".sd-title .sd-text { color: rgb(1, 2, 3); }",
    elements: [{ id: "body", type: "text", props: { text: "Body text." } }],
  },
  states: {
    id: "states", layout: "title", title: "States",
    elements: [
      { id: "shown", region: "meta", type: "text", props: { text: "Always shown" } },
      { id: "later", region: "meta", type: "text", from: "two", props: { text: "Hidden at one" } },
      { id: "gone", region: "meta", type: "text", from: "two", collapse: true, props: { text: "Collapsed at one" } },
      { id: "sub", region: "subtitle", type: "text", from: "two", props: { text: "Hidden subtitle at one" } },
    ],
    steps: [{ id: "one" }, { id: "two" }],
  },
};

function makeDeck(dir, { themeRules = "", deckSlides = slides, theme = "academic-light", themes = {} } = {}) {
  copyEngine(join(dir, "stepdeck"));
  // themes: { <new theme>: [<file of academic-light to leave out>] }
  for (const [name, omit] of Object.entries(themes)) {
    cpSync(join(ENGINE, "themes/academic-light"), join(dir, "stepdeck/themes", name), { recursive: true, filter: (src) => !omit.some((f) => src.endsWith(`/${f}`)) });
  }
  cpSync(join(repo, "test/fixtures/fourth-layout"), join(dir, "stepdeck/layouts/fourth"), { recursive: true });
  if (themeRules) for (const t of THEMES) appendFileSync(join(dir, "stepdeck/themes", t, "theme.css"), themeRules);
  mkdirSync(join(dir, "slides"));
  for (const [id, spec] of Object.entries(deckSlides)) writeFileSync(join(dir, "slides", `${id}.js`), `export default ${JSON.stringify(spec)};\n`);
  writeFileSync(join(dir, "deck.js"), `export default ${JSON.stringify({ title: "hooks", lang: "en", theme, slides: Object.keys(deckSlides) })};\n`);
  return deckTarget(dir);
}

let tmp;
let plain;
let fixture;
before(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "stepdeck-hooks-")));
  plain = makeDeck(join(tmp, "plain"));
  fixture = makeDeck(join(tmp, "fixture"), { themeRules: FIXTURE_RULES });
});
after(() => rmSync(tmp, { recursive: true, force: true }));

const urlFor = (target, slide, theme, step) => target.url({ slide, step, query: theme === "academic-light" ? {} : { theme } });
const typography = (page, sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { family: cs.fontFamily, size: cs.fontSize, weight: cs.fontWeight, letterSpacing: cs.letterSpacing, color: cs.color };
}, sel);
const clean = async (page, ctx) => {
  assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
  assert.deepEqual(ctx.failed, []);
  assert.deepEqual(ctx.errors, []);
};

test("hook classes present: title, subtitle, meta, statement on regions and wrappers; data-kind on the canvas", async () => {
  await withPage({ root: plain.root, url: urlFor(plain, "cover", "academic-light") }, async (page, ctx) => {
    const cover = await page.evaluate(() => ({
      kind: document.querySelector(".sd-canvas").dataset.kind,
      title: document.querySelector('[data-el="title"]').classList.contains("sd-title"),
      subtitleRegion: document.querySelector('[data-region="subtitle"]').classList.contains("sd-subtitle"),
      subtitleEl: document.querySelector('[data-el="subtitle"]').classList.contains("sd-subtitle"),
      metaRegion: document.querySelector('[data-region="meta"]').classList.contains("sd-meta"),
      metaEl: document.querySelector('[data-el="meta"]').classList.contains("sd-meta"),
      titleContainer: getComputedStyle(document.querySelector('[data-region="title"]')).containerType,
    }));
    assert.deepEqual(cover, { kind: "cover", title: true, subtitleRegion: true, subtitleEl: true, metaRegion: true, metaEl: true, titleContainer: "inline-size" });
    await clean(page, ctx);

    await ctx.open(urlFor(plain, "l-statement", "academic-light"));
    const statement = await page.evaluate(() => ({
      kind: document.querySelector(".sd-canvas").dataset.kind,
      region: document.querySelector('[data-region="main"]').classList.contains("sd-statement"),
      wrapper: document.querySelector('[data-el="body"]').classList.contains("sd-statement"),
      title: document.querySelector('[data-el="title"]').classList.contains("sd-title"),
      titleRegionHooked: document.querySelector('[data-region="title"]').classList.contains("sd-statement"),
    }));
    assert.deepEqual(statement, { kind: "content", region: true, wrapper: true, title: true, titleRegionHooked: false });
    await clean(page, ctx);
  });
});

test("slide style beats theme.css (on the text node), and the theme rule really applies elsewhere", async () => {
  for (const theme of THEMES) {
    await withPage({ root: fixture.root, url: urlFor(fixture, "styled", theme) }, async (page, ctx) => {
      const color = (sel) => page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).color, sel);
      assert.equal(await color('[data-el="title"] .sd-text'), "rgb(1, 2, 3)", `${theme}: the slide's own style wins`);
      await clean(page, ctx);
      await ctx.open(urlFor(fixture, "l-full-bleed", theme));
      assert.equal(await color('[data-el="title"] .sd-text'), "rgb(200, 0, 0)", `${theme}: control, the fixture theme.css is loaded and applies`);
      await clean(page, ctx);
      // The same with a markdown element as the title.
      await ctx.open(urlFor(fixture, "styled-md", theme));
      assert.equal(await color('[data-el="title"].sd-title .sd-markdown p'), "rgb(1, 2, 3)", `${theme}: markdown title, the slide's own style wins`);
      await clean(page, ctx);
      await ctx.open(urlFor(fixture, "md-full-bleed", theme));
      assert.equal(await color('[data-el="title"].sd-title .sd-markdown p'), "rgb(200, 0, 0)", `${theme}: markdown title, control`);
      await clean(page, ctx);
    });
  }
});

test("slide style on the hook elements (.sd-title, .sd-kicker) beats theme.css under both themes", async () => {
  const deckSlides = {
    hooked: {
      id: "hooked", layout: "full-bleed", section: "Methods", title: "A *styled* title",
      style: ".sd-title { color: rgb(255, 0, 0); letter-spacing: 3px; } .sd-kicker { color: rgb(0, 170, 0); text-transform: none; }",
      elements: [{ id: "body", type: "text", props: { text: "Body text." } }],
    },
    "hooked-cover": {
      id: "hooked-cover", layout: "title", title: "A cover", style: ".sd-title { letter-spacing: 3px; }",
      elements: [{ id: "meta", region: "meta", type: "text", props: { text: "Author" } }],
    },
  };
  const target = makeDeck(join(tmp, "hook-style"), { deckSlides });
  for (const theme of THEMES) {
    await withPage({ root: target.root, url: urlFor(target, "hooked", theme) }, async (page, ctx) => {
      const got = await page.evaluate(() => {
        const t = getComputedStyle(document.querySelector('[data-el="title"] .sd-text'));
        const k = getComputedStyle(document.querySelector('[data-el="kicker"] .sd-text'));
        return { title: [t.color, t.letterSpacing], kicker: [k.color, k.textTransform] };
      });
      assert.deepEqual(got, { title: ["rgb(255, 0, 0)", "3px"], kicker: ["rgb(0, 170, 0)", "none"] }, theme);
      await clean(page, ctx);
      await ctx.open(urlFor(target, "hooked-cover", theme));
      const cover = await page.evaluate(() => getComputedStyle(document.querySelector('[data-el="title"] .sd-text')).letterSpacing);
      assert.equal(cover, "3px", `${theme}: cover title tracking from the slide style`);
      await clean(page, ctx);
    });
  }
});

test("dump under a theme with no theme.css: no error for the optional file, exit 0", async () => {
  const one = { only: { id: "only", layout: "full-bleed", title: TITLE, elements: [{ id: "body", type: "text", props: { text: "Body text." } }] } };
  const dir = join(tmp, "dump-plain");
  makeDeck(dir, { deckSlides: one, themes: { plain: ["theme.css"] } });
  const out = await dump(dir, { theme: "plain" });
  assert.deepEqual(out.flatMap((d) => d.errors), []);
  const cli = spawnSync(process.execPath, [join(repo, "cli/index.js"), "dump", dir, "--theme", "plain"], { encoding: "utf8", env: process.env });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
});

test("state rules survive layers: hidden and collapsed hooked elements stay hidden under both themes", async () => {
  for (const theme of THEMES) {
    await withPage({ root: fixture.root, url: urlFor(fixture, "states", theme, "one") }, async (page, ctx) => {
      const read = () => page.evaluate(() => Object.fromEntries(["shown", "later", "gone", "sub"].map((id) => {
        const cs = getComputedStyle(document.querySelector(`[data-el="${id}"]`));
        return [id, `${cs.display} ${cs.visibility}`];
      })));
      assert.deepEqual(await read(), {
        shown: "flex visible", // control: the fixture theme.css reaches .sd-meta
        later: "flex hidden",
        gone: "none hidden",
        sub: "block hidden", // the fixture's visibility: visible on .sd-subtitle loses to the state rule
      }, theme);
      await page.evaluate(() => window.STEPDECK.goTo("states", "two"));
      await page.evaluate(() => window.STEPDECK.settled());
      assert.deepEqual(await read(), { shown: "flex visible", later: "flex visible", gone: "flex visible", sub: "block visible" }, `${theme}: step two`);
      await clean(page, ctx);
    });
  }
});

test("fourth layout gets title styling, and the title typography is invariant across content layouts", async () => {
  for (const theme of THEMES) {
    await withPage({ root: plain.root, url: urlFor(plain, "l-fourth", theme) }, async (page, ctx) => {
      const seen = {};
      for (const layout of CONTENT_LAYOUTS) {
        await ctx.open(urlFor(plain, `l-${layout}`, theme));
        seen[layout] = await typography(page, '[data-el="title"].sd-title .sd-text');
        await clean(page, ctx);
      }
      for (const layout of CONTENT_LAYOUTS) assert.deepEqual(seen[layout], seen["figure-notes"], `${theme}: ${layout} title matches figure-notes`);
      // The values come from the theme's tokens, so the fourth layout really is themed (not just equal).
      const expected = theme === "modern"
        ? { size: "64px", weight: "600", letterSpacing: "-1.92px", color: "rgb(9, 9, 11)", family: /^Geist,/ }
        : { size: "64px", weight: "600", letterSpacing: "normal", color: "rgb(28, 28, 30)", family: /^"Source Sans 3",/ };
      const { family, ...rest } = seen.fourth;
      assert.match(family, expected.family, theme);
      assert.deepEqual(rest, { size: expected.size, weight: expected.weight, letterSpacing: expected.letterSpacing, color: expected.color }, theme);
      // A markdown title on the fourth layout gets the same title typography as on a stock layout and as the text title.
      const md = {};
      for (const layout of ["full-bleed", "fourth"]) {
        await ctx.open(urlFor(plain, `md-${layout}`, theme));
        md[layout] = await typography(page, '[data-el="title"].sd-title .sd-markdown p');
        await clean(page, ctx);
      }
      assert.deepEqual(md.fourth, md["full-bleed"], `${theme}: markdown title, fourth matches full-bleed`);
      assert.deepEqual(md.fourth, seen.fourth, `${theme}: markdown title matches the text title`);
    });
  }
});

test("cover title: the cover size, and the cover-figure size once the figure region holds an element", async () => {
  const sizes = { "academic-light": ["88px", "88px"], modern: ["140px", "96px"] }; // tokens: cover, cover-figure
  for (const theme of THEMES) {
    await withPage({ root: plain.root, url: urlFor(plain, "cover", theme) }, async (page, ctx) => {
      const size = () => page.evaluate(() => getComputedStyle(document.querySelector('[data-el="title"] .sd-text')).fontSize);
      const plainCover = await size();
      await clean(page, ctx);
      await ctx.open(urlFor(plain, "cover-figure", theme));
      assert.deepEqual([plainCover, await size()], sizes[theme], theme);
      await clean(page, ctx);
    });
  }
});

test("academic-light unchanged on content slides: the spike trend title matches HEAD", async () => {
  await withPage({ root: repo, url: "engine/core/render.html?deck=../../examples/spike/&slide=trend" }, async (page, ctx) => {
    const t = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('[data-el="title"] .sd-text'));
      return { size: cs.fontSize, weight: cs.fontWeight, color: cs.color, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing };
    });
    // Captured from b48013f (before the layers) with academic-light.
    assert.deepEqual(t, { size: "64px", weight: "600", color: "rgb(28, 28, 30)", lineHeight: "73.6px", letterSpacing: "normal" });
    const body = await typography(page, '[data-el="n1"] .sd-text');
    assert.equal(body.size, "40px");
    assert.equal(body.color, "rgb(28, 28, 30)");
    await clean(page, ctx);

    // A list on the statement layout keeps its own type: start-aligned, body size, the bold word in place.
    await ctx.open("engine/core/render.html?deck=../../examples/kit/&slide=criteria&step=a&theme=academic-light"); // kit is on modern now
    const list = await page.evaluate(() => {
      const c = document.querySelector(".sd-canvas").getBoundingClientRect();
      const li = getComputedStyle(document.querySelector(".sd-list-item"));
      const r = document.querySelector(".sd-list-text strong").getBoundingClientRect();
      return { textAlign: li.textAlign, size: li.fontSize, strong: [Math.round(r.x - c.x), Math.round(r.y - c.y)] };
    });
    assert.deepEqual(list, { textAlign: "start", size: "40px", strong: [682, 386] }, "kit/criteria list (b48013f)");
    await clean(page, ctx);

    // The statement markdown on kit/question.
    await ctx.open("engine/core/render.html?deck=../../examples/kit/&slide=question&theme=academic-light");
    const statement = await page.evaluate(() => {
      const md = document.querySelector('[data-el="claim"] .sd-markdown');
      const cs = getComputedStyle(md);
      const p = getComputedStyle(md.querySelector("p"));
      return { size: cs.fontSize, lineHeight: cs.lineHeight, textAlign: cs.textAlign, textWrap: cs.textWrapStyle, weight: cs.fontWeight, color: cs.color, pSize: p.fontSize, pAlign: p.textAlign };
    });
    assert.deepEqual(statement, {
      size: "64px", lineHeight: "73.6px", textAlign: "center", textWrap: "balance", weight: "400", color: "rgb(28, 28, 30)", pSize: "64px", pAlign: "center",
    }, "kit/question statement markdown (b48013f)");
    await clean(page, ctx);
  });
});

test("academic-light unchanged where there is no kicker or accent: element boxes and title type match HEAD", async () => {
  // Captured from 3905174 (before the kicker and accent phrase): canvas-relative [x, y, w, h] of every element,
  // and the title's [size, weight, colour, line height, tracking, style]. None of these slides sets a section.
  const HEAD = {
    "spike/hello": { title: [96, 96, 1728, 74], lead: [96, 194, 1728, 52], reveal: [96, 270, 1728, 52], aside: [0, 0, 0, 0], src: [96, 346, 1728, 36] },
    "kit/concept": { title: [96, 96, 1728, 74], idea: [96, 194, 1728, 730], src: [96, 948, 1728, 36] },
    "kit/speed": { title: [96, 96, 1728, 74], bars: [96, 218, 1096, 754], before: [1264, 525, 560, 52], after: [1264, 613, 560, 52], src: [96, 996, 1728, 36] },
    "kit/criteria": { title: [96, 96, 1728, 74], list: [210, 389, 1500, 350] },
    // The cover's boxes moved on purpose (title band on top, meta on the bottom margin);
    // its type is still HEAD's. HEAD had title y 355, subtitle 488, meta 607.
    "spike/cover": { title: [96, 368, 1400, 101], subtitle: [96, 501, 1400, 55], meta: [96, 930, 1400, 42], src: [96, 996, 1728, 36] },
  };
  const TITLE_TYPE = { content: ["64px", "600", "rgb(28, 28, 30)", "73.6px", "normal", "normal"], cover: ["88px", "600", "rgb(28, 28, 30)", "101.2px", "normal", "normal"] };
  await withPage({ root: repo, url: "engine/core/render.html?deck=../../examples/spike/&slide=hello" }, async (page, ctx) => {
    for (const [key, boxes] of Object.entries(HEAD)) {
      const [deck, slide] = key.split("/");
      // kit is on modern now: its academic-light baseline is taken with ?theme=academic-light (spike stays on it).
      await ctx.open(`engine/core/render.html?deck=../../examples/${deck}/&slide=${slide}${slide === "criteria" ? "&step=a" : ""}${deck === "kit" ? "&theme=academic-light" : ""}`);
      const got = await page.evaluate(() => {
        const c = document.querySelector(".sd-canvas").getBoundingClientRect();
        const res = {};
        for (const el of document.querySelectorAll(".sd-el")) {
          const r = el.getBoundingClientRect();
          res[el.dataset.el] = [r.x - c.x, r.y - c.y, r.width, r.height].map(Math.round);
        }
        const cs = getComputedStyle(document.querySelector('[data-el="title"] .sd-text'));
        return { boxes: res, title: [cs.fontSize, cs.fontWeight, cs.color, cs.lineHeight, cs.letterSpacing, cs.fontStyle] };
      });
      assert.deepEqual(got.boxes, boxes, key);
      assert.deepEqual(got.title, TITLE_TYPE[slide === "cover" ? "cover" : "content"], key);
      await clean(page, ctx);
    }
  });
});

test("theme.css is optional:a theme without one checks clean (played too); a missing tokens.css is still reported", async () => {
  const one = { only: { id: "only", layout: "full-bleed", title: TITLE, elements: [{ id: "body", type: "text", from: "b", props: { text: "Body text." } }], steps: [{ id: "a" }, { id: "b" }] } };
  const plainTheme = join(tmp, "no-theme-css");
  makeDeck(plainTheme, { deckSlides: one, theme: "plain", themes: { plain: ["theme.css"] } });
  const run = await runCheck(plainTheme, { played: true });
  assert.equal(run.problems.length, 0, run.problems.map(formatProblem).join("\n"));
  assert.ok(run.steps >= 2);

  const noTokens = join(tmp, "no-tokens");
  makeDeck(noTokens, { deckSlides: one, theme: "broken", themes: { broken: ["tokens.css"] } });
  const lines = (await runCheck(noTokens)).problems.map(formatProblem).join("\n");
  assert.match(lines, /network-error.*themes\/broken\/tokens\.css/, lines);
});

test("core styles the lede and badge roles for a theme with tokens only (no theme.css, no --sd-font-size-lede)", async () => {
  const deckSlides = { roles: { id: "roles", layout: "full-bleed", title: TITLE, lede: "One line under the title.", elements: [{ id: "tag", type: "text", props: { role: "badge", text: "Draft" } }] } };
  const dir = join(tmp, "roles-tokens-only");
  makeDeck(dir, { deckSlides, theme: "plain", themes: { plain: ["theme.css"] } });
  // The token the fallback has its own default for is dropped from the theme.
  const tokens = join(dir, "stepdeck/themes/plain/tokens.css");
  const css = readFileSync(tokens, "utf8").replace(/^\s*--sd-font-size-lede:.*$/m, "");
  writeFileSync(tokens, css);
  const target = deckTarget(dir);
  await withPage({ root: target.root, url: target.url({ slide: "roles" }) }, async (page, ctx) => {
    const got = await page.evaluate(() => {
      const look = (id) => {
        const cs = getComputedStyle(document.querySelector(`[data-el="${id}"] p`));
        return { size: parseFloat(cs.fontSize), color: cs.color, display: cs.display, upper: cs.textTransform, border: [cs.borderTopWidth, cs.borderTopStyle], radius: parseFloat(cs.borderTopLeftRadius) };
      };
      return { lede: look("lede"), badge: look("tag"), note: getComputedStyle(document.querySelector(".sd-canvas")).getPropertyValue("--sd-font-size-note") };
    });
    assert.equal(got.lede.color, await tokenRgb(page, "--sd-color-muted"), "the lede is muted");
    assert.equal(got.lede.size, parseFloat(got.note), "the lede takes the note size without its own token");
    assert.ok(got.lede.size >= 28, `at least the minimum audience font (${got.lede.size})`);
    assert.deepEqual([got.badge.display, got.badge.upper, got.badge.border, got.badge.size], ["inline-block", "uppercase", ["2px", "solid"], 28]);
    assert.ok(got.badge.radius >= 100, `rounded (${got.badge.radius})`);
    assert.equal(got.badge.color, await tokenRgb(page, "--sd-color-accent"), "the accent colour");
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.failed, ["404 /stepdeck/themes/plain/theme.css"], "the only failed request is the theme.css this theme leaves out");
  });
  const run = await runCheck(dir);
  assert.equal(run.problems.length, 0, run.problems.map(formatProblem).join("\n"));
});

test("reveal css unaffected: the reveal sheets stay unlayered, the shell loads and scales as before", async () => {
  await withPage({ root: repo, size: 1280, url: "examples/spike/index.html#/trend/base" }, async (page, ctx) => {
    await page.evaluate(async () => { await window.STEPDECK.settled(); await document.fonts.ready; });
    const got = await page.evaluate(() => {
      const PRESENT = ".reveal .slides > section.present .sd-canvas";
      const c = document.querySelector(PRESENT);
      const r = c.getBoundingClientRect();
      const t = getComputedStyle(c.querySelector('[data-el="title"] .sd-text'));
      const n = getComputedStyle(c.querySelector('[data-el="n1"]'));
      const hasLayer = (sheet) => [...sheet.cssRules].some((rule) => rule.constructor.name.startsWith("CSSLayer"));
      const sheet = (end) => [...document.styleSheets].find((s) => s.href?.endsWith(end));
      return {
        rect: [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 100) / 100),
        title: [t.fontSize, t.fontWeight, t.color, t.lineHeight, t.textAlign],
        body: [n.fontSize, n.textAlign, n.lineHeight],
        layered: { reveal: hasLayer(sheet("vendor/reveal/reveal.css")), shell: hasLayer(sheet("core/shells/reveal.css")), core: hasLayer(sheet("core/stepdeck.css")) },
      };
    });
    // rect, title and body captured from b48013f at a 1280×720 viewport.
    assert.deepEqual(got, {
      rect: [-3.2, -1.8, 1286.4, 723.6],
      title: ["64px", "600", "rgb(28, 28, 30)", "73.6px", "start"],
      body: ["40px", "start", "52px"],
      layered: { reveal: false, shell: false, core: true },
    });
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.failed, []);
  });
});
