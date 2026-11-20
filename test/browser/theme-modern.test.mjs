// The `modern` theme in Chrome (default-theme spec §5.3, §7, §10): its theme.css, `modern` as the default theme,
// and both shipped themes over every layout example and every built-in component.
//
// Temporary decks (each with a copied engine, like a `stepdeck new` deck):
//   examples  the five layouts' example.js slides, with the data they read;
//   bare      a deck.js with no `theme`, covers whose meta or figure appear at a later step, a lede and badges.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/theme-modern.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deckTarget, withPage } from "../../cli/browser.js";
import { ENGINE, copyEngine, listDirs } from "../../cli/engine.js";
import { runCheck } from "../../cli/check.js";
import { withDeck } from "../../cli/dump.js";
import { formatProblem } from "../../cli/problems.js";
import { paletteRgb, tokenRgb } from "./helpers.mjs";
import { contrast, luminance } from "#engine/core/color.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const THEMES = ["modern", "academic-light"];
const FAMILY = { modern: { body: "Geist", mono: "Geist Mono" }, "academic-light": { body: "Source Sans 3", mono: "IBM Plex Mono" } };
const BUILTINS = ["big-number", "chart.bar", "chart.line", "chat", "diagram", "image", "list", "markdown", "terminal", "text", "timeline"];
const ACCENT = { modern: "rgb(29, 78, 216)", "academic-light": "rgb(0, 114, 178)" };
const show = (problems) => problems.map(formatProblem).join("\n") || "(no problems)";

/** The first family of a computed font-family list, unquoted. */
const firstFamily = (list) => list.split(",")[0].trim().replace(/^"|"$/g, "");

function engineDeck(dir, deck, slides) {
  copyEngine(join(dir, "stepdeck"));
  mkdirSync(join(dir, "slides"), { recursive: true });
  for (const [id, spec] of Object.entries(slides)) writeFileSync(join(dir, "slides", `${id}.js`), `export default ${JSON.stringify(spec)};\n`);
  writeFileSync(join(dir, "deck.js"), `export default ${JSON.stringify({ ...deck, slides: Object.keys(slides) })};\n`);
  return deckTarget(dir);
}

const LONG_TITLE = "Response rises with dose on both regimens"; // ~40 characters
const bareSlides = {
  plain: { id: "plain", layout: "full-bleed", title: "No theme in deck.js", elements: [{ id: "body", type: "text", props: { text: "Body text." } }] },
  // The meta block appears only at step two: no accent rule while it is all hidden.
  "late-meta": {
    id: "late-meta", layout: "title", title: "A cover",
    elements: [
      { id: "sub", region: "subtitle", type: "text", props: { text: "Subtitle" } },
      { id: "who", region: "meta", type: "text", from: "two", props: { text: "A. Author" } },
      { id: "where", region: "meta", type: "text", from: "two", props: { role: "note", text: "Somewhere · 2026" } },
    ],
    steps: [{ id: "one" }, { id: "two" }],
  },
  // A message line under a title, and text badges (one with a palette tone).
  "message-line": {
    id: "message-line", layout: "figure-notes", section: "Results", title: "Response by dose", lede: "Participants respond more as the dose rises.",
    elements: [{ id: "figure", region: "main", type: "text", props: { text: "A figure stands here." } }],
  },
  badges: {
    id: "badges", layout: "full-bleed", title: "Status",
    elements: [
      { id: "plain", region: "main", type: "text", props: { role: "badge", text: "Draft" } },
      { id: "toned", region: "main", type: "text", props: { role: "badge", tone: 1, text: "In review" } },
    ],
  },
  // One badge per palette tone: in each theme some of these colours are under 4.5:1 as they are.
  tones: {
    id: "tones", layout: "full-bleed", title: "Every tone",
    elements: [0, 1, 2, 3, 4, 5].map((i) => ({ id: `t${i}`, region: "main", type: "text", props: { role: "badge", tone: i, text: `Tone ${i}` } })),
  },
  // The figure appears only at step two: the title keeps its size and its column from step one.
  "late-figure": {
    id: "late-figure", layout: "title", section: "Results", title: LONG_TITLE,
    elements: [
      { id: "fig", region: "figure", type: "text", from: "two", props: { text: "Figure stand-in" } },
      { id: "who", region: "meta", type: "text", props: { text: "A. Author" } },
    ],
    steps: [{ id: "one" }, { id: "two" }],
  },
};

