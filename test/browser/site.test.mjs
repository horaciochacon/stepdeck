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
    // The font is preloaded from the address the stylesheet uses, so it is fetched once.
    const preload = await page.locator('link[rel="preload"][as="font"]').evaluate((l) => l.href);
    assert.equal(ctx.requests.filter((u) => u === preload).length, 1, "one request for the preloaded font");
    assert.match(preload, /\/engine\/themes\/modern\/fonts\/geist\/geist-variable\.woff2$/);
    assert.ok((await page.locator('meta[name="description"]').getAttribute("content")).length > 40);
    // Without JavaScript the page points at the Markdown itself.
    assert.match(await page.locator("noscript").innerHTML(), /href="\.\.\/\.\.\/docs\/index\.md"/);
    assert.equal(await page.evaluate(() => fetch("../../docs/index.md").then((r) => r.text().then(() => r.status))), 200);

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
    // The gallery and the example decks open live, not as a source folder on GitHub.
    await ctx.open("site/docs/?p=docs/guide/first-deck.md");
    const live = await page.locator("main a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    assert.ok(live.includes("../../examples/kit/") && live.includes("../../examples/spike/"), "example decks open live");
    assert.equal(await page.evaluate(() => fetch("../../examples/spike/").then((r) => r.text().then(() => r.status))), 200);
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

test("docs viewer draws a Mermaid flowchart as an SVG that fits the page, with its source folded", async () => {
  await withPage({ root, url: "site/docs/?p=docs/guide/checking-a-deck.md", waitFor }, async (page, ctx) => {
    assert.equal(await page.locator("figure.flow svg.flow-svg").count(), 1);
    assert.equal(await page.locator("main pre code.language-mermaid").count(), 0, "no raw mermaid block");
    const d = await page.evaluate(() => {
      const box = (n) => n.getBoundingClientRect();
      const svg = document.querySelector(".flow-svg");
      // Every label stays inside its box: the widths are estimated, not measured.
      const loose = [...svg.querySelectorAll(".flow-node")].filter((g) => {
        const shape = box(g.querySelector("rect, polygon"));
        const text = box(g.querySelector("text"));
        return text.left < shape.left || text.right > shape.right || text.top < shape.top || text.bottom > shape.bottom;
      });
      return {
        nodes: svg.querySelectorAll(".flow-node").length,
        loose: loose.map((g) => g.textContent),
        details: document.querySelector(".flow details").open,
        source: document.querySelector(".flow details code").textContent,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        marker: getComputedStyle(svg.querySelector(".flow-edge")).markerEnd,
      };
    });
    assert.equal(d.nodes, 5);
    assert.deepEqual(d.loose, []);
    assert.equal(d.details, false);
    assert.match(d.source, /^flowchart LR\n/);
    assert.equal(d.overflow, 0);
    assert.match(d.marker, /#flow-1-arrow/);
    // The widest and the tallest diagrams of the docs: labels inside their boxes there too.
    for (const p of ["docs/concepts/architecture.md", "docs/guide/for-agents.md"]) {
      await ctx.open(`site/docs/?p=${p}`);
      const loose = await page.evaluate(() =>
        [...document.querySelectorAll(".flow-node, .flow-label")]
          .filter((g) => {
            const shape = g.querySelector("rect, polygon").getBoundingClientRect();
            const text = g.querySelector("text").getBoundingClientRect();
            return text.left < shape.left || text.right > shape.right;
          })
          .map((g) => g.textContent),
      );
      assert.deepEqual(loose, [], p);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, p);
    }
    assert.deepEqual(ctx.errors, []);
    assert.deepEqual(ctx.failed, []);
  });
});

test("docs viewer: a wide reference table uses the page width and the page never scrolls sideways", async () => {
  await withPage({ root, url: "site/docs/?p=docs/reference/components/chart-line.md", waitFor }, async (page) => {
    const d = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      clipped: [...document.querySelectorAll(".prose table")].filter((t) => t.scrollWidth > t.clientWidth + 1).length,
    }));
    assert.deepEqual(d, { overflow: 0, clipped: 0 });
    await page.setViewportSize({ width: 390, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
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
      // Four cards; the one for agents links the guide (in the viewer) and the skill (the Markdown itself).
      assert.deepEqual(await page.locator(".cards h2").allInnerTexts(), ["Gallery", "Docs", "For agents", "GitHub"]);
      assert.equal(await page.locator('.card a[href="site/docs/?p=docs/guide/for-agents.md"]').count(), 1);
      assert.equal(await page.locator('.card a[href="skill/SKILL.md"]').count(), 1);
      assert.equal(await page.locator('link[rel="alternate"][type="text/markdown"]').getAttribute("href"), "llms.txt");
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), "https://horaciochacon.github.io/stepdeck/");
      assert.equal(await page.locator('meta[property="og:title"]').getAttribute("content"), "stepdeck");
      assert.equal(await page.locator('meta[property="og:description"]').getAttribute("content"), await page.locator('meta[name="description"]').getAttribute("content"));
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
      assert.match(await page.locator("main").innerText(), /Layouts[\s\S]*Components[\s\S]*Motion[\s\S]*Data stories[\s\S]*Custom components/);

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
      // One link per gallery slide and one per doc page (the motion slides share the motion guide), plus the rest.
      const docs = new Set(entries.map((e) => e.doc)).size;
      assert.ok(inSite.length >= entries.length + docs + 6, "the page links into the site");
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

test("404 page under /stepdeck/: styled, and its links go home, to the docs and to the gallery", async () => {
  await underPrefix((dir) =>
    withPage({ root: dir, url: "stepdeck/404.html", waitFor: (page, o) => page.waitForSelector("h1", o) }, async (page, ctx) => {
      assert.equal(await page.locator("h1").innerText(), "Page not found");
      // The stylesheet loaded (the page is served at any address, so it resolves from <base>).
      assert.equal(await page.evaluate(() => document.fonts.ready.then(() => getComputedStyle(document.querySelector(".card")).borderTopStyle)), "solid");
      const prefix = `${ctx.base}stepdeck/`;
      const hrefs = await page.locator(".card").evaluateAll((as) => as.map((a) => a.href));
      assert.deepEqual(hrefs, [prefix, `${prefix}site/docs/`, `${prefix}site/gallery/`]);
      const statuses = await page.evaluate((urls) => Promise.all(urls.map((u) => fetch(u).then((r) => r.text().then(() => r.status)))), hrefs);
      assert.deepEqual(statuses, [200, 200, 200]);
      assert.deepEqual(ctx.errors, []);
      assert.deepEqual(ctx.failed, []);
    }),
  );
});
