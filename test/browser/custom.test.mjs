// A custom component composing a built-in (hard case 3, spec §5, §6.2, §6.3): demo.story draws its
// own SVG and mounts the built-in `text` through ctx.mount; the slide drives it with `stage` + advance.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { createRegistry } from "../../core/registry.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const spike = (q) => `core/render.html?deck=../examples/spike/&slide=story&${q}`;
const STEPS = ["start", "collect", "analyze", "share"];

const snapshot = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-el="story"]');
    const caption = el.querySelector(".sd-text");
    const svg = el.querySelector("svg");
    return {
      caption: caption?.textContent,
      captionClass: caption?.className,
      captionSize: caption ? parseFloat(getComputedStyle(caption).fontSize) : null,
      stage: Number(el.querySelector("[data-stage]")?.dataset.stage),
      marker: el.querySelector(".sd-story-marker")?.getAttribute("cx"),
      filled: [...el.querySelectorAll(".sd-story-node")].map((n) => n.dataset.on),
      svgHtml: svg?.outerHTML.replace(/\s*style=""/g, ""),
      labelSizes: [...svg.querySelectorAll("text")].map((t) => parseFloat(getComputedStyle(t).fontSize)),
      html: el.innerHTML.replace(/\s*style=""/g, ""),
    };
  });

const goTo = async (page, step) => {
  await page.evaluate((s) => window.STEPDECK.goTo("story", s), step);
  await page.evaluate(() => window.STEPDECK.settled());
};

test("custom component resolves before built-ins: a deck component is found in the deck folder", async () => {
  await withPage({ root, url: spike("step=start") }, async (page, ctx) => {
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
    const requested = ctx.requests.map((u) => new URL(u).pathname);
    assert.ok(requested.some((p) => p.endsWith("/examples/spike/components/demo.story/index.js")), "imported from the deck");
    const story = requested.filter((p) => p.includes("/components/demo.story/"));
    assert.ok(story.length > 0 && story.every((p) => p.startsWith("/examples/spike/")), "never looked up under the built-in root");
    // The slide drew a custom SVG and a built-in text inside the same element.
    const s = await snapshot(page);
    assert.ok(s.svgHtml.includes("<svg"), "custom SVG");
    assert.match(s.captionClass, /sd-text/, "built-in text mounted inside");
  });
});

test("registry: a name declared by the deck is imported from the deck root, never from the built-in root", async () => {
  const urls = [];
  const importer = async (url) => {
    urls.push(url);
    return { default: { mount() {} } };
  };
  const registry = createRegistry({
    builtinRoot: "engine/components",
    deckRoot: "deck/components",
    builtins: ["text", "chart.line"],
    deckComponents: ["demo.story"],
    importer,
  });
  await registry.get("demo.story");
  await registry.get("text");
  assert.deepEqual(urls, ["deck/components/demo.story/index.js", "engine/components/text/index.js"]);
});

test("non-namespaced collision errors: a deck component named like a built-in", async () => {
  await withPage({ root, url: "core/render.html?deck=../test/fixtures/decks/collision/&slide=uses-text" }, async (page) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.ok(errors.some((e) => e.includes("collides")), `errors: ${JSON.stringify(errors)}`);
    assert.ok(errors.some((e) => e.includes("my.text")), "the fix names a namespace");
    assert.equal(await page.locator('[data-el="para"] .sd-text').count(), 0, "the deck's text was never mounted");
    assert.ok((await page.locator(".sd-error").count()) >= 1, "the failure is on the canvas");
  });
});

test("nested built-in updates with stage: the caption changes, the SVG follows", async () => {
  await withPage({ root, url: spike("step=start") }, async (page, ctx) => {
    const seen = [];
    for (const [i, step] of STEPS.entries()) {
      await goTo(page, step);
      const s = await snapshot(page);
      assert.equal(s.stage, i);
      assert.deepEqual(s.filled, STEPS.map((_, k) => String(k <= i)), `nodes filled up to stage ${i}`);
      assert.ok(s.caption && s.caption.length > 0);
      seen.push(s.caption);
    }
    assert.equal(new Set(seen).size, STEPS.length, "a different caption at every stage");
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});

test("jumped equals played, and backward equals a fresh load", async () => {
  const fresh = {};
  for (const step of STEPS) {
    await withPage({ root, url: spike(`step=${step}&capture`) }, async (page) => {
      fresh[step] = (await snapshot(page)).html;
    });
  }
  await withPage({ root, url: spike("step=start&motion=full") }, async (page) => {
    for (const step of STEPS.slice(1)) {
      await goTo(page, step); // forward by one, animated
      assert.equal((await snapshot(page)).html, fresh[step], `played to ${step}`);
    }
    await goTo(page, "collect"); // backward
    assert.equal((await snapshot(page)).html, fresh.collect, "backward to collect");
    await goTo(page, "start");
    await goTo(page, "share"); // jump
    assert.equal((await snapshot(page)).html, fresh.share, "jumped to share");
  });
});

test("a step change mid-animation lands on the final state of the latest step", async () => {
  await withPage({ root, url: spike("step=start&motion=full") }, async (page) => {
    await page.evaluate(() => {
      window.STEPDECK.goTo("story", "collect");
      window.STEPDECK.goTo("story", "analyze");
    });
    await page.evaluate(() => window.STEPDECK.settled());
    const s = await snapshot(page);
    assert.equal(s.stage, 2);
    assert.equal(s.filled.filter((v) => v === "true").length, 3);
  });
});

test("all text inside the story is at least the audience minimum (28px)", async () => {
  await withPage({ root, url: spike("step=share") }, async (page) => {
    const s = await snapshot(page);
    assert.ok(s.captionSize >= 28, `caption ${s.captionSize}px`);
    assert.ok(s.labelSizes.length >= 4);
    for (const size of s.labelSizes) assert.ok(size >= 28, `svg label ${size}px`);
  });
});
