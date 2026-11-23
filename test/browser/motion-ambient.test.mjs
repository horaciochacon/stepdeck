// Ambient motion in Chrome: the root class `sd-ambient`, which the shell keeps on <html> while the page animates, and
// a `diagram` edge with `flow: true`, whose dashes march under it (a CSS animation of stroke-dashoffset, nothing else).
// Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/motion-ambient.test.mjs
//
// The `flowing` slide of the diagram fixture: `loop` (full size) has a straight flowing edge `feed`, a plain edge
// `fit->report` and a flowing loop `again` routed over the top. Its nodes show at `nodes`, its edges at `edges`, and at
// `focus` the loop dims while `feed` stays lit. `where` is a compact copy with the same edges, all shown.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { check } from "../../cli/check.js";
import { formatProblem } from "../../cli/problems.js";
import { deckPages, expectJumpEqualsPlayed, expectBackwardEqualsJump, expectInterruptEqualsJump, sampleFrames } from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const deck = fileURLToPath(new URL("../fixtures/decks/diagram/", import.meta.url));
const pages = deckPages("test/fixtures/decks/diagram/");
const STEPS = ["nodes", "edges", "focus"];
const FLOWING = ["feed", "again"];
const THEMES = ["academic-light", "modern"];
// A compact drawing's group carries the accent's tint from its build: content, not motion residue.
const KEEP = ".sd-diagram-body";

const at = (step, query = "") => pages.url("flowing", `step=${step}${query}`);
const ambient = (page) => page.evaluate(() => document.documentElement.classList.contains("sd-ambient"));
const animates = (page) => page.evaluate(() => window.STEPDECK.flags.animate);

/** Makes the page report `state` ("hidden" or "visible") and fires visibilitychange, as a browser does. */
const setVisibility = (page, state) =>
  page.evaluate((state) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);

/** Each edge line of element `el`, from computed style: { [edge id]: { name, duration, timing, count, dash, dim } }. */
const lines = (page, el) =>
  page.evaluate((el) => Object.fromEntries([...document.querySelectorAll(`[data-el="${el}"] [data-part="edge"]`)].map((g) => {
    const cs = getComputedStyle(g.querySelector(".sd-diagram-line"));
    return [g.dataset.id, {
      name: cs.animationName, duration: cs.animationDuration, timing: cs.animationTimingFunction, count: cs.animationIterationCount,
      dash: cs.strokeDasharray, dim: g.dataset.dim,
    }];
  })), el);

/** A flowing line's computed dash offset, read twice 200 ms apart. */
const offsets = (page, el, id) =>
  page.evaluate(async ([el, id]) => {
    const line = document.querySelector(`[data-el="${el}"] [data-part="edge"][data-id="${id}"] .sd-diagram-line`);
    const read = () => getComputedStyle(line).strokeDashoffset;
    const first = read();
    await new Promise((r) => setTimeout(r, 200));
    return [first, read()];
  }, [el, id]);

/**
 * How a flowing line's dash offset moves from one animation frame to the next, over 12 frames: the offset runs from 0
 * down to -2.5 grid units and starts again, so a step toward the target is a small decrease and a restart a jump up
 * by nearly the whole span (not counted). -> { forward, backward } (counts of small decreases and small increases).
 */
const march = (page, el, id) =>
  page.evaluate(async ([el, id]) => {
    const line = document.querySelector(`[data-el="${el}"] [data-part="edge"][data-id="${id}"] .sd-diagram-line`);
    const span = 2.5 * parseFloat(getComputedStyle(line).getPropertyValue("--sd-grid"));
    const reads = [];
    for (let i = 0; i < 12; i++) {
      reads.push(parseFloat(getComputedStyle(line).strokeDashoffset));
      await new Promise((r) => requestAnimationFrame(r));
    }
    const deltas = reads.slice(1).map((v, i) => v - reads[i]);
    return { forward: deltas.filter((d) => d < 0 && d > -span / 2).length, backward: deltas.filter((d) => d > 0 && d < span / 2).length };
  }, [el, id]);

/** The dashed edge's pattern, one and a half grid units on and one off, as computed style writes it. */
const dashPattern = (page) =>
  page.evaluate(() => {
    const grid = parseFloat(getComputedStyle(document.querySelector(".sd-canvas")).getPropertyValue("--sd-grid"));
    return `${grid * 1.5}px, ${grid}px`;
  });

const clean = async (page, ctx) => {
  assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
  assert.deepEqual(ctx.errors, []);
};

