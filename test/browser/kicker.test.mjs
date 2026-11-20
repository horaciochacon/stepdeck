// The section kicker element and the accent phrase in titles (default-theme spec §5.2, §5.4, §10.4, §10.5), in Chrome.
//
// One temporary engine copy (like a `stepdeck new` deck), with two test-only layouts that know nothing about any
// theme: `fourth` (test/fixtures/fourth-layout: a title band over main) and `main-only` (test/fixtures/no-title-layout:
// no title region, so the kicker has nowhere to go). The deck has a reveal index.html for the shell checks.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/kicker.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deckTarget, withPage } from "../../cli/browser.js";
import { runCheck } from "../../cli/check.js";
import { dump, formatDump } from "../../cli/dump.js";
import { formatProblem } from "../../cli/problems.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const engine = fileURLToPath(new URL("../../engine/", import.meta.url));
const spike = fileURLToPath(new URL("../../examples/spike/", import.meta.url));
const THEMES = ["academic-light", "modern"];
const ENGINE_DIRS = ["core", "components", "layouts", "themes", "vendor", "schema"];
const TITLE = "Response by *dose and regimen*";
const body = [{ id: "body", region: "main", type: "text", props: { text: "Body text." } }];

const slides = {
  kicked: { id: "kicked", layout: "full-bleed", section: "Methods", title: TITLE, elements: body },
  "kicked-fourth": { id: "kicked-fourth", layout: "fourth", section: "Methods", title: TITLE, elements: body },
  "kicker-only": { id: "kicker-only", layout: "full-bleed", section: "Methods", elements: body },
  // Steps that patch the kicker on a layout that drops it: ignored there (check --played below must stay clean).
  dropped: {
    id: "dropped", layout: "main-only", section: "Methods", elements: body,
    steps: [{ id: "a" }, { id: "b", set: { kicker: { text: "Later" }, body: { text: "More." } } }, { id: "c", hide: ["kicker"], replace: { kicker: { text: "R" } } }],
  },
  punct: { id: "punct", layout: "full-bleed", title: "Response at *50 mg*, then *500 mg*.", elements: body },
  script: { id: "script", layout: "full-bleed", title: "<script>window.__pwned = 1</script><b>bold</b> *x*", elements: body },
  bound: {
    id: "bound", layout: "full-bleed",
    elements: [
      { id: "title", region: "title", type: "text", props: { text: "Rate {{data/d.json#/star}} *up* {{data/d.json#/slash}}*on*" } },
      ...body,
    ],
  },
  steps: {
    id: "steps", layout: "full-bleed", section: "Results", title: "One *a*",
    elements: body,
    steps: [
      { id: "a" },
      { id: "b", set: { title: { text: "Two *b* now" } } },
      { id: "c", replace: { title: { text: "Three *c*" } } },
      { id: "d", set: { title: { accent: false, text: "Four *d*" } } },
    ],
  },
};

let tmp;
let deck;
before(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "stepdeck-kicker-")));
  const dir = join(tmp, "deck");
  for (const d of ENGINE_DIRS) cpSync(join(engine, d), join(dir, "stepdeck", d), { recursive: true });
  cpSync(join(repo, "test/fixtures/fourth-layout"), join(dir, "stepdeck/layouts/fourth"), { recursive: true });
  cpSync(join(repo, "test/fixtures/no-title-layout"), join(dir, "stepdeck/layouts/main-only"), { recursive: true });
  mkdirSync(join(dir, "slides"));
  mkdirSync(join(dir, "data"));
  writeFileSync(join(dir, "data/d.json"), JSON.stringify({ star: "*boom*", slash: "x\\" }));
  for (const [id, spec] of Object.entries(slides)) writeFileSync(join(dir, "slides", `${id}.js`), `export default ${JSON.stringify(spec)};\n`);
  writeFileSync(join(dir, "deck.js"), `export default ${JSON.stringify({ title: "kicker", lang: "en", theme: "academic-light", slides: Object.keys(slides) })};\n`);
  writeFileSync(join(dir, "index.html"), readFileSync(join(repo, "templates/talk/index.html"), "utf8"));
  deck = deckTarget(dir);
});
after(() => rmSync(tmp, { recursive: true, force: true }));

