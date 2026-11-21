// `timeline` in Chrome (slide kit 1). Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test --test-concurrency=1 test/browser/timeline.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { check } from "../../cli/check.js";
import { formatProblem } from "../../cli/problems.js";
import {
  deckPages,
  goTo,
  expectJumpEqualsPlayed,
  expectBackwardEqualsJump,
  expectInterruptEqualsJump,
  expectAnimatedStepMoves,
  elementHtml,
  htmlAfterJump,
  sampleFrames,
} from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const deck = fileURLToPath(new URL("../fixtures/decks/timeline/", import.meta.url));
const pages = deckPages("test/fixtures/decks/timeline/");
const motion = deckPages("test/fixtures/decks/motion/"); // modern theme: --sd-duration 400ms, --sd-stagger 80ms
const STEPS = ["start", "half", "most", "full"];

// What a viewer sees: fill length against track length, and each stop's state.
const geometry = (page, slideEl = "tl") =>
  page.evaluate((id) => {
    const el = document.querySelector(`[data-el="${id}"]`);
    const track = el.querySelector(".sd-timeline-track").getBoundingClientRect();
    const fill = el.querySelector(".sd-timeline-fill").getBoundingClientRect();
    return { track: track.width, fill: fill.width, ratio: fill.width / track.width };
  }, slideEl);
const stops = (page, id = "tl") =>
  page.evaluate((id) => {
    const el = document.querySelector(`[data-el="${id}"]`);
    const accent = getComputedStyle(document.querySelector(".sd-canvas")).getPropertyValue("--sd-color-accent").trim();
    return [...el.querySelectorAll(".sd-timeline-stop")].map((c) => {
      const cs = getComputedStyle(c);
      return { reached: c.dataset.reached === "true", current: c.dataset.current === "true", r: parseFloat(cs.r), fill: cs.fill, accent };
    });
  }, id);

test("jump equals played", async () => {
  await withPage({ root, url: pages.url("fill", "step=start") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "fill", steps: STEPS, id: "tl" });
  });
});

test("backward equals jump", async () => {
  await withPage({ root, url: pages.url("fill", "step=start") }, async (page, ctx) => {
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "fill", steps: STEPS, id: "tl" });
  });
});

test("interrupt mid-motion equals jump", async () => {
  await withPage({ root, url: pages.url("fill", "step=start") }, async (page, ctx) => {
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "fill", from: "start", via: "half", to: "full", id: "tl" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "fill", from: "half", via: "most", to: "start", id: "tl" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "fill", from: "most", via: "full", to: "half", id: "tl" });
  });
});

test("animated step moves: the fill is part-way and a stop lights up as it passes", async () => {
  await withPage({ root, url: pages.url("fill", "step=start") }, async (page, ctx) => {
    const probe = (p) => p.evaluate(() => {
      const el = document.querySelector('[data-el="tl"]');
      return `${el.querySelector(".sd-timeline-fill").getAttribute("x2")}|${[...el.querySelectorAll(".sd-timeline-stop")].map((c) => c.dataset.reached).join(",")}`;
    });
    const { mid, end } = await expectAnimatedStepMoves(ctx, page, { pages, slide: "fill", from: "start", to: "half", id: "tl", probe });
    assert.match(mid, /\|true,false,false,false$/, "the second stop is not lit before the fill reaches it");
    assert.match(end, /\|true,true,false,false$/);
  });
});

test("fill width matches progress", async () => {
  await withPage({ root, url: pages.url("fill", "step=half") }, async (page, ctx) => {
    let g = await geometry(page);
    assert.ok(Math.abs(g.fill - g.track / 2) <= 2, `half: fill ${g.fill} of track ${g.track}`);
    for (const [step, p] of [["start", 0], ["most", 0.8], ["full", 1]]) {
      await ctx.open(pages.url("fill", `step=${step}`));
      g = await geometry(page);
      assert.ok(Math.abs(g.fill - g.track * p) <= 2, `${step}: fill ${g.fill} of track ${g.track}`);
    }
    assert.deepEqual(ctx.errors, []);
  });
  await withPage({ root, url: pages.url("spaced", "") }, async (page) => {
    const g = await geometry(page);
    assert.ok(Math.abs(g.fill - g.track * 0.4) <= 2, `spaced: fill ${g.fill} of track ${g.track}`);
  });
});