let tmp;
let examples;
let exampleIds;
let bare;
before(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "stepdeck-modern-")));
  const layoutNames = listDirs(join(ENGINE, "layouts")).sort();
  exampleIds = layoutNames.map((name) => `${name}-example`);
  const ex = join(tmp, "examples");
  copyEngine(join(ex, "stepdeck"));
  mkdirSync(join(ex, "slides"), { recursive: true });
  for (const name of layoutNames) cpSync(join(ENGINE, "layouts", name, "example.js"), join(ex, "slides", `${name}-example.js`));
  mkdirSync(join(ex, "data"));
  cpSync(join(repo, "examples/spike/data/dose-response.csv"), join(ex, "data", "dose-response.csv"));
  writeFileSync(join(ex, "deck.js"), `export default ${JSON.stringify({ title: "examples", lang: "en", theme: "academic-light", slides: exampleIds })};\n`);
  examples = deckTarget(ex);
  bare = engineDeck(join(tmp, "bare"), { title: "bare", lang: "en" }, bareSlides);
});
after(() => rmSync(tmp, { recursive: true, force: true }));

const clean = async (page, ctx, what = "") => {
  assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), [], what);
  assert.deepEqual(ctx.failed, [], what);
  assert.deepEqual(ctx.errors, [], what);
};
const lastStep = (page, slide) => page.evaluate((s) => window.STEPDECK.steps[s].at(-1), slide);
const repoUrl = (deck, slide, { theme, step, lang } = {}) => {
  const q = new URLSearchParams({ deck: `../../${deck}/`, slide });
  if (step !== undefined) q.set("step", step);
  if (theme) q.set("theme", theme);
  if (lang) q.set("lang", lang);
  return `engine/core/render.html?${q}`;
};

/** Every visible, non-blank text node in the canvas (or in `scope`): its text, the first family, and whether it is code. */
const textFamilies = (page, scope = ".sd-canvas") => page.evaluate((scope) => {
  const out = [];
  for (const root of document.querySelectorAll(scope)) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (el.closest("style, script")) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.visibility !== "visible" || r.width === 0 || r.height === 0) continue;
      const box = el.closest(".sd-el");
      out.push({
        text: n.textContent.trim().slice(0, 40),
        family: cs.fontFamily,
        type: box?.dataset.type ?? null,
        // Code-like parts: inline and block code, and the terminal's command line and log (its title bar and
        // side panel are interface text, in the body family).
        mono: !!el.closest("code, pre, kbd, samp, .sd-terminal-main"),
      });
    }
  }
  return out;
}, scope);

test("kit renders in Geist: kit's deck.js names modern, and the face is loaded", async () => {
  await withPage({ root: repo, url: repoUrl("examples/kit", "cover") }, async (page, ctx) => {
    const got = await page.evaluate(() => ({
      family: getComputedStyle(document.querySelector('[data-el="title"] .sd-text')).fontFamily,
      loaded: document.fonts.check("600 64px Geist"),
    }));
    assert.match(got.family, /^Geist,/);
    assert.equal(got.loaded, true);
    await clean(page, ctx);
  });
});

test("a deck with no theme gets modern", async () => {
  await withPage({ root: bare.root, url: bare.url({ slide: "plain" }) }, async (page, ctx) => {
    const fam = await page.evaluate(() => getComputedStyle(document.querySelector('[data-el="title"] .sd-text')).fontFamily);
    assert.match(fam, /^Geist,/);
    assert.ok(ctx.requests.some((u) => u.includes("/stepdeck/themes/modern/tokens.css")), "modern's tokens were loaded");
    await clean(page, ctx);
  });
});