const urlFor = (slide, theme = "academic-light", step) => deck.url({ slide, step, query: theme === "academic-light" ? {} : { theme } });
const clean = async (page, ctx) => {
  assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
  assert.deepEqual(ctx.failed, []);
  assert.deepEqual(ctx.errors, []);
};
const titleParts = (page) => page.evaluate(() => {
  const p = document.querySelector('[data-el="title"].sd-title .sd-text');
  return [...p.childNodes].map((n) => (n.nodeType === 3 ? n.nodeValue : `<${n.localName}.${n.className}>${n.textContent}`));
});

test("the kicker shows the section above the title, as .sd-el.sd-kicker[data-el=kicker]; the accent is inside .sd-title", async () => {
  await withPage({ root: deck.root, url: urlFor("kicked") }, async (page, ctx) => {
    const got = await page.evaluate(() => {
      const k = document.querySelector('.sd-region[data-region="title"] > .sd-el.sd-kicker[data-el="kicker"]');
      const t = document.querySelector('.sd-region[data-region="title"] > .sd-el.sd-title[data-el="title"]');
      const em = document.querySelectorAll(".sd-accent");
      return {
        kicker: k?.textContent,
        kickerType: k?.dataset.type,
        order: k && t ? [...k.parentElement.children].indexOf(k) < [...t.parentElement.children].indexOf(t) : null,
        above: k && t ? k.getBoundingClientRect().bottom <= t.getBoundingClientRect().top : null,
        kickerIsNotTitle: k ? !k.classList.contains("sd-title") : null,
        accents: [...em].map((e) => [e.localName, e.textContent, e.closest(".sd-title") === t]),
        title: t?.textContent,
      };
    });
    assert.deepEqual(got, {
      kicker: "Methods", kickerType: "text", order: true, above: true, kickerIsNotTitle: true,
      accents: [["em", "dose and regimen", true]],
      title: "Response by dose and regimen",
    });
    assert.deepEqual(await titleParts(page), ["Response by ", "<em.sd-accent>dose and regimen"]);
    await clean(page, ctx);

    await ctx.open(urlFor("kicker-only"));
    assert.deepEqual(await page.evaluate(() => ({
      kicker: document.querySelector('.sd-el.sd-kicker[data-el="kicker"]')?.textContent,
      title: document.querySelector('[data-el="title"]'),
    })), { kicker: "Methods", title: null }, "a slide with a section and no title still shows the kicker");
    await clean(page, ctx);

    await ctx.open(urlFor("dropped"));
    assert.deepEqual(await page.evaluate(() => ({
      kicker: document.querySelector('[data-el="kicker"]'),
      body: document.querySelector('[data-el="body"]')?.textContent,
      state: Object.keys(window.STEPDECK.state().elements),
    })), { kicker: null, body: "Body text.", state: ["body"] }, "a layout without a title region drops the kicker quietly");
    await clean(page, ctx);
  });
});

test("a <script> in a title renders as text; a bound value containing * creates no span", async () => {
  await withPage({ root: deck.root, url: urlFor("script") }, async (page, ctx) => {
    assert.deepEqual(await titleParts(page), ["<script>window.__pwned = 1</script><b>bold</b> ", "<em.sd-accent>x"]);
    assert.deepEqual(await page.evaluate(() => [window.__pwned, document.querySelectorAll(".sd-canvas script, .sd-canvas b").length]), [undefined, 0]);
    await clean(page, ctx);

    await ctx.open(urlFor("bound"));
    assert.deepEqual(await titleParts(page), ["Rate *boom* ", "<em.sd-accent>up", " x\\", "<em.sd-accent>on"]);
    await clean(page, ctx);
  });
});

test("jump and play give the same title across set, replace and accent: false", async () => {
  const expected = {
    a: ["One ", "<em.sd-accent>a"],
    b: ["Two ", "<em.sd-accent>b", " now"],
    c: ["Three ", "<em.sd-accent>c"],
    d: ["Four *d*"],
  };
  await withPage({ root: deck.root, url: urlFor("steps", "academic-light", "a") }, async (page, ctx) => {
    const played = {};
    for (const step of ["a", "b", "c", "d"]) {
      if (step !== "a") await page.evaluate(async (s) => { await window.STEPDECK.goTo("steps", s); await window.STEPDECK.settled(); }, step);
      played[step] = await titleParts(page);
    }
    assert.deepEqual(played, expected, "played forward");
    const jumped = {};
    for (const step of ["d", "a", "c", "b"]) {
      await ctx.open(urlFor("steps", "academic-light", step));
      jumped[step] = await titleParts(page);
      assert.equal(await page.evaluate(() => document.querySelector('[data-el="kicker"]').textContent), "Results");
    }
    assert.deepEqual(jumped, expected, "jumped");
    await clean(page, ctx);
  });
});