test("stops light up as the fill passes them; the current one is emphasised", async () => {
  await withPage({ root, url: pages.url("fill", "step=half") }, async (page, ctx) => {
    let s = await stops(page);
    assert.deepEqual(s.map((x) => x.reached), [true, true, false, false]);
    assert.deepEqual(s.map((x) => x.current), [false, true, false, false]);
    assert.ok(s[0].fill !== s[2].fill, "a reached stop is filled, an unreached one is not");
    assert.ok(s[2].fill === "rgb(255, 255, 255)" || s[2].fill.startsWith("rgb"), "unreached is hollow (background fill)");
    assert.ok(s[1].r > s[0].r && s[1].r > s[2].r, `the current stop is larger: ${s.map((x) => x.r)}`);
    const weights = await page.evaluate(() => [...document.querySelectorAll('[data-el="tl"] .sd-timeline-text')].map((n) => parseInt(getComputedStyle(n).fontWeight, 10)));
    assert.ok(weights[1] > weights[0] && weights[1] > weights[2], `current label is bold: ${weights}`);
    await ctx.open(pages.url("fill", "step=start"));
    assert.deepEqual((await stops(page)).map((x) => x.reached), [true, false, false, false]);
    await ctx.open(pages.url("spaced", ""));
    assert.deepEqual((await stops(page)).map((x) => x.reached), [true, true, true, false], "a stop is reached when the fill meets it");
    assert.deepEqual(ctx.errors, []);
  });
});

test("going backward retracts the fill and dims the stops", async () => {
  await withPage({ root, url: pages.url("fill", "step=full&motion=full") }, async (page) => {
    assert.deepEqual((await stops(page)).map((x) => x.reached), [true, true, true, true]);
    await goTo(page, "fill", "half");
    assert.deepEqual((await stops(page)).map((x) => x.reached), [true, true, false, false]);
    const g = await geometry(page);
    assert.ok(Math.abs(g.fill - g.track / 2) <= 2);
    await goTo(page, "fill", "start");
    assert.deepEqual((await stops(page)).map((x) => x.reached), [true, false, false, false]);
    assert.ok((await geometry(page)).fill <= 2);
  });
});

test("dashed: the unfilled track is dashed, the fill stays solid", async () => {
  await withPage({ root, url: pages.url("dashed", "") }, async (page) => {
    const r = await page.evaluate(() => {
      const el = document.querySelector('[data-el="tl"]');
      const dash = (sel) => getComputedStyle(el.querySelector(sel)).strokeDasharray;
      const accent = getComputedStyle(document.querySelector(".sd-canvas")).getPropertyValue("--sd-color-accent").trim();
      const rule = getComputedStyle(document.querySelector(".sd-canvas")).getPropertyValue("--sd-color-rule").trim();
      const stroke = (sel) => getComputedStyle(el.querySelector(sel)).stroke;
      const probe = document.createElement("i");
      const colour = (c) => { probe.style.color = c; el.appendChild(probe); const v = getComputedStyle(probe).color; probe.remove(); return v; };
      return { track: dash(".sd-timeline-track"), fill: dash(".sd-timeline-fill"), trackStroke: stroke(".sd-timeline-track"), fillStroke: stroke(".sd-timeline-fill"), accent: colour(accent), rule: colour(rule) };
    });
    assert.notEqual(r.track, "none");
    assert.equal(r.fill, "none");
    assert.equal(r.trackStroke, r.rule, "the track uses the rule token");
    assert.equal(r.fillStroke, r.accent, "the fill uses the accent token");
  });
  await withPage({ root, url: pages.url("fill", "step=half") }, async (page) => {
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-el="tl"] .sd-timeline-track')).strokeDasharray), "none", "solid by default");
  });
});

test("text is at least 28px", async () => {
  await withPage({ root, url: pages.url("fill", "step=half") }, async (page) => {
    const sizes = await page.evaluate(() => {
      const min = parseFloat(getComputedStyle(document.querySelector(".sd-canvas")).getPropertyValue("--sd-min-audience-font"));
      const px = (sel) => [...document.querySelectorAll(`[data-el="tl"] ${sel}`)].map((n) => parseFloat(getComputedStyle(n).fontSize));
      return { min, text: px(".sd-timeline-text"), sub: px(".sd-timeline-sub") };
    });
    assert.equal(sizes.min, 28);
    assert.equal(sizes.text.length, 4);
    assert.ok(sizes.text.every((s) => s >= 28), `labels ${sizes.text}`);
    assert.equal(sizes.sub.length, 2);
    assert.ok(sizes.sub.every((s) => s >= 28), `subs ${sizes.sub}`);
  });
});

