// The GitHub Pages site: the landing page, the gallery deck and the docs viewer.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withPage, waitForDeck } from "../../cli/browser.js";
import { pagesLayout } from "../../cli/serve.js";
import { entries } from "../../site/gallery/deck.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
// Not a deck: wait until the viewer has settled on a state.
const waitFor = (page, { timeout } = {}) => page.waitForSelector("main[data-state=ready], main[data-state=missing]", { timeout });
const state = (page) => page.getAttribute("main", "data-state");

test("docs viewer renders the docs home and follows a link", async () => {
  await withPage({ root, url: "site/docs/", waitFor }, async (page, ctx) => {
    assert.equal(await state(page), "ready");
    assert.ok((await page.locator("main h1").count()) >= 1, "a heading is rendered");
    assert.match(await page.title(), / · stepdeck docs$/);
    assert.deepEqual(
      await page.locator(".site-nav a").evaluateAll((as) => as.map((a) => [a.textContent, a.getAttribute("href")])),
      [
        ["stepdeck", "../../"],
        ["Docs", "?p=docs/index.md"],
        ["Gallery", "../gallery/"],
        ["GitHub", "https://github.com/horaciochacon/stepdeck"],
      ],
    );
    // Geist is the page font and the file really loads.
    assert.equal(await page.evaluate(() => document.fonts.check('16px "Geist"')), true);

    await page.locator('main a[href="?p=docs/guide/quickstart.md"]').first().click();
    await page.waitForURL(/\?p=docs\/guide\/quickstart\.md$/);
    await waitFor(page);
    assert.equal(await state(page), "ready");
    assert.ok((await page.locator("main h1").count()) >= 1);
    assert.match(await page.title(), /^Quickstart.* · stepdeck docs$/);
    // Headings carry GitHub-style ids, and a link out of the viewer's roots goes to GitHub.
    assert.ok((await page.locator("main h2[id]").count()) >= 1);
    await ctx.quiet();
    assert.deepEqual(ctx.errors, []);
    assert.deepEqual(ctx.failed, []);
  });
});

