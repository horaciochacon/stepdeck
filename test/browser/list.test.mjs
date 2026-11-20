// `list` in Chrome (slide kit 1, task 2). Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test --test-concurrency=1 test/browser/list.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { check } from "../../cli/check.js";
import { formatProblem } from "../../cli/problems.js";
import {
  deckPages,
  goTo,
  settled,
  expectJumpEqualsPlayed,
  expectBackwardEqualsJump,
  expectInterruptEqualsJump,
  expectAnimatedStepMoves,
} from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const deck = fileURLToPath(new URL("../fixtures/decks/list/", import.meta.url));
const pages = deckPages("test/fixtures/decks/list/");
const REVEAL = ["none", "one", "two", "three"];
const CHECK = ["start", "first", "second", "all", "byid"];

// Per item: visibility, done, active (what a viewer sees), read from the DOM.
const items = (page, id = "list") =>
  page.evaluate((id) => {
    const rows = [...document.querySelectorAll(`[data-el="${id}"] .sd-list-item`)];
    return rows.map((li) => ({
      visible: getComputedStyle(li).visibility === "visible",
      done: li.dataset.done === "true",
      active: li.dataset.active === "true",
      tick: li.querySelector(".sd-list-tick") ? getComputedStyle(li.querySelector(".sd-list-tick")).visibility : null,
    }));
  }, id);

test("jump equals played: reveal and checklist", async () => {
  await withPage({ root, url: pages.url("reveal", "step=none") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "reveal", steps: REVEAL, id: "list" });
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "check", steps: CHECK, id: "list" });
  });
});

test("backward equals jump: reveal and checklist", async () => {
  await withPage({ root, url: pages.url("reveal", "step=none") }, async (page, ctx) => {
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "reveal", steps: REVEAL, id: "list" });
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "check", steps: CHECK, id: "list" });
  });
});

test("interrupt mid-motion equals jump", async () => {
  await withPage({ root, url: pages.url("reveal", "step=none") }, async (page, ctx) => {
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "reveal", from: "none", via: "one", to: "three", id: "list" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "reveal", from: "two", via: "three", to: "none", id: "list" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "check", from: "start", via: "first", to: "second", id: "list" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "check", from: "first", via: "second", to: "start", id: "list" });
  });
});

test("animated step moves", async () => {
  await withPage({ root, url: pages.url("reveal", "step=none") }, async (page, ctx) => {
    const reveal = await expectAnimatedStepMoves(ctx, page, {
      pages, slide: "reveal", from: "none", to: "one", id: "list",
      probe: (p) => p.evaluate(() => [...document.querySelectorAll('[data-el="list"] .sd-list-item')].map((li) => getComputedStyle(li).opacity).join(",")),
    });
    assert.match(reveal.mid, /^0\.\d+,1,1$/, "the new item is part-way through its fade");
    // The tick of a newly done item draws: its dash offset is mid-way 120 ms in.
    await expectAnimatedStepMoves(ctx, page, {
      pages, slide: "check", from: "start", to: "first", id: "list",
      probe: (p) => p.evaluate(() => document.querySelector('[data-el="list"] .sd-list-item[data-done="true"] .sd-list-tick')?.style.strokeDashoffset ?? "settled"),
    });
  });
});

test("shown hides items but they keep their space", async () => {
  await withPage({ root, url: pages.url("reveal", "step=one") }, async (page, ctx) => {
    const boxes = (p) => p.evaluate(() => [...document.querySelectorAll('[data-el="list"] .sd-list-item')].map((li) => { const r = li.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height)]; }));
    const atOne = await boxes(page);
    assert.deepEqual((await items(page)).map((i) => i.visible), [true, false, false]);
    await ctx.open(pages.url("reveal", "step=three"));
    assert.deepEqual(await boxes(page), atOne, "the geometry is the same with every item shown");
    assert.deepEqual((await items(page)).map((i) => i.visible), [true, true, true]);
    await ctx.open(pages.url("reveal", "step=none"));
    assert.deepEqual((await items(page)).map((i) => i.visible), [false, false, false]);
    assert.deepEqual(ctx.errors, []);
  });
});