test("every built-in component picks up modern (kit and spike under ?theme=modern): Geist, Geist Mono for code", async () => {
  const seen = new Map(); // type -> [{ text, family, mono }]
  await withPage({ root: repo, url: repoUrl("examples/kit", "cover", { theme: "modern" }) }, async (page, ctx) => {
    for (const deck of ["examples/kit", "examples/spike"]) {
      await ctx.open(repoUrl(deck, "cover", { theme: "modern" }));
      const slides = await page.evaluate(() => [...window.STEPDECK.slides]);
      for (const slide of slides) {
        await ctx.open(repoUrl(deck, slide, { theme: "modern" }));
        await ctx.open(repoUrl(deck, slide, { theme: "modern", step: await lastStep(page, slide) }));
        // The text nodes of each component type not yet covered by an earlier slide.
        const all = await textFamilies(page);
        for (const type of new Set(all.map((t) => t.type))) {
          if (type && !seen.has(type)) seen.set(type, all.filter((t) => t.type === type));
        }
        // An element with no text node (an image without a caption): its wrapper's family.
        const wrappers = await page.evaluate(() => [...document.querySelectorAll(".sd-canvas .sd-el")].map((el) => ({
          type: el.dataset.type, family: getComputedStyle(el).fontFamily, text: `(${el.dataset.el} wrapper)`, mono: false,
        })));
        for (const w of wrappers) if (!seen.has(w.type)) seen.set(w.type, [w]);
        await clean(page, ctx, `${deck}/${slide}`);
      }
    }
  });
  for (const type of BUILTINS) {
    const items = seen.get(type);
    assert.ok(items?.length, `${type}: no element of this component in kit or spike`);
    for (const t of items) {
      // Code-like parts are in Geist Mono; a terminal's side panel may use either (its task markers are mono).
      const want = t.mono ? ["Geist Mono"] : type === "terminal" ? ["Geist", "Geist Mono"] : ["Geist"];
      assert.ok(want.includes(firstFamily(t.family)), `${type} "${t.text}": ${t.family}`);
    }
    if (type === "terminal") assert.ok(items.some((t) => t.mono), "terminal: its command line and log are checked for Geist Mono");
  }
});

test("every layout example under every theme: each visible text node is in the theme's family", async () => {
  for (const theme of THEMES) {
    await withPage({ root: examples.root, url: examples.url({ slide: exampleIds[0], query: { theme } }) }, async (page, ctx) => {
      for (const slide of exampleIds) {
        await ctx.open(examples.url({ slide, query: { theme } }));
        await ctx.open(examples.url({ slide, step: await lastStep(page, slide), query: { theme } }));
        const nodes = await textFamilies(page);
        assert.ok(nodes.length >= 2, `${theme} ${slide}: text nodes found`);
        for (const t of nodes) {
          const want = t.mono ? [FAMILY[theme].mono] : t.type === "terminal" ? [FAMILY[theme].body, FAMILY[theme].mono] : [FAMILY[theme].body];
          assert.ok(want.includes(firstFamily(t.family)), `${theme} ${slide} "${t.text}": ${t.family}`);
        }
        await clean(page, ctx, `${theme} ${slide}`);
      }
    });
  }
});

test("kicker colour per theme: the accent under modern, the muted ink under academic-light", async () => {
  const want = { modern: "rgb(29, 78, 216)", "academic-light": "rgb(91, 91, 98)" };
  for (const theme of THEMES) {
    await withPage({ root: repo, url: repoUrl("examples/spike", "trend", { theme }) }, async (page, ctx) => {
      const k = await page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector('[data-el="kicker"] .sd-text'));
        return { color: cs.color, transform: cs.textTransform, size: cs.fontSize };
      });
      assert.deepEqual(k, { color: want[theme], transform: "uppercase", size: "28px" }, theme);
      await clean(page, ctx);
    });
  }
});