test("docs viewer: links across the docs resolve (anchor, skill page, folder, engine README)", async () => {
  await withPage({ root, url: "site/docs/", waitFor }, async (page, ctx) => {
    const hrefs = await page.locator("main a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    assert.ok(hrefs.includes("#reference"), "a pure anchor is unchanged");
    assert.ok(hrefs.includes("?p=skill/SKILL.md"), "a skill page opens in the viewer");
    assert.ok(hrefs.includes("https://github.com/horaciochacon/stepdeck/tree/main/skill/references/"), "a folder opens on GitHub");
    assert.equal(await page.locator("main #reference").count(), 1, "the anchor has a target");
    await ctx.open("site/docs/?p=skill/SKILL.md");
    assert.equal(await state(page), "ready");
    // A layout's README lives in engine/layouts/ (the gallery and the landing page link to it).
    await ctx.open("site/docs/?p=engine/layouts/halves/README.md");
    assert.equal(await state(page), "ready");
    assert.match(await page.locator("main h1").first().innerText(), /halves/);
    assert.deepEqual(ctx.errors, []);
    assert.deepEqual(ctx.failed, []);
  });
});

test("docs viewer: refused and missing paths show 'Page not found' and never fetch outside the roots", async () => {
  await withPage({ root, url: "site/docs/?p=../../etc/passwd", waitFor }, async (page, ctx) => {
    assert.equal(await state(page), "missing");
    assert.match(await page.locator("main").innerText(), /Page not found: \.\.\/\.\.\/etc\/passwd/);
    assert.equal(await page.locator('main a[href="?p=docs/index.md"]').count(), 1);
    assert.equal(ctx.requests.some((u) => new URL(u).pathname.includes("etc/passwd")), false);
    assert.equal(ctx.requests.some((u) => new URL(u).pathname.endsWith(".md")), false, "no markdown was fetched");

    // Markup in the path is shown as text, never parsed.
    await ctx.open("site/docs/?p=" + encodeURIComponent("<img src=x onerror=alert(1)>.md"));
    assert.equal(await state(page), "missing");
    assert.equal(await page.locator("main img").count(), 0);

    // An allowed path that does not exist.
    await ctx.open("site/docs/?p=docs/missing.md");
    assert.equal(await state(page), "missing");
    assert.match(await page.locator("main").innerText(), /Page not found: docs\/missing\.md/);

    // Percent-encoded traversal (the query decodes %252e once; fetch would decode %2e again).
    const before = ctx.requests.length;
    await ctx.open("site/docs/?p=docs/%252e%252e/%252e%252e/etc/passwd.md");
    assert.equal(await state(page), "missing");
    assert.equal(ctx.requests.slice(before).some((u) => /passwd|%2e/i.test(new URL(u).pathname)), false);
    assert.equal(ctx.requests.slice(before).some((u) => new URL(u).pathname.endsWith(".md")), false);

    // Never the private plans.
    await ctx.open("site/docs/?p=docs/superpowers/plans/x.md");
    assert.equal(await state(page), "missing");
  });
});

// GitHub Pages serves the repository under /stepdeck/. Serve a temporary folder in which `stepdeck`
// is a symlink to the repository root, so a root-relative URL ("/site/site.css") is a 404 here.
async function underPrefix(fn) {
  const site = pagesLayout(root);
  try {
    return await fn(site.dir);
  } finally {
    site.cleanup();
  }
}
const landingReady = (page, { timeout } = {}) => page.waitForSelector("#gallery-list a", { timeout });

test("landing page under /stepdeck/: content, gallery list, live deck, no failed request", async () => {
  await underPrefix((dir) =>
    withPage({ root: dir, url: "stepdeck/", waitFor: landingReady }, async (page, ctx) => {
      assert.match(await page.locator("h1").innerText(), /^stepdeck$/);
      assert.match(await page.locator("main").innerText(), /Step-by-step HTML presentations, written as data, that agents can build\./);
      assert.deepEqual(
        await page.locator(".site-nav a").evaluateAll((as) => as.map((a) => [a.textContent, a.getAttribute("href")])),
        [
          ["stepdeck", "./"],
          ["Docs", "site/docs/?p=docs/index.md"],
          ["Gallery", "site/gallery/"],
          ["GitHub", "https://github.com/horaciochacon/stepdeck"],
        ],
      );
      assert.match(await page.locator("pre").innerText(), /git clone https:\/\/github\.com\/horaciochacon\/stepdeck\.git/);
      assert.equal(await page.title(), "stepdeck");
      assert.equal(await page.locator('iframe[src="examples/kit/"]').count(), 1);
      assert.match(await page.locator("figcaption").innerText(), /The slide kit deck, live: click it, then use the arrow keys/);
      assert.equal(await page.locator('a[href="examples/kit/"]:has-text("Open full screen")').count(), 1);
      assert.equal(await page.locator('a[href="examples/spike/"]').count(), 1);
      // The footer shows package.json's version, so a release that forgets the page fails here.
      const footer = await page.locator("footer").innerText();
      assert.match(footer, /MIT.*THIRD_PARTY_NOTICES\.md/s);
      assert.ok(footer.includes(`Version ${version}`), `footer shows version ${version}`);

      // The gallery list: one link to the gallery slide and one to its doc page, per entry.
      const links = await page.locator("#gallery-list a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
      assert.equal(links.length, entries.length * 2);
      for (const e of entries) {
        assert.ok(links.includes(`site/gallery/#/${e.slide}/0`), `gallery link for ${e.slide}`);
        assert.ok(links.includes(`site/docs/?p=${e.doc}`), `doc link for ${e.doc}`);
      }
      assert.match(await page.locator("main").innerText(), /Layouts[\s\S]*Components/);

      // The live deck inside the iframe boots, and nothing failed.
      const frame = page.frames().find((f) => new URL(f.url()).pathname === "/stepdeck/examples/kit/");
      assert.ok(frame, "the kit deck is loaded in the iframe");
      await waitForDeck(frame, { errors: ctx.errors });
      await ctx.quiet();
      assert.deepEqual(ctx.errors, []);
      assert.deepEqual(ctx.failed, []);

      // Every link into the site resolves under the prefix and answers 200.
      const prefix = `${ctx.base}stepdeck/`;
      const hrefs = await page.evaluate(() => [...document.querySelectorAll("a[href], iframe[src]")].map((n) => n.href ?? n.src));
      const inSite = [...new Set(hrefs.filter((h) => !h.startsWith("https://github.com/")))];
      assert.ok(inSite.length >= entries.length * 2 + 6, "the page links into the site");
      for (const h of inSite) assert.ok(h.startsWith(prefix), `${h} stays under /stepdeck/`);
      // One request per document: the gallery's slide addresses differ only in their #hash.
      const documents = [...new Set(inSite.map((h) => h.split("#")[0]))];
      const statuses = await page.evaluate((urls) => Promise.all(urls.map((u) => fetch(u).then((r) => [u, r.status]))), documents);
      for (const [u, status] of statuses) assert.equal(status, 200, `${u} answers 200`);
    }),
  );
});

test("gallery deck boots under /stepdeck/ at a landing-page slide address with no failed request", async () => {
  await underPrefix((dir) =>
    withPage({ root: dir, url: "stepdeck/site/gallery/#/halves-example/0" }, async (page, ctx) => {
      assert.equal(await page.evaluate(() => window.STEPDECK.state().slide), "halves-example");
      assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
      assert.deepEqual(ctx.errors, []);
      assert.deepEqual(ctx.failed, []);
    }),
  );
});