test("checklist ticks forward and unticks backward", async () => {
  await withPage({ root, url: pages.url("check", "step=start&motion=full") }, async (page, ctx) => {
    const dones = async () => (await items(page)).map((i) => i.done);
    const ticks = async () => (await items(page)).map((i) => i.tick);
    assert.deepEqual(await dones(), [false, false, false]);
    assert.deepEqual(await ticks(), ["hidden", "hidden", "hidden"]);
    await goTo(page, "check", "first");
    assert.deepEqual(await dones(), [true, false, false]);
    assert.deepEqual(await ticks(), ["visible", "hidden", "hidden"]);
    await goTo(page, "check", "second");
    assert.deepEqual(await dones(), [true, true, false]);
    assert.deepEqual((await items(page)).map((i) => i.active), [false, false, true], "active by id");
    await goTo(page, "check", "all");
    assert.deepEqual(await dones(), [true, true, true]);
    assert.deepEqual((await items(page)).map((i) => i.active), [false, false, true], "active by index");
    await goTo(page, "check", "byid");
    assert.deepEqual(await dones(), [false, false, true], "done by id");
    await goTo(page, "check", "second");
    assert.deepEqual(await dones(), [true, true, false], "ticks come off backward");
    await goTo(page, "check", "start");
    assert.deepEqual(await dones(), [false, false, false]);
    assert.deepEqual(await ticks(), ["hidden", "hidden", "hidden"]);
    assert.deepEqual(ctx.errors, []);
  });
});

test("an item that appears already done shows no tick before its draw starts", async () => {
  await withPage({ root, url: pages.url("reveal-done", "step=a&motion=full") }, async (page, ctx) => {
    // Sample the second item every frame while it rises in and its tick is drawn.
    const samples = await page.evaluate(async () => {
      const out = [];
      window.STEPDECK.goTo("reveal-done", "b");
      const li = document.querySelectorAll('[data-el="list"] .sd-list-item')[1];
      const tick = li.querySelector(".sd-list-tick");
      const t0 = performance.now();
      while (performance.now() - t0 < 1200) {
        out.push({ opacity: Number(getComputedStyle(li).opacity), visibility: getComputedStyle(tick).visibility, dash: tick.style.strokeDasharray !== "" });
        await new Promise((r) => requestAnimationFrame(r));
      }
      return out;
    });
    await settled(page);
    const firstDash = samples.findIndex((s) => s.dash);
    assert.ok(firstDash > 0, "the tick's draw was seen mid-flight");
    assert.ok(samples.slice(0, firstDash).some((s) => s.opacity > 0 && s.opacity < 1), "the row was sampled mid-rise");
    const early = samples.slice(0, firstDash).filter((s) => s.visibility !== "hidden");
    assert.deepEqual(early, [], "the tick stays hidden until its draw starts");
    assert.equal(samples.at(-1).visibility, "visible", "the tick is shown once drawn");
    assert.deepEqual(ctx.errors, []);
  });
});

test("reveal and tick in one step: played, backward and interrupted equal a jump", async () => {
  await withPage({ root, url: pages.url("reveal-done", "step=a") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "reveal-done", steps: ["a", "b", "c"], id: "list" });
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "reveal-done", steps: ["a", "b", "c"], id: "list" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "reveal-done", from: "a", via: "b", to: "c", id: "list" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "reveal-done", from: "b", via: "c", to: "a", id: "list" });
  });
});

