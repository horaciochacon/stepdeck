// Bare shell (core/render.html) rendered in Chrome. Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { serve } from "../../cli/serve.js";
import { request } from "node:http";

const rawStatus = (base, path) =>
  new Promise((ok, fail) => {
    const { hostname, port } = new URL(base);
    request({ hostname, port, path }, (res) => {
      res.resume();
      ok(res.statusCode);
    }).on("error", fail).end();
  });

const root = fileURLToPath(new URL("../../", import.meta.url));
const spike = (q) => `engine/core/render.html?deck=../../examples/spike/&${q}`;
const fixture = (deck, q) => `engine/core/render.html?deck=../../test/fixtures/decks/${deck}/&${q}`;

const box = (page, id) =>
  page.evaluate((id) => {
    const el = document.querySelector(`[data-el="${id}"]`);
    if (!el) return null;
    return { visibility: getComputedStyle(el).visibility, height: el.offsetHeight };
  }, id);

test("bare shell renders step", async () => {
  await withPage({ root, url: spike("slide=hello&step=one") }, async (page, ctx) => {
    const hidden = await box(page, "reveal");
    assert.equal(hidden.visibility, "hidden");
    assert.ok(hidden.height > 0, "a hidden element keeps its box height");
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.slides), ["cover", "hello", "trend", "terminal", "story"]);
    assert.deepEqual((await page.evaluate(() => window.STEPDECK.steps)).hello, ["one", "two"]);

    await ctx.open(spike("slide=hello&step=two&capture"));
    const shown = await box(page, "reveal");
    assert.equal(shown.visibility, "visible");
    assert.equal(shown.height, hidden.height);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("capture")), true);
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});

test("collapse removes space", async () => {
  await withPage({ root, url: spike("slide=hello&step=one") }, async (page, ctx) => {
    assert.equal((await box(page, "aside")).height, 0);
    await page.evaluate(() => window.STEPDECK.goTo("hello", "two"));
    const shown = await box(page, "aside");
    assert.equal(shown.visibility, "visible");
    assert.ok(shown.height > 0);
    assert.deepEqual(ctx.errors, []);
  });
});

test("scoped style does not leak", async () => {
  await withPage({ root, url: fixture("styled", "slide=styled") }, async (page) => {
    const colors = await page.evaluate(() => {
      const outside = document.body.appendChild(document.createElement("p"));
      outside.textContent = "outside";
      const inside = document.querySelector('[data-slide="styled"] p');
      return { inside: getComputedStyle(inside).color, outside: getComputedStyle(outside).color };
    });
    assert.equal(colors.inside, "rgb(255, 0, 0)");
    assert.notEqual(colors.outside, "rgb(255, 0, 0)");
  });
});

test("failing slide shows error on canvas", async () => {
  await withPage({ root, url: fixture("broken", "slide=bad-type") }, async (page, ctx) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.equal(errors.length, 1);
    const shown = await page.evaluate(() => [...document.querySelectorAll(".sd-canvas .sd-error")].map((e) => ({
      text: e.textContent,
      visibility: getComputedStyle(e).visibility,
    })));
    assert.equal(shown.length, 1);
    assert.match(shown[0].text, /did you mean 'text'/);
    assert.equal(shown[0].visibility, "visible");
    assert.equal((await box(page, "ok")).visibility, "visible", "the other element still renders");
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("structural error while folding a step shows on canvas, never as an unhandled rejection", async () => {
  await withPage({ root, url: fixture("broken", "slide=bad-patch&step=oops") }, async (page, ctx) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^bad-patch: unknown element 'ghost'/);
    const text = await page.evaluate(() => document.querySelector(".sd-canvas .sd-error")?.textContent);
    assert.match(text ?? "", /unknown element 'ghost'/);
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("a slide that throws while building its frame still shows its error on the canvas", async () => {
  await withPage({ root, url: fixture("broken", "slide=bad-shape") }, async (page, ctx) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^bad-shape: /);
    const shown = await page.evaluate(() => document.querySelector('.sd-canvas[data-slide="bad-shape"] .sd-error')?.textContent);
    assert.equal(shown, errors[0]);
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("a cross-origin deck is refused on the canvas and never fetched", async () => {
  await withPage({ root, url: "engine/core/render.html?deck=https://deck.example.invalid/" }, async (page, ctx) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /deck must be same-origin/);
    const text = await page.evaluate(() => document.querySelector(".sd-canvas .sd-error")?.textContent);
    assert.match(text ?? "", /deck must be same-origin/);
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.slides), []);
    assert.deepEqual(ctx.requests.filter((u) => new URL(u).hostname === "deck.example.invalid"), []);
  });
});

test("serve sends no-store", async () => {
  const server = await serve({ root, port: 0 });
  try {
    const ok = await fetch(new URL("engine/core/render.html", server.url));
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "no-store");
    assert.match(ok.headers.get("content-type"), /^text\/html/);
    const js = await fetch(new URL("engine/core/stepdeck.js", server.url));
    assert.match(js.headers.get("content-type"), /^text\/javascript/);
    assert.equal(js.headers.get("cache-control"), "no-store");
    assert.equal((await fetch(new URL("no/such/file.js", server.url))).status, 404);
    // fetch() would normalize "..", so send raw paths. Dot segments are normalized away (404 inside
    // root); an encoded slash survives URL parsing and must be refused.
    for (const path of ["/../../etc/passwd", "/%2e%2e/%2e%2e/etc/passwd"]) {
      assert.equal(await rawStatus(server.url, path), 404, `stays inside root: ${path}`);
    }
    assert.equal(await rawStatus(server.url, "/..%2f..%2f..%2fetc/passwd"), 403);
  } finally {
    await server.close();
  }
});