test("sd-ambient is on while the page animates", async () => {
  await withPage({ root }, async (page, ctx) => {
    await ctx.open(at("edges"));
    assert.deepEqual([await animates(page), await ambient(page)], [true, true], "on while the page animates");
    for (const [how, query] of [["?capture", "&capture"], ["a presenter preview frame", "&receiver"], ["a preview frame with ?motion=full", "&receiver&motion=full"]]) {
      await ctx.open(at("edges", query));
      assert.deepEqual([await animates(page), await ambient(page)], [false, false], `off with ${how}`);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ctx.open(at("edges"));
    assert.deepEqual([await animates(page), await ambient(page)], [false, false], "off under reduced motion");
    await ctx.open(at("edges", "&motion=full"));
    assert.deepEqual([await animates(page), await ambient(page)], [true, true], "on again with ?motion=full under reduced motion");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await ctx.open(at("edges"));
    await setVisibility(page, "hidden");
    assert.equal(await ambient(page), false, "off while the page is hidden");
    await setVisibility(page, "visible");
    assert.equal(await ambient(page), true, "on again once the page shows");
    await clean(page, ctx);
  });
});

test("sd-ambient in the reveal shell: on for the audience, off in a presenter preview frame", async () => {
  const spike = (query) => `examples/spike/index.html${query}#/1/0`;
  await withPage({ root, url: spike("") }, async (page, ctx) => {
    assert.equal(await ambient(page), true, "the audience's page");
    await ctx.open(spike("?receiver"));
    assert.equal(await ambient(page), false, "a preview frame");
    assert.deepEqual(ctx.errors, []);
  });
});

for (const theme of THEMES) {
  test(`a flowing edge runs sd-flow only under sd-ambient (${theme})`, async () => {
    await withPage({ root, url: at("edges", `&theme=${theme}`) }, async (page, ctx) => {
      assert.equal(await ambient(page), true);
      const on = await lines(page, "loop");
      for (const id of FLOWING) {
        const { name, duration, timing, count } = on[id];
        assert.deepEqual({ name, duration, timing, count }, { name: "sd-flow", duration: "1.6s", timing: "linear", count: "infinite" }, `${id} flows over --sd-flow-period, without end`);
      }
      assert.equal(on["fit->report"].name, "none", "a plain edge never flows");
      const { forward, backward } = await march(page, "loop", "feed");
      assert.ok(forward > 0 && backward === 0, `the dashes march from source to target (${forward} frames forward, ${backward} back)`);

      const still = async (how) => {
        assert.equal(await ambient(page), false, `${how}: no sd-ambient`);
        const off = await lines(page, "loop");
        for (const id of FLOWING) assert.equal(off[id].name, "none", `${how}: ${id} stands still`);
        const [c, d] = await offsets(page, "loop", "feed");
        assert.equal(c, d, `${how}: the dashes stay put`);
      };
      for (const [how, query] of [["?capture", "&capture"], ["a presenter preview frame", "&receiver"]]) {
        await ctx.open(at("edges", `&theme=${theme}${query}`));
        await still(how);
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      await ctx.open(at("edges", `&theme=${theme}`));
      await still("reduced motion");
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await ctx.open(at("edges", `&theme=${theme}`));
      await setVisibility(page, "hidden");
      await still("a hidden page");
      await clean(page, ctx);
    });
  });
}

test("the theme owns the flow's period; a theme without --sd-flow-period gets 1600ms", async () => {
  await withPage({ root, url: at("edges") }, async (page, ctx) => {
    // Set on <html> over the theme's :root value; `initial` makes the property invalid, so var() takes its fallback.
    const periodWith = (value) =>
      page.evaluate((value) => {
        document.documentElement.style.setProperty("--sd-flow-period", value);
        return getComputedStyle(document.querySelector('[data-el="loop"] [data-id="feed"] .sd-diagram-line')).animationDuration;
      }, value);
    assert.equal(await periodWith("800ms"), "0.8s", "the period follows the token");
    assert.equal(await periodWith("initial"), "1.6s", "without it, 1600ms");
    assert.deepEqual(ctx.errors, []);
  });
});

test("a dimmed flowing edge stands still", async () => {
  await withPage({ root, url: at("focus") }, async (page, ctx) => {
    assert.equal(await ambient(page), true);
    const r = await lines(page, "loop");
    assert.deepEqual([r.again.dim, r.again.name], ["true", "none"], "the dimmed loop stands still");
    assert.deepEqual([r.feed.dim, r.feed.name], ["false", "sd-flow"], "the lit straight edge still flows");
    await clean(page, ctx);
  });
});

test("a flowing edge in a compact diagram stands still", async () => {
  await withPage({ root, url: at("edges") }, async (page, ctx) => {
    assert.equal(await ambient(page), true);
    assert.equal(await page.evaluate(() => document.querySelector('[data-el="where"] svg').dataset.compact), "true");
    const r = await lines(page, "where");
    for (const id of FLOWING) assert.deepEqual([r[id].dim, r[id].name], ["false", "none"], `${id}: not dimmed, yet still`);
    assert.equal((await lines(page, "loop")).feed.name, "sd-flow", "while the full-size copy flows");
    await clean(page, ctx);
  });
});

test("a flowing edge is dashed, standing or flowing", async () => {
  await withPage({ root }, async (page, ctx) => {
    const dashed = async (how, el, ids = FLOWING) => {
      const pattern = await dashPattern(page);
      const r = await lines(page, el);
      for (const id of ids) {
        assert.notEqual(r[id].dash, "none", `${how}: ${el}/${id} is dashed`);
        assert.equal(r[id].dash, pattern, `${how}: ${el}/${id} takes the dashed edge's pattern`);
      }
      return r;
    };
    for (const theme of THEMES) {
      await ctx.open(at("edges", `&theme=${theme}`));
      const flowing = await dashed(`flowing (${theme})`, "loop");
      assert.equal(flowing["fit->report"].dash, "none", "a plain edge stays solid");
      await dashed(`compact (${theme})`, "where");
      await ctx.open(at("focus", `&theme=${theme}`));
      await dashed(`dimmed (${theme})`, "loop", ["again"]);
      for (const query of ["&capture", "&receiver"]) {
        await ctx.open(at("edges", `&theme=${theme}${query}`));
        await dashed(`${query.slice(1)} (${theme})`, "loop");
      }
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ctx.open(at("edges"));
    await dashed("reduced motion", "loop");
    await clean(page, ctx);
  });
});

test("a flowing edge enters as a dashed one does: it fades in, its line never draws on", async () => {
  await withPage({ root, url: at("nodes", "&motion=full") }, async (page, ctx) => {
    const r = await sampleFrames(page, "flowing", "edges", "loop", (el) => {
      const part = (id) => el.querySelector(`[data-part="edge"][data-id="${id}"]`);
      const seen = (id) => (getComputedStyle(part(id)).visibility === "visible" ? Number(getComputedStyle(part(id)).opacity) : 0);
      const draws = (id) => part(id).querySelector(".sd-diagram-line").style.strokeDasharray !== "";
      return { seen: [seen("feed"), seen("again")], draws: [draws("feed"), draws("again"), draws("fit->report")] };
    });
    FLOWING.forEach((id, i) => {
      assert.ok(r.frames.some((f) => f.seen[i] > 0 && f.seen[i] < 1), `${id} fades in`);
      assert.ok(r.frames.every((f) => !f.draws[i]), `${id}'s line never draws on`);
    });
    assert.ok(r.frames.some((f) => f.draws[2]), "the plain edge draws on (the probe sees a draw)");
    await clean(page, ctx);
  });
});

test("flowing: jump equals played, backward and interrupted", async () => {
  await withPage({ root, url: at("nodes") }, async (page, ctx) => {
    for (const id of ["loop", "where"]) {
      await expectJumpEqualsPlayed(ctx, page, { pages, slide: "flowing", steps: STEPS, id });
      await expectBackwardEqualsJump(ctx, page, { pages, slide: "flowing", steps: STEPS, id });
    }
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "flowing", from: "nodes", via: "edges", to: "focus", id: "loop" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "flowing", from: "edges", via: "focus", to: "nodes", id: "loop" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "flowing", from: "edges", via: "focus", to: "edges", id: "where", keep: KEEP });
  });
});

test("update settles while the edge flows", async () => {
  await withPage({ root, url: at("edges", "&motion=full") }, async (page, ctx) => {
    assert.equal(await animates(page), true, "the step really animates");
    assert.equal((await lines(page, "loop")).feed.name, "sd-flow", "the edge flows before the step");
    const ms = await page.evaluate(async () => {
      const t0 = performance.now();
      await window.STEPDECK.goTo("flowing", "focus");
      await window.STEPDECK.settled();
      return performance.now() - t0;
    });
    assert.ok(ms >= 150, `the highlight change plays over --sd-duration-fast (${ms.toFixed(0)} ms)`);
    assert.ok(ms < 1000, `settled within 1 s of the step, never waiting on the flow (${ms.toFixed(0)} ms)`);
    assert.equal((await lines(page, "loop")).feed.name, "sd-flow", "the lit edge flows on");
    await clean(page, ctx);
  });
});

test("check --played is clean on flowing (both themes)", async () => {
  for (const theme of THEMES) {
    const problems = await check(deck, { slide: "flowing", played: true, theme });
    assert.deepEqual(problems.map(formatProblem), [], theme);
  }
});