test("modern theme.css: title, cover, kicker, accent and big-number type", async () => {
  await withPage({ root: examples.root, url: examples.url({ slide: "title-example", query: { theme: "modern" } }) }, async (page, ctx) => {
    const cover = await page.evaluate(() => {
      const t = getComputedStyle(document.querySelector('[data-el="title"] .sd-text'));
      const k = getComputedStyle(document.querySelector('[data-el="kicker"] .sd-text'));
      return {
        title: { weight: t.fontWeight, tracking: t.letterSpacing, color: t.color, size: t.fontSize },
        kicker: { tracking: k.letterSpacing, lineHeight: k.lineHeight, color: k.color },
      };
    });
    // The layouts/title example has a figure: the cover-figure size (96px), cover tracking -0.05em.
    assert.deepEqual(cover, {
      title: { weight: "600", tracking: "-4.8px", color: "rgb(9, 9, 11)", size: "96px" },
      kicker: { tracking: "3.36px", lineHeight: "32.2px", color: ACCENT.modern },
    });
    await clean(page, ctx);

    await ctx.open(examples.url({ slide: "figure-notes-example", query: { theme: "modern" } }));
    await ctx.open(examples.url({ slide: "figure-notes-example", step: await lastStep(page, "figure-notes-example"), query: { theme: "modern" } }));
    const content = await page.evaluate(() => {
      const t = getComputedStyle(document.querySelector('[data-el="title"] .sd-text'));
      const big = document.querySelector(".sd-big-number-value");
      return { title: [t.fontSize, t.fontWeight, t.letterSpacing], big: big ? getComputedStyle(big).letterSpacing : null };
    });
    assert.deepEqual(content.title, ["64px", "600", "-1.92px"]);
    if (content.big !== null) assert.equal(content.big, "-5.12px", "big-number tracking -0.04em of 128px");
    await clean(page, ctx);
  });
  // A big number on a slide we know has one (spike/trend).
  await withPage({ root: repo, url: repoUrl("examples/spike", "trend", { theme: "modern", step: "total" }) }, async (page, ctx) => {
    const big = await page.evaluate(() => getComputedStyle(document.querySelector(".sd-big-number-value")).letterSpacing);
    assert.equal(big, "-5.12px");
    await ctx.open(repoUrl("examples/spike", "trend", { theme: "academic-light", step: "total" }));
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".sd-big-number-value")).letterSpacing), "normal");
    await clean(page, ctx);
  });
});

test("cover meta: one continuous accent rule on the meta region under modern, none on the wrappers or under academic-light", async () => {
  for (const theme of THEMES) {
    await withPage({ root: examples.root, url: examples.url({ slide: "title-example", query: { theme } }) }, async (page, ctx) => {
      const got = await page.evaluate(() => {
        const region = document.querySelector(".sd-canvas > .sd-region.sd-meta");
        const cs = getComputedStyle(region);
        const els = [...region.querySelectorAll(":scope > .sd-el")];
        const rr = region.getBoundingClientRect();
        return {
          rule: [cs.borderInlineStartWidth, cs.borderInlineStartStyle, cs.borderInlineStartColor],
          padded: parseFloat(cs.paddingInlineStart) > 0,
          wrappers: els.map((el) => [getComputedStyle(el).borderInlineStartWidth, getComputedStyle(el).paddingInlineStart]),
          spans: els.length >= 2 && rr.top <= els[0].getBoundingClientRect().top && rr.bottom >= els.at(-1).getBoundingClientRect().bottom,
        };
      });
      if (theme === "modern") {
        assert.deepEqual(got.rule, ["4px", "solid", ACCENT.modern]);
        assert.equal(got.padded, true);
        assert.equal(got.spans, true, "the region spans every meta element: one rule");
      } else {
        assert.equal(got.rule[0], "0px", "academic-light draws no rule");
      }
      for (const w of got.wrappers) assert.deepEqual(w, ["0px", "0px"], `${theme}: no box on a meta wrapper`);
      await clean(page, ctx);
    });
  }
  // All the meta content hidden: no lone rule, but its room is kept, so the meta text does not move when it shows.
  await withPage({ root: bare.root, url: bare.url({ slide: "late-meta", step: "one" }) }, async (page, ctx) => {
    const rule = () => page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector(".sd-canvas > .sd-region.sd-meta"));
      const r = document.querySelector('[data-el="who"]').getBoundingClientRect();
      return { width: cs.borderInlineStartWidth, color: cs.borderInlineStartColor, x: r.x };
    });
    const one = await rule();
    assert.deepEqual([one.width, one.color], ["4px", "rgba(0, 0, 0, 0)"], "step one: every meta element hidden, no visible rule");
    await page.evaluate(() => window.STEPDECK.goTo("late-meta", "two"));
    await page.evaluate(() => window.STEPDECK.settled());
    const two = await rule();
    assert.deepEqual([two.width, two.color], ["4px", ACCENT.modern], "step two: the meta block shows, so does its rule");
    assert.equal(two.x, one.x, "the meta text does not move");
    await clean(page, ctx);
  });
});

