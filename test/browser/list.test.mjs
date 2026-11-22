// `list` in Chrome (slide kit 1). Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/list.test.mjs
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
  elementHtml,
  htmlAfterJump,
  sampleFrames,
} from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const deck = fileURLToPath(new URL("../fixtures/decks/list/", import.meta.url));
const pages = deckPages("test/fixtures/decks/list/");
const motion = deckPages("test/fixtures/decks/motion/"); // modern theme: --sd-duration 400ms, --sd-stagger 80ms
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

// Owned entrance. Per frame: each item's computed opacity, each tick's computed visibility and whether it has a
// dash style, and whether any inline style is left on an item.
const buildProbe = (el) => {
  const rows = [...el.querySelectorAll(".sd-list-item")];
  const ticks = rows.map((li) => li.querySelector(".sd-list-tick"));
  return {
    ops: rows.map((li) => Number(getComputedStyle(li).opacity)),
    tickShown: ticks.map((t) => getComputedStyle(t).visibility === "visible"),
    dashed: ticks.map((t) => t.style.strokeDasharray !== "" || t.style.strokeDashoffset !== ""),
    inline: rows.some((li) => li.getAttribute("style") !== null),
  };
};

test("list entering with shown 0 to 3 plays one staggered build", async () => {
  await withPage({ root, url: motion.url("list-enters", "step=start&motion=full") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    const r = await sampleFrames(page, "list-enters", "go", "list", buildProbe);
    const shown = r.frames.filter((f) => f.visible);
    assert.ok(shown.length > 0, "the list is shown");
    const first = shown[0];
    assert.ok(first.ms >= 150, `held for the third slot, 2 x 80 ms (first shown at ${first.ms.toFixed(0)} ms)`);
    assert.ok(first.ops.every((o) => o < 0.5), `no item shows built at the first shown frame (${first.ops})`);
    assert.deepEqual(r.frames.filter((f) => f.style !== null).map((f) => f.style), [], "the box stays still: the items rise themselves");

    // At 60 ms into the build the first item is on its way and the third has not begun.
    const at60 = shown.find((f) => f.ms >= first.ms + 60);
    assert.ok(at60.ops[0] > at60.ops[2], `item 1 is more opaque than item 3 at 60 ms (${at60.ops})`);
    assert.ok(shown.every((f) => f.ops[0] >= f.ops[1] && f.ops[1] >= f.ops[2]), "items come in in order, never out of it");
    // Items start one --sd-stagger (80 ms) apart: the third 2 x 80 ms after the first (a frame of slack each side).
    const startOf = (i) => shown.find((f) => f.ops[i] > 0).ms;
    const lag = startOf(2) - startOf(0);
    assert.ok(lag >= 140 && lag < 600, `the third item starts ~160 ms after the first (${lag.toFixed(0)} ms)`);

    // A done tick draws after its row has risen, and an undone item never shows one.
    assert.ok(shown.every((f) => !f.tickShown[0] || f.ops[0] >= 0.99), "a tick shows only once its row is in");
    assert.ok(shown.some((f) => f.dashed[0]) && shown.some((f) => f.dashed[1]), "the done ticks were drawn");
    assert.ok(shown.every((f) => !f.tickShown[2]), "an item that is not done never shows a tick");
    assert.equal(r.end.inline, false, "no inline style left on an item");
    assert.ok(r.settledMs < 6000, `the build settles (${r.settledMs.toFixed(0)} ms)`);
    assert.equal(await elementHtml(page, "list"), await htmlAfterJump(ctx, page, motion, "list-enters", "go", "list"));

    // Played, backward and interrupted (while held, and mid-build) equal a jump.
    const steps = ["start", "go", "more"];
    await expectJumpEqualsPlayed(ctx, page, { pages: motion, slide: "list-enters", steps, id: "list" });
    await expectBackwardEqualsJump(ctx, page, { pages: motion, slide: "list-enters", steps, id: "list" });
    await expectInterruptEqualsJump(ctx, page, { pages: motion, slide: "list-enters", from: "start", via: "go", to: "more", id: "list" });
    const jumped = await htmlAfterJump(ctx, page, motion, "list-enters", "more", "list");
    await ctx.open(motion.url("list-enters", "step=start&motion=full"));
    const midBuild = await page.evaluate(async () => {
      const first = () => document.querySelector('[data-el="list"] .sd-list-item');
      window.STEPDECK.goTo("list-enters", "go");
      let building = false;
      for (let i = 0; i < 300 && !building; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const o = Number(getComputedStyle(first()).opacity);
        building = o > 0 && o < 1 && getComputedStyle(document.querySelector('[data-el="list"]')).visibility === "visible";
      }
      window.STEPDECK.goTo("list-enters", "more");
      await window.STEPDECK.settled();
      return building;
    });
    assert.ok(midBuild, "the list was being built when the next step came");
    assert.equal(await elementHtml(page, "list"), jumped, "interrupted mid-build equals a jump");
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});

test("the items' start state is written before update awaits; a shown element without an entrance snaps", async () => {
  await withPage({ root, url: pages.url("reveal", "step=none") }, async (page) => {
    const r = await page.evaluate(async () => {
      const { default: list } = await import("../components/list/index.js");
      const { animate } = await import("../core/animate.js");
      const { makeMotion } = await import("../core/motion.js");
      const host = document.createElement("div");
      document.querySelector(".sd-canvas").appendChild(host);
      const ctx = { animate, motion: makeMotion({}), tokens: {} };
      const props = { marker: "check", shown: 3, done: 1, items: [{ text: "One" }, { text: "Two" }, { text: "Three" }] };
      const inst = await list.mount(host, { ...props, shown: 0, done: 0 }, ctx);
      const rows = () => [...host.querySelectorAll(".sd-list-item")];
      const signal = new AbortController().signal;
      const info = (extra) => ({ prev: { ...props, shown: 0, done: 0 }, changed: ["shown", "done"], animate: true, entered: true, entrance: null, signal, ...extra });

      // A drawn entrance: opacity 0 and a hidden tick at once, before update returns its promise.
      const drawing = inst.update(props, info({ entrance: { motion: "draw", duration: 120 } }));
      const sync = { ops: rows().map((li) => li.style.opacity), tick: host.querySelector(".sd-list-tick").style.visibility };
      await drawing;
      const afterDraw = rows().map((li) => li.getAttribute("style"));
      // An entrance of "none", and an entered element with no entrance at all (a box moves instead): snap.
      const out = {};
      for (const [name, entrance] of [["none", { motion: "none", duration: 0 }], ["moved", null]]) {
        await inst.update({ ...props, shown: 0, done: 0 }, info({ entered: false, entrance: null, animate: false }));
        const p = inst.update(props, info({ entrance }));
        out[name] = { sync: rows().map((li) => li.style.opacity), tick: host.querySelector(".sd-list-tick").style.visibility };
        await p;
      }
      return { sync, afterDraw, out };
    });
    assert.deepEqual(r.sync.ops, ["0", "0", "0"], "every visible item starts at opacity 0");
    assert.equal(r.sync.tick, "hidden", "a tick that draws later starts hidden");
    assert.deepEqual(r.afterDraw, [null, null, null], "no inline style after the build");
    for (const name of ["none", "moved"]) {
      assert.deepEqual(r.out[name].sync, ["", "", ""], `${name}: nothing is held back`);
      assert.equal(r.out[name].tick, "", `${name}: no tick is hidden`);
    }
  });
});