test("a fourth layout gets the same kicker and accent styling as a stock layout, and it is the theme's", async () => {
  const style = (page, sel) => page.evaluate((sel) => {
    const cs = getComputedStyle(document.querySelector(sel));
    return { family: cs.fontFamily, size: cs.fontSize, weight: cs.fontWeight, style: cs.fontStyle, letterSpacing: cs.letterSpacing, transform: cs.textTransform, color: cs.color };
  }, sel);
  const expected = {
    "academic-light": { kicker: "rgb(91, 91, 98)", accent: "rgb(0, 114, 178)" },
    modern: { kicker: "rgb(29, 78, 216)", accent: "rgb(29, 78, 216)" },
  };
  for (const theme of THEMES) {
    await withPage({ root: deck.root, url: urlFor("kicked", theme) }, async (page, ctx) => {
      const stock = { kicker: await style(page, '[data-el="kicker"] .sd-text'), accent: await style(page, ".sd-title .sd-accent") };
      await clean(page, ctx);
      await ctx.open(urlFor("kicked-fourth", theme));
      const fourth = { kicker: await style(page, '[data-el="kicker"] .sd-text'), accent: await style(page, ".sd-title .sd-accent") };
      await clean(page, ctx);
      assert.deepEqual(fourth, stock, `${theme}: fourth matches full-bleed`);
      assert.equal(fourth.kicker.color, expected[theme].kicker, `${theme}: kicker colour`);
      assert.equal(fourth.kicker.transform, "uppercase", theme);
      assert.equal(fourth.kicker.size, "28px", theme);
      assert.equal(fourth.accent.color, expected[theme].accent, `${theme}: accent colour`);
      assert.equal(fourth.accent.style, "normal", `${theme}: the accent <em> is not italic by default`);
    });
  }
});

test("raw title strings shown outside the element carry no asterisks: placeholder, overview, document.title, dump", async () => {
  await withPage({ root: deck.root, url: "index.html#/kicked/0" }, async (page, ctx) => {
    await page.evaluate(async () => { await window.STEPDECK.settled(); await document.fonts.ready; });
    // The slide on screen is mounted (its placeholder is gone); slides not yet visited still show theirs.
    const placeholders = await page.evaluate(() => [...document.querySelectorAll(".reveal .slides > section .sd-placeholder h2")].map((h) => h.textContent));
    assert.ok(placeholders.includes("Response at 50 mg, then 500 mg."), placeholders.join(" | "));
    assert.ok(placeholders.includes("Rate {{data/d.json#/star}} up {{data/d.json#/slash}}on"), placeholders.join(" | "));
    for (const h of placeholders) assert.doesNotMatch(h, /\*/, h);
    // The overview shows those placeholders for slides never visited, and the canvas (no asterisks) for the rest.
    await page.evaluate(() => window.Reveal.toggleOverview(true));
    const overview = await page.evaluate(() => [...document.querySelectorAll(".reveal.overview .slides > section")].map((s) => s.textContent).join(" | "));
    assert.ok(overview.includes("dose and regimen"), overview);
    assert.doesNotMatch(overview.replace("Rate *boom*", ""), /\*/, overview);
    await page.evaluate(() => window.Reveal.toggleOverview(false));
    assert.doesNotMatch(await page.title(), /\*/);
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.failed, []);
  });

  const out = await dump(deck.root, { slide: "punct" });
  const title = out[0].elements.find((e) => e.id === "title");
  assert.equal(title.text, "Response at 50 mg, then 500 mg.");
  const text = formatDump(await dump(deck.root, { slide: "kicked" }));
  assert.match(text, /"Response by dose and regimen"/, text);
  assert.match(text, /kicker\s+text\s+.*"Methods"/, text);
});

test("check is clean on spike, and on the kicker deck (played too, both themes are covered by the styling test)", async () => {
  const s = await runCheck(spike, { played: true });
  assert.equal(s.problems.length, 0, s.problems.map(formatProblem).join("\n"));
  const k = await runCheck(deck.root, { played: true });
  assert.equal(k.problems.length, 0, k.problems.map(formatProblem).join("\n"));
});