test("fewer than two stops is an element error naming the problem; the sibling carries on", async () => {
  await withPage({ root, url: pages.url("bad", "") }, async (page) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^bad\/bad: .*at least 2 stops/);
    assert.match(await page.textContent('[data-el="ok"]'), /carries on/);
    assert.match((await page.textContent('[data-el="bad"] .sd-error')) ?? "", /at least 2 stops/);
  });
});

test("long labels wrap inside the region, first and last included", async () => {
  await withPage({ root, url: pages.url("long", "") }, async (page, ctx) => {
    const r = await page.evaluate(() => {
      const region = document.querySelector('[data-region="main"]').getBoundingClientRect();
      const texts = [...document.querySelectorAll('[data-el="tl"] .sd-timeline-text')];
      const subs = [...document.querySelectorAll('[data-el="tl"] .sd-timeline-sub')];
      const rects = [...texts, ...subs].map((n) => n.getBoundingClientRect());
      const lines = texts.map((n) => n.getBoundingClientRect().height / parseFloat(getComputedStyle(n).lineHeight));
      const el = document.querySelector('[data-el="tl"]').getBoundingClientRect();
      return { inside: rects.every((b) => b.left >= region.left - 0.5 && b.right <= region.right + 0.5), lines, elBottom: el.bottom, regionBottom: region.bottom, last: Math.max(...rects.map((b) => b.bottom)) };
    });
    assert.ok(r.inside, "every label and sub stays inside the main region");
    assert.ok(r.lines[0] > 1.5 && r.lines[3] > 1.5, `long labels wrap (${r.lines})`);
    assert.ok(r.last <= r.elBottom + 0.5, "the element is as tall as its labels");
    assert.deepEqual(ctx.errors, []);
  });
});

test("check is clean on the timeline slides", async () => {
  for (const slide of ["fill", "dashed", "long", "spaced"]) {
    const problems = await check(deck, { slide });
    assert.deepEqual(problems.map(formatProblem), [], slide);
  }
});

// Owned entrance, in the motion fixture's timeline-enters slide (four evenly spaced stops; progress 0.5 and the
// second stop current at the "go" step). Per frame: the fill as a fraction of the track, each stop's radius and
// lit state, each label's computed opacity, and whether any inline style is left on a label.
const buildProbe = (el) => {
  const num = (n, a) => Number(n.getAttribute(a));
  const track = el.querySelector(".sd-timeline-track");
  const fill = el.querySelector(".sd-timeline-fill");
  const stops = [...el.querySelectorAll(".sd-timeline-stop")];
  return {
    fill: (num(fill, "x2") - num(fill, "x1")) / (num(track, "x2") - num(track, "x1")),
    r: stops.map((c) => num(c, "r")),
    reached: stops.map((c) => c.dataset.reached === "true"),
    labels: [...el.querySelectorAll(".sd-timeline-label")].map((l) => Number(getComputedStyle(l).opacity)),
    inline: el.querySelectorAll("[style]").length > 0,
  };
};