test("cover title keeps its size and column when the figure appears at a later step", async () => {
  for (const theme of THEMES) {
    await withPage({ root: bare.root, url: bare.url({ slide: "late-figure", step: "one", query: { theme } }) }, async (page, ctx) => {
      const read = () => page.evaluate(() => {
        const t = document.querySelector('[data-el="title"] .sd-text');
        return { size: getComputedStyle(t).fontSize, width: Math.round(document.querySelector('.sd-canvas > [data-region="title"]').getBoundingClientRect().width) };
      });
      const one = await read();
      await page.evaluate(() => window.STEPDECK.goTo("late-figure", "two"));
      await page.evaluate(() => window.STEPDECK.settled());
      const played = await read();
      await ctx.open(bare.url({ slide: "late-figure", step: "two", query: { theme } }));
      const jumped = await read();
      assert.deepEqual(played, one, `${theme}: step two (played) equals step one`);
      assert.deepEqual(jumped, one, `${theme}: step two (jumped) equals step one`);
      assert.equal(one.size, theme === "modern" ? "96px" : "88px", `${theme}: the cover-figure size from the start`);
      await clean(page, ctx);
    });
  }
});

test("the canvas carries the deck's lang (so uppercase cases correctly), and ?lang= overrides it", async () => {
  await withPage({ root: repo, url: repoUrl("examples/spike", "trend") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => document.querySelector(".sd-canvas").lang), "en");
    await ctx.open(repoUrl("examples/spike", "trend", { lang: "es" }));
    assert.equal(await page.evaluate(() => document.querySelector(".sd-canvas").lang), "es");
    await clean(page, ctx);
  });
});

test("chart grid lines read --sd-color-grid", async () => {
  const want = { modern: "rgb(240, 240, 242)", "academic-light": "rgb(212, 212, 216)" };
  for (const theme of THEMES) {
    await withPage({ root: repo, url: repoUrl("examples/spike", "trend", { theme, step: "total" }) }, async (page, ctx) => {
      const strokes = await page.evaluate(() => [...new Set([...document.querySelectorAll(".sd-grid-line")].map((l) => getComputedStyle(l).stroke))]);
      assert.deepEqual(strokes, [want[theme]], theme);
      await ctx.open(repoUrl("examples/kit", "speed", { theme }));
      const bars = await page.evaluate(() => [...new Set([...document.querySelectorAll(".sd-grid-line")].map((l) => getComputedStyle(l).stroke))]);
      assert.ok(bars.length === 0 || (bars.length === 1 && bars[0] === want[theme]), `${theme} chart.bar: ${bars}`);
      await clean(page, ctx);
    });
  }
});