test("text is at least 28px", async () => {
  await withPage({ root, url: pages.url("check", "step=all") }, async (page) => {
    const sizes = await page.evaluate(() => {
      const min = parseFloat(getComputedStyle(document.querySelector(".sd-canvas")).getPropertyValue("--sd-min-audience-font"));
      const px = (sel) => [...document.querySelectorAll(`[data-el="list"] ${sel}`)].map((n) => parseFloat(getComputedStyle(n).fontSize));
      return { min, text: px(".sd-list-text"), sub: px(".sd-list-sub") };
    });
    assert.equal(sizes.min, 28);
    assert.equal(sizes.text.length, 3);
    assert.ok(sizes.text.every((s) => s >= 28), `item text ${sizes.text}`);
    assert.ok(sizes.sub.length >= 1 && sizes.sub.every((s) => s >= 28), `sub text ${sizes.sub}`);
  });
  await withPage({ root, url: pages.url("letters", "") }, async (page) => {
    const m = await page.evaluate(() => [...document.querySelectorAll('[data-el="list"] .sd-list-marker')].map((n) => parseFloat(getComputedStyle(n).fontSize)));
    assert.ok(m.length === 3 && m.every((s) => s >= 28), `markers ${m}`);
  });
});

test("letters stay latin in es", async () => {
  await withPage({ root, url: pages.url("letters", "") }, async (page, ctx) => {
    const markers = await page.evaluate(() => [...document.querySelectorAll('[data-el="list"] .sd-list-marker')].map((n) => n.textContent));
    assert.deepEqual(markers, ["a.", "b.", "c."]);
    await ctx.open(pages.url("reveal", "step=three"));
    assert.deepEqual(
      await page.evaluate(() => [...document.querySelectorAll('[data-el="list"] .sd-list-marker')].map((n) => n.textContent)),
      ["1.", "2.", "3."],
    );
  });
});

test("inline markdown renders; raw html and unsafe links stay inert", async () => {
  await withPage({ root, url: pages.url("bullets", "") }, async (page, ctx) => {
    const r = await page.evaluate(() => {
      const el = document.querySelector('[data-el="list"]');
      return {
        strong: el.querySelectorAll("strong").length,
        em: el.querySelectorAll("em").length,
        code: el.querySelectorAll("code").length,
        imgs: el.querySelectorAll("img").length,
        links: [...el.querySelectorAll("a")].map((a) => a.getAttribute("href")),
        pwned: window.__pwned,
        text: el.textContent,
      };
    });
    assert.deepEqual([r.strong, r.em, r.code], [1, 1, 1]);
    assert.equal(r.imgs, 0, "raw html is shown as text");
    assert.match(r.text, /<img src=x/);
    assert.deepEqual(r.links, ["#ok"], "the javascript: link is plain text");
    assert.equal(r.pwned, undefined);
    assert.deepEqual(ctx.errors, []);
  });
});

test("unknown done id is an element error naming it; the sibling carries on", async () => {
  await withPage({ root, url: pages.url("badid", "") }, async (page) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^badid\/bad: .*zz/);
    assert.match(await page.textContent('[data-el="ok"]'), /Este sigue/);
    assert.match((await page.textContent('[data-el="bad"] .sd-error')) ?? "", /zz/);
  });
});

test("long item text wraps inside its box", async () => {
  await withPage({ root, url: pages.url("long", "") }, async (page) => {
    const r = await page.evaluate(() => {
      const region = document.querySelector('[data-region="main"]').getBoundingClientRect();
      const li = [...document.querySelectorAll('[data-el="list"] .sd-list-item')][1];
      const box = li.getBoundingClientRect();
      const text = li.querySelector(".sd-list-text");
      const lineH = parseFloat(getComputedStyle(text).lineHeight);
      return { inside: box.left >= region.left - 0.5 && box.right <= region.right + 0.5, lines: text.getBoundingClientRect().height / lineH, scroll: li.scrollWidth - li.clientWidth };
    });
    assert.ok(r.inside, "the item stays inside the main region");
    assert.ok(r.lines > 1.5, `the long text wraps (${r.lines} lines)`);
    assert.ok(r.scroll <= 1, "no horizontal overflow");
  });
});

test("check is clean on the list slides", async () => {
  for (const slide of ["reveal", "check", "letters", "bullets", "long", "reveal-done"]) {
    const problems = await check(deck, { slide });
    assert.deepEqual(problems.map(formatProblem), [], slide);
  }
});