test("timeline entering builds from empty: the fill runs, then the current stop grows", async () => {
  await withPage({ root, url: motion.url("timeline-enters", "step=start&motion=full") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    const r = await sampleFrames(page, "timeline-enters", "go", "tl", buildProbe);
    const shown = r.frames.filter((f) => f.visible);
    assert.ok(shown.length > 0, "the timeline is shown");
    const first = shown[0];
    const small = Math.min(...r.end.r);
    const big = Math.max(...r.end.r);
    assert.ok(big > small, `the current stop is larger at the end (${r.end.r})`);
    assert.ok(first.ms >= 150, `held for the third slot, 2 x 80 ms (first shown at ${first.ms.toFixed(0)} ms)`);
    assert.ok(first.fill === 0 && first.r.every((x) => x === small) && first.labels[1] < 0.5, `nothing shows built at the first shown frame (${JSON.stringify(first)})`);
    assert.deepEqual(r.frames.filter((f) => f.style !== null).map((f) => f.style), [], "the box stays still: the timeline builds itself");

    // 150 ms into the build the fill is on its way to the progress (0.5).
    const at150 = shown.find((f) => f.ms >= first.ms + 150);
    assert.ok(at150.fill > 0 && at150.fill < 0.5, `the fill is between 0 and the progress 150 ms in (${at150.fill.toFixed(3)})`);
    assert.ok(shown.every((f, i) => i === 0 || f.fill >= shown[i - 1].fill), "the fill only runs forward");
    assert.ok(shown.every((f) => !f.reached[1] || f.fill >= 1 / 3 - 1e-6), "a stop lights only once the fill has reached it");
    // Then the current stop grows and its label comes in, never before the fill is done.
    const growing = shown.filter((f) => f.r[1] > small && f.r[1] < big);
    assert.ok(growing.length >= 3, `the current stop was seen growing (${growing.length} frames)`);
    assert.ok(shown.every((f) => f.r[1] === small || f.fill >= 0.5 - 1e-6), "the current stop grows only after the fill reaches the progress");
    assert.ok(shown.every((f) => f.labels[1] === 0 || f.fill >= 0.5 - 1e-6), "its label comes in only after the fill is done");
    assert.ok(shown.some((f) => f.fill > 0.4 && f.fill < 0.5 && f.r[1] === small), "the fill was seen running with the current stop still small");
    assert.ok(Math.abs(r.end.fill - 0.5) < 1e-6 && r.end.r.every((x, i) => x === (i === 1 ? big : small)) && r.end.labels.every((o) => o === 1), "the end state is complete");
    assert.equal(r.end.inline, false, "no inline style left inside the timeline");
    assert.ok(r.settledMs < 6000, `the build settles (${r.settledMs.toFixed(0)} ms)`);
    assert.equal(await elementHtml(page, "tl"), await htmlAfterJump(ctx, page, motion, "timeline-enters", "go", "tl"));

    const steps = ["start", "go", "more"];
    await expectJumpEqualsPlayed(ctx, page, { pages: motion, slide: "timeline-enters", steps, id: "tl" });
    await expectBackwardEqualsJump(ctx, page, { pages: motion, slide: "timeline-enters", steps, id: "tl" });
    await expectInterruptEqualsJump(ctx, page, { pages: motion, slide: "timeline-enters", from: "start", via: "go", to: "more", id: "tl" });
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});

// Interrupted in each phase of the build; the page watches every frame until the phase holds, then asks for the
// next step. The phase must have been reached, or the test fails.
const phases = {
  held: "getComputedStyle(document.querySelector('[data-el=\"tl\"]')).visibility === 'hidden' && performance.now() - t0 > 60",
  fill: "p.fill > 0.1 && p.fill < 0.4 && p.r.every((x) => x === p.r[0])",
  grow: "Math.abs(p.fill - 0.5) < 1e-6 && p.r[1] > p.r[0] && p.labels[1] > 0.2 && p.labels[1] < 0.8",
};
for (const [phase, until] of Object.entries(phases)) {
  test(`timeline interrupted while ${phase === "held" ? "held" : phase === "fill" ? "its fill runs" : "its current stop grows"} snaps to the jumped state`, async () => {
    await withPage({ root, url: motion.url("timeline-enters", "step=more") }, async (page, ctx) => {
      const jumped = await elementHtml(page, "tl");
      await ctx.open(motion.url("timeline-enters", "step=start&motion=full"));
      const reached = await page.evaluate(
        async ([until, probe]) => {
          const read = new Function("el", `return (${probe})(el)`);
          const t0 = performance.now();
          window.STEPDECK.goTo("timeline-enters", "go");
          let hit = false;
          for (let i = 0; i < 400 && !hit; i++) {
            await new Promise((r) => requestAnimationFrame(r));
            const p = read(document.querySelector('[data-el="tl"]'));
            hit = new Function("p", "t0", `return ${until}`)(p, t0);
          }
          window.STEPDECK.goTo("timeline-enters", "more");
          await window.STEPDECK.settled();
          return hit;
        },
        [until, String(buildProbe)],
      );
      assert.ok(reached, `the ${phase} phase was reached before the next step came`);
      assert.equal(await elementHtml(page, "tl"), jumped, `interrupted in the ${phase} phase equals a jump`);
      assert.equal(await page.evaluate(() => document.querySelectorAll('[data-el="tl"] [style]').length), 0, "no inline styles remain");
      assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
      assert.deepEqual(ctx.errors, []);
    });
  });
}

test("a later step moves the fill and the current stop together", async () => {
  await withPage({ root, url: motion.url("timeline-enters", "step=go&motion=full") }, async (page, ctx) => {
    const r = await sampleFrames(page, "timeline-enters", "more", "tl", buildProbe);
    const big = Math.max(...r.end.r);
    assert.ok(r.frames.some((f) => f.fill > 0.55 && f.fill < 0.95 && f.r[3] > Math.min(...r.end.r) && f.r[3] < big), "the fill runs while the new current stop grows");
    assert.ok(r.frames.some((f) => f.labels[3] > 0.1 && f.labels[3] < 0.9), "the new current label fades in");
    assert.ok(Math.abs(r.end.fill - 1) < 1e-6);
    assert.equal(r.end.inline, false);
    assert.deepEqual(ctx.errors, []);
  });
});

test("the start state is written before update awaits; a shown element without an entrance snaps; timing is the theme's", async () => {
  await withPage({ root, url: pages.url("fill", "step=start") }, async (page) => {
    const r = await page.evaluate(async () => {
      const { default: timeline } = await import("../components/timeline/index.js");
      const { animate } = await import("../core/animate.js");
      const { makeMotion } = await import("../core/motion.js");
      const stops = [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }];
      const make = async (tokens = {}, current = "a") => {
        const host = document.createElement("div");
        host.style.cssText = "width:1200px";
        document.querySelector(".sd-canvas").appendChild(host);
        const ctx = { animate, motion: makeMotion(tokens), tokens: {}, size: { w: 1200, h: 300 } };
        const empty = { stops, progress: 0, current };
        return { host, empty, props: { stops, progress: 0.5, current: "b" }, inst: await timeline.mount(host, empty, ctx) };
      };
      const state = (host) => {
        const fill = host.querySelector(".sd-timeline-fill");
        return {
          grown: Number(fill.getAttribute("x2")) - Number(fill.getAttribute("x1")) > 0,
          r: [...host.querySelectorAll(".sd-timeline-stop")].map((c) => c.getAttribute("r")),
          label: host.querySelectorAll(".sd-timeline-label")[1].style.opacity,
        };
      };
      const signal = new AbortController().signal;
      const info = (extra) => ({ animate: true, entered: true, entrance: null, signal, ...extra });
      const out = {};
      {
        const { host, props, inst } = await make();
        const building = inst.update(props, info({ entrance: { motion: "draw", duration: 120 } }));
        out.sync = state(host);
        await building;
        out.after = { ...state(host), styled: host.querySelectorAll("[style]").length };
      }
      for (const [name, extra] of [["none", { entrance: { motion: "none", duration: 0 } }], ["moved", { entrance: null }], ["aborted", { entrance: { motion: "draw", duration: 120 }, signal: AbortSignal.abort() }]]) {
        const { host, props, inst } = await make();
        const p = inst.update(props, info(extra));
        out[name] = state(host);
        await p;
      }
      // Theme timing: the fill takes --sd-duration, 600 ms (the current stop stays put, so only the fill moves).
      const { props, inst } = await make({ "--sd-duration": "600ms" }, "b");
      const t0 = performance.now();
      await inst.update(props, info({ entered: false }));
      out.elapsed = performance.now() - t0;
      return out;
    });
    const R = r.after.r[0];
    assert.deepEqual(r.sync, { grown: false, r: [R, R, R], label: "0" }, "the fill is empty, every stop small and the current label hidden at once");
    assert.ok(Number(r.after.r[1]) > Number(R) && r.after.grown && r.after.label === "" && r.after.styled === 0, `the end state is complete, no inline style left (${JSON.stringify(r.after)})`);
    for (const name of ["none", "moved", "aborted"]) {
      assert.deepEqual(r[name], { grown: true, r: r.after.r, label: "" }, `${name}: the end state at once`);
    }
    assert.ok(r.elapsed >= 570 && r.elapsed < 3000, `the fill takes the theme's --sd-duration, 600 ms (${r.elapsed.toFixed(0)} ms)`);
  });
});