test("check --theme: the session really uses the theme, and kit and spike check clean under both themes", async () => {
  for (const theme of THEMES) {
    const fam = await withDeck(join(repo, "examples/kit"), { slide: "cover", theme }, async (s) => {
      await s.open("cover", 0);
      return s.page.evaluate(() => getComputedStyle(document.querySelector('[data-el="title"] .sd-text')).fontFamily);
    });
    assert.equal(firstFamily(fam), FAMILY[theme].body, `withDeck({ theme: ${theme} })`);
    for (const deck of ["examples/kit", "examples/spike"]) {
      const run = await runCheck(join(repo, deck), { theme });
      assert.equal(run.problems.length, 0, `${deck} under ${theme}:\n${show(run.problems)}`);
    }
  }
  // The CLI flag.
  const cli = spawnSync(process.execPath, [join(repo, "cli/index.js"), "check", "examples/spike", "--theme", "academic-light", "--slide", "trend"], { cwd: repo, encoding: "utf8", env: process.env });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  assert.match(cli.stdout, /^check: 1 slide, \d+ steps, 0 problems$/m);
});

test("a theme name that is not a folder name (?theme=../../x) is not found, and nothing is fetched outside themes/", async () => {
  await withPage({ root: bare.root, url: bare.url({ slide: "plain", query: { theme: "../../x" } }) }, async (page, ctx) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.ok(errors.some((e) => /^deck: theme '\.\.\/\.\.\/x' not found/.test(e)), errors.join("\n"));
    const themeFiles = ctx.requests.filter((u) => /(tokens|theme)\.css$|palettes\.json$/.test(u));
    assert.deepEqual(themeFiles, [], "no theme file was requested");
    assert.deepEqual(ctx.failed, []);
  });
});

test("lede: under the title in the title region, the lede token size, the muted ink; check is clean (both themes)", async () => {
  const SIZE = { modern: "36px", "academic-light": "32px" };
  for (const theme of THEMES) {
    await withPage({ root: bare.root, url: bare.url({ slide: "message-line", query: { theme } }) }, async (page, ctx) => {
      const got = await page.evaluate(() => {
        const box = (sel) => document.querySelector(sel).getBoundingClientRect();
        const p = document.querySelector('[data-el="lede"] p');
        const cs = getComputedStyle(p);
        const region = document.querySelector('[data-region="title"]').getBoundingClientRect();
        const title = box('[data-el="title"] p');
        const lede = box('[data-el="lede"] p');
        return {
          text: p.textContent,
          cls: p.className,
          size: cs.fontSize,
          color: cs.color,
          below: lede.top >= title.bottom - 0.5,
          inside: lede.top >= region.top && lede.bottom <= region.bottom + 0.5 && lede.left >= region.left && lede.right <= region.right + 0.5,
          order: [...document.querySelectorAll('[data-region="title"] > .sd-el')].map((e) => e.dataset.el),
          hooks: Object.fromEntries([...document.querySelectorAll('[data-region="title"] > .sd-el')].map((e) => [e.dataset.el, [...e.classList].filter((c) => c !== "sd-el")])),
        };
      });
      assert.equal(got.text, "Participants respond more as the dose rises.");
      assert.deepEqual(got.hooks, { kicker: ["sd-kicker"], title: ["sd-title"], lede: ["sd-lede"] }, `${theme}: each box carries its hook class`);
      assert.equal(got.cls, "sd-text sd-role-lede");
      assert.equal(got.size, SIZE[theme], `${theme}: --sd-font-size-lede`);
      assert.ok(parseFloat(got.size) >= 28, "at least the minimum audience font");
      assert.equal(got.color, await tokenRgb(page, "--sd-color-muted"), `${theme}: the muted ink`);
      assert.deepEqual(got.order, ["kicker", "title", "lede"]);
      assert.equal(got.below, true, `${theme}: the lede sits below the title`);
      assert.equal(got.inside, true, `${theme}: the lede sits inside the title region`);
      await clean(page, ctx, theme);
    });
    const run = await runCheck(bare.root, { slide: "message-line", theme });
    assert.equal(run.problems.length, 0, `${theme}:\n${show(run.problems)}`);
  }
});

test("badge: an inline uppercase pill in the label size with a 2px border; accent without a tone, the palette colour with one (both themes)", async () => {
  for (const theme of THEMES) {
    await withPage({ root: bare.root, url: bare.url({ slide: "badges", query: { theme } }) }, async (page, ctx) => {
      const look = (id) => page.evaluate((id) => {
        const p = document.querySelector(`[data-el="${id}"] p`);
        const cs = getComputedStyle(p);
        return {
          cls: p.className, display: cs.display, upper: cs.textTransform, size: cs.fontSize, tracking: cs.letterSpacing, color: cs.color,
          border: [cs.borderTopWidth, cs.borderTopStyle, cs.borderTopColor, cs.borderRadius],
          hugs: p.getBoundingClientRect().width < p.parentElement.getBoundingClientRect().width / 2,
        };
      }, id);
      const plain = await look("plain");
      assert.equal(plain.cls, "sd-text sd-role-badge");
      assert.deepEqual([plain.display, plain.upper, plain.size, plain.tracking, plain.hugs], ["inline-block", "uppercase", "28px", "3.36px", true], theme);
      assert.deepEqual(plain.border.slice(0, 2), ["2px", "solid"]);
      assert.ok(parseFloat(plain.border[3]) >= 1000 || plain.border[3].includes("%"), `fully rounded (${plain.border[3]})`);
      const accent = await tokenRgb(page, "--sd-color-accent");
      assert.equal(plain.color, accent, `${theme}: no tone, the accent colour`);
      assert.equal(plain.border[2], accent, `${theme}: the border follows the colour`);
      const toned = await look("toned");
      assert.equal(toned.border[2], paletteRgb(theme, 1), `${theme}: tone 1 draws the border in the second palette colour`);
      assert.notEqual(toned.border[2], accent);
      assert.ok(ratio(toned.color, await tokenRgb(page, "--sd-color-background")) >= 4.5, `${theme}: the text reads at 4.5:1 (${toned.color})`);
      await clean(page, ctx, theme);
    });
  }
});

/** WCAG contrast of two computed `rgb(r, g, b)` colours. */
const ratio = (a, b) => contrast(...[a, b].map((c) => luminance(c.match(/\d+/g).slice(0, 3).map((v) => Number(v) / 255))));

test("badge: every tone 0 to 5 reads at 4.5:1 in both themes, and the border keeps the palette colour", async () => {
  for (const theme of THEMES) {
    await withPage({ root: bare.root, url: bare.url({ slide: "tones", query: { theme } }) }, async (page, ctx) => {
      const background = await tokenRgb(page, "--sd-color-background");
      const got = await page.evaluate(() => [0, 1, 2, 3, 4, 5].map((i) => {
        const cs = getComputedStyle(document.querySelector(`[data-el="t${i}"] p`));
        return { color: cs.color, border: cs.borderTopColor };
      }));
      let darkened = 0;
      got.forEach(({ color, border }, i) => {
        const palette = paletteRgb(theme, i);
        assert.equal(border, palette, `${theme} tone ${i}: the border is the palette colour`);
        assert.ok(ratio(color, background) >= 4.5, `${theme} tone ${i}: text ${color} reads at 4.5:1 (${ratio(color, background).toFixed(2)})`);
        // A palette colour that already reads at 4.5:1 is the text colour as it is; the others are darkened.
        if (ratio(palette, background) >= 4.5) assert.equal(color, palette, `${theme} tone ${i}: a colour that passes is kept`);
        else darkened += 1;
      });
      assert.ok(darkened >= 2, `${theme}: the fixture has tones under 4.5:1 as they are (${darkened})`);
      await clean(page, ctx, theme);
    });
    const run = await runCheck(bare.root, { slide: "tones", theme });
    assert.equal(run.problems.length, 0, `${theme}:\n${show(run.problems)}`);
  }
});
