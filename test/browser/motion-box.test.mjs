// Element box motion (the frame's enterBox/exitBox) and ghost placeholders, in Chrome. Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/motion-box.test.mjs
//
// Most checks sample the page once per animation frame inside one page.evaluate, from the moment a step is asked
// for until it settles, so they hold however late a timer fires.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withPage } from "../../cli/browser.js";
import { copyEngine } from "../../cli/engine.js";
import {
  deckPages,
  settled,
  elementHtml,
  htmlAfterJump,
  expectJumpEqualsPlayed,
  expectInterruptEqualsJump,
  expectBackwardEqualsJump,
  expectAnimatedStepMoves,
  sampleFrames,
  colorMove,
  paletteRgb,
} from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const DECK = "test/fixtures/decks/motion";
const pages = deckPages(`${DECK}/`);
const cli = (...args) => spawnSync(process.execPath, ["cli/index.js", ...args], { cwd: root, encoding: "utf8", env: process.env });
const NAMES = ["fade", "rise", "wipe", "pop", "draw"];
const CARDS = ["card-a", "card-b", "card-c"];

const animates = async (page) => assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true, "the page animates");
const clean = async (page, ctx) => {
  assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
  assert.deepEqual(ctx.errors, []);
};

/**
 * In the page: STEPDECK.goTo(slide, step), then one sample per animation frame of each box in `ids` until the step
 * settles and two frames more (a step that does not move can settle before the first frame).
 * A sample is { visible (computed visibility), opacity (computed), style (the attribute), top (on screen) }.
 * -> { frames: sample[][], end: sample[] }
 */
const playSampled = (page, slide, step, ids) =>
  page.evaluate(async ([slide, step, ids]) => {
    const read = () => ids.map((id) => {
      const el = document.querySelector(`[data-el="${id}"]`);
      const cs = getComputedStyle(el);
      return { visible: cs.visibility === "visible", opacity: Number(cs.opacity), style: el.getAttribute("style"), top: el.getBoundingClientRect().top };
    });
    const frames = [];
    let done = false;
    const tick = () => {
      if (done) return;
      frames.push(read());
      requestAnimationFrame(tick);
    };
    const moved = window.STEPDECK.goTo(slide, step).then(() => window.STEPDECK.settled());
    requestAnimationFrame(tick);
    await moved;
    for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(r));
    done = true;
    return { frames, end: read() };
  }, [slide, step, ids]);

/** The box's computed visibility, opacity, transform and clip-path (what a box motion changes), as one string. */
const boxLook = (id) => (page) =>
  page.evaluate((id) => {
    const cs = getComputedStyle(document.querySelector(`[data-el="${id}"]`));
    return JSON.stringify({ visibility: cs.visibility, opacity: cs.opacity, transform: cs.transform, clipPath: cs.clipPath });
  }, id);

test("every motion name: jump equals played", async () => {
  await withPage({ root, url: pages.url("names", "step=start") }, async (page, ctx) => {
    for (const id of NAMES) await expectJumpEqualsPlayed(ctx, page, { pages, slide: "names", steps: ["start", "go"], id });
    // The page is now at "go", played: no box keeps a style attribute (not even an empty one).
    const styles = await page.evaluate((ids) => ids.map((id) => document.querySelector(`[data-el="${id}"]`).getAttribute("style")), NAMES);
    assert.deepEqual(styles, NAMES.map(() => null));
  });
});

test("animated step moves: every motion name moves its box", async () => {
  await withPage({ root, url: pages.url("names", "step=start") }, async (page, ctx) => {
    for (const id of NAMES) {
      const { mid, end } = await expectAnimatedStepMoves(ctx, page, { pages, slide: "names", from: "start", to: "go", id, probe: boxLook(id) });
      // Not held: the step's stagger is 0, so the sample is the motion itself.
      assert.equal(JSON.parse(mid).visibility, "visible", `${id}: shown while it moves`);
      assert.deepEqual(JSON.parse(end), { visibility: "visible", opacity: "1", transform: "none", clipPath: "none" }, `${id}: end state`);
    }
    await clean(page, ctx);
  });
});

test("rise travels the theme's --sd-motion-distance", async () => {
  // The largest translateY written on the rise box while it enters (its start state is the full distance).
  const travel = (page) =>
    page.evaluate(async () => {
      const el = document.querySelector('[data-el="rise"]');
      let max = 0;
      let done = false;
      const tick = () => {
        if (done) return;
        const m = /translateY\((-?[\d.]+)px\)/.exec(el.style.transform);
        if (m) max = Math.max(max, Number(m[1]));
        requestAnimationFrame(tick);
      };
      const moved = window.STEPDECK.goTo("names", "go").then(() => window.STEPDECK.settled());
      requestAnimationFrame(tick);
      await moved;
      done = true;
      return max;
    });
  await withPage({ root, url: pages.url("names", "step=start&motion=full") }, async (page, ctx) => {
    await animates(page);
    const modern = await travel(page);
    assert.ok(modern > 16 && modern <= 24, `modern rises up to 24px (got ${modern})`);
    await ctx.open(pages.url("names", "step=start&motion=full&theme=academic-light"));
    await animates(page);
    const academic = await travel(page);
    assert.ok(academic > 0 && academic <= 16, `academic-light rises up to 16px (got ${academic})`);
    await clean(page, ctx);
  });
});

test("stagger order: cards enter one after another, in slide order", async () => {
  await withPage({ root, url: pages.url("cards", "step=start&motion=full") }, async (page, ctx) => {
    await animates(page);
    // 60 ms in (and one more frame, so the first card's tween has ticked): a held card is hidden, opacity 0 here.
    const at60 = await page.evaluate(async (ids) => {
      const look = (id) => {
        const cs = getComputedStyle(document.querySelector(`[data-el="${id}"]`));
        return cs.visibility === "hidden" ? 0 : Number(cs.opacity);
      };
      window.STEPDECK.goTo("cards", "go");
      await new Promise((r) => setTimeout(r, 60));
      await new Promise((r) => requestAnimationFrame(r));
      return ids.map(look);
    }, CARDS);
    const [a, b, c] = at60;
    assert.ok(a > b, `the first card is ahead of the second (${at60})`);
    assert.ok(b >= c, `the second card is not behind the third (${at60})`);
    await settled(page);
    const end = await playSampled(page, "cards", "go", CARDS); // already there: nothing moves
    assert.deepEqual(end.end.map(({ visible, opacity, style }) => ({ visible, opacity, style })), CARDS.map(() => ({ visible: true, opacity: 1, style: null })));
    await clean(page, ctx);
  });
});

test("canvas box keeps its position", async () => {
  await withPage({ root }, async (page, ctx) => {
    const jumped = await htmlAfterJump(ctx, page, pages, "boxed", "go", "placed");
    await ctx.open(pages.url("boxed", "step=start&motion=full"));
    await animates(page);
    const r = await page.evaluate(async () => {
      const el = document.querySelector('[data-el="placed"]');
      const place = () => ({ left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height });
      const start = place();
      const frames = [];
      let done = false;
      const tick = () => {
        if (done) return;
        frames.push({ place: place(), transform: el.style.transform });
        requestAnimationFrame(tick);
      };
      const moved = window.STEPDECK.goTo("boxed", "go").then(() => window.STEPDECK.settled());
      requestAnimationFrame(tick);
      await moved;
      done = true;
      return { start, frames, end: place() };
    });
    const at = { left: "160px", top: "480px", width: "960px", height: "200px" };
    assert.deepEqual(r.start, at);
    assert.ok(r.frames.some((f) => /translateY/.test(f.transform)), "the box rises");
    for (const f of r.frames) assert.deepEqual(f.place, at, "kept while it moves");
    assert.deepEqual(r.end, at);
    assert.equal(await elementHtml(page, "placed"), jumped, "played equals jumped, inline position included");
    await clean(page, ctx);
  });
});

test("exit is visible mid-step and hidden at the end; backward hides at once", async () => {
  await withPage({ root }, async (page, ctx) => {
    const jumped = { a: await htmlAfterJump(ctx, page, pages, "exit", "a", "note"), c: await htmlAfterJump(ctx, page, pages, "exit", "c", "note") };

    // Forward b -> c: the note fades out while it is still shown, then it is hidden.
    await ctx.open(pages.url("exit", "step=b&motion=full"));
    await animates(page);
    const fwd = await playSampled(page, "exit", "c", ["note"]);
    assert.ok(fwd.frames.some(([n]) => n.visible && n.opacity > 0 && n.opacity < 1), "shown part-way through its fade");
    assert.deepEqual(fwd.end.map(({ visible, style }) => ({ visible, style })), [{ visible: false, style: null }]);
    assert.equal(await elementHtml(page, "note"), jumped.c);

    // Backward b -> a: hidden on every frame, with no motion.
    await ctx.open(pages.url("exit", "step=b&motion=full"));
    await animates(page);
    const back = await playSampled(page, "exit", "a", ["note"]);
    assert.ok(back.frames.length > 0);
    assert.deepEqual(back.frames.filter(([n]) => n.visible || n.style !== null), [], "hidden at once");
    assert.equal(await elementHtml(page, "note"), jumped.a);
    await clean(page, ctx);
  });
});

test("an exit superseded mid-motion ends hidden at once, with its inline styles restored", async () => {
  await withPage({ root }, async (page, ctx) => {
    // Step d leaves the note hidden as it was at c: superseding the c exit re-applies nothing to it, so only
    // exitBox resolving hidden on abort can bring it to the jumped state.
    const jumped = await htmlAfterJump(ctx, page, pages, "exit", "d", "note");
    await ctx.open(pages.url("exit", "step=b&motion=full"));
    await animates(page);
    const r = await page.evaluate(async () => {
      const el = document.querySelector('[data-el="note"]');
      const look = () => {
        const cs = getComputedStyle(el);
        return { visible: cs.visibility === "visible", opacity: Number(cs.opacity), style: el.getAttribute("style") };
      };
      window.STEPDECK.goTo("exit", "c");
      let mid = null;
      for (let i = 0; i < 300 && !mid; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const l = look();
        if (l.visible && l.opacity > 0 && l.opacity < 1) mid = l;
      }
      const frames = [];
      let done = false;
      const tick = () => {
        if (done) return;
        frames.push(look());
        requestAnimationFrame(tick);
      };
      const moved = window.STEPDECK.goTo("exit", "d").then(() => window.STEPDECK.settled());
      requestAnimationFrame(tick);
      await moved;
      for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(r));
      done = true;
      return { mid, frames, end: look() };
    });
    assert.ok(r.mid, "the fade was under way when the next step came");
    assert.ok(r.frames.length > 0);
    assert.deepEqual(r.frames.filter((l) => l.visible || l.style !== null), [], "hidden, with no inline style, from the first frame");
    assert.deepEqual(r.end, { visible: false, opacity: 1, style: null });
    assert.equal(await elementHtml(page, "note"), jumped);
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "exit", from: "b", via: "c", to: "d", id: "note" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "exit", from: "b", via: "c", to: "d", id: "summary" });
    await clean(page, ctx);
  });
});

test("collapse swap has no late jump", async () => {
  await withPage({ root, url: pages.url("swap", "step=a&motion=full") }, async (page, ctx) => {
    await animates(page);
    const r = await page.evaluate(async () => {
      const el = document.querySelector('[data-el="after"]');
      const gone = document.querySelector('[data-el="before"]');
      const look = () => {
        const cs = getComputedStyle(el);
        return { top: el.getBoundingClientRect().top, visible: cs.visibility === "visible", opacity: Number(cs.opacity), goneShown: getComputedStyle(gone).display !== "none" };
      };
      const frames = [];
      let done = false;
      const tick = () => {
        if (done) return;
        frames.push(look());
        requestAnimationFrame(tick);
      };
      const moved = window.STEPDECK.goTo("swap", "b").then(() => window.STEPDECK.settled());
      requestAnimationFrame(tick);
      await new Promise((r) => setTimeout(r, 150));
      const at150 = look();
      await moved;
      done = true;
      return { at150, frames, end: look() };
    });
    assert.equal(r.at150.top, r.end.top, "at 150 ms the entering element is already where it ends");
    assert.ok(r.frames.some((f) => f.visible && f.opacity < 1), "it fades in");
    assert.deepEqual(r.frames.filter((f) => f.top !== r.end.top || f.goneShown), [], "the exit snaps: no frame has the old layout");
    for (const id of ["before", "after"]) await expectJumpEqualsPlayed(ctx, page, { pages, slide: "swap", steps: ["a", "b"], id });
    await clean(page, ctx);
  });
});

test("interrupt during stagger equals jump", async () => {
  await withPage({ root, url: pages.url("cards", "step=start") }, async (page, ctx) => {
    // 100 ms in, the first two cards move and the third is still held for its slot.
    for (const id of [...CARDS, "note"]) {
      await expectInterruptEqualsJump(ctx, page, { pages, slide: "cards", from: "start", via: "go", to: "more", id });
    }
    await clean(page, ctx);
  });
});

test("capture applies every entrance at once", async () => {
  await withPage({ root, url: pages.url("cards", "step=start&capture") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), false);
    const r = await page.evaluate(async (ids) => {
      const t0 = performance.now();
      await window.STEPDECK.goTo("cards", "go");
      await window.STEPDECK.settled();
      const ms = performance.now() - t0;
      const cards = ids.map((id) => {
        const el = document.querySelector(`[data-el="${id}"]`);
        const cs = getComputedStyle(el);
        return { visible: cs.visibility === "visible", opacity: cs.opacity, style: el.getAttribute("style") };
      });
      return { ms, cards };
    }, CARDS);
    // A generous ceiling: the event loop can stall. Holding the cards for their slots would cost at least 160 ms
    // (the third card's), and their motion 400 ms more.
    assert.ok(r.ms < 150, `goTo and settled() took ${r.ms.toFixed(1)} ms`);
    assert.deepEqual(r.cards, CARDS.map(() => ({ visible: true, opacity: "1", style: null })));
    await clean(page, ctx);
  });
});

test("slide change shows every visible element at once (reveal shell)", async () => {
  const legs = [
    // From the neighbour: cards is mounted ahead at step 0, so arriving at `go` is one step forward from the state
    // it holds. Only the shell's slide change keeps it from animating.
    { from: "names/go", to: "go", ids: CARDS },
    // Two steps ahead of what the neighbour holds, and from a slide far away (cards mounts on arrival).
    { from: "names/go", to: "more", ids: [...CARDS, "note"] },
    { from: "ghost/first", to: "more", ids: [...CARDS, "note"] },
  ];
  for (const { from, to, ids } of legs) {
    await withPage({ root, url: `${DECK}/index.html#/${from}` }, async (page, ctx) => {
      await animates(page);
      const r = await page.evaluate(async ([to, ids]) => {
        const look = () => ids.map((id) => {
          const el = document.querySelector(`section[data-sd-slide="cards"] [data-el="${id}"]`);
          if (!el) return null;
          const cs = getComputedStyle(el);
          return { id, visible: cs.visibility === "visible", opacity: Number(cs.opacity), style: el.getAttribute("style") };
        });
        const frames = [];
        let done = false;
        const tick = () => {
          if (done) return;
          frames.push(look());
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        location.hash = `#/cards/${to}`;
        await new Promise((resolve) => {
          const wait = () => (window.STEPDECK.state()?.slide === "cards" ? resolve() : requestAnimationFrame(wait));
          wait();
        });
        await window.STEPDECK.settled();
        const first = look();
        done = true;
        return { frames, first, stepId: window.STEPDECK.state().stepId };
      }, [to, ids]);
      const leg = `${from} -> cards/${to}`;
      assert.equal(r.stepId, to);
      assert.deepEqual(r.first, ids.map((id) => ({ id, visible: true, opacity: 1, style: null })), `${leg}: every card shown`);
      const moving = r.frames.flat().filter((s) => s && s.visible && (s.opacity < 1 || s.style !== null));
      assert.deepEqual(moving, [], `${leg}: no card is ever part-way through an entrance`);
      await clean(page, ctx);
    });
  }
});

let tmp;
let shrunk; // the ghost slide in a deck of its own, with its label shrunk to 20px
before(async () => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "stepdeck-ghost-")));
  shrunk = join(tmp, "deck");
  copyEngine(join(shrunk, "stepdeck"));
  mkdirSync(join(shrunk, "slides"));
  const { default: ghost } = await import(new URL(`../fixtures/decks/motion/slides/ghost.js`, import.meta.url));
  writeFileSync(join(shrunk, "slides/ghost.js"), `export default ${JSON.stringify({ ...ghost, style: ".sd-ghost-label { font-size: 20px; }" })};\n`);
  writeFileSync(join(shrunk, "deck.js"), `export default ${JSON.stringify({ title: "Ghost", lang: "en", theme: "modern", slides: ["ghost"] })};\n`);
});
after(() => rmSync(tmp, { recursive: true, force: true }));

test("ghost: a dashed frame and its label while hidden; check measures the label; gone on entrance", async () => {
  // The ghost of `result`, the colours it should use, and whether its frame covers the element's box.
  const ghostLook = (page) =>
    page.evaluate(() => {
      const canvas = document.querySelector(".sd-canvas");
      const token = (name) => {
        const probe = document.createElement("div");
        probe.style.color = `var(${name})`;
        canvas.appendChild(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      };
      const el = document.querySelector('[data-el="result"]');
      const g = el.querySelector(":scope > .sd-ghost");
      const label = g?.querySelector(".sd-ghost-label");
      const gs = getComputedStyle(g);
      const ls = getComputedStyle(label);
      const r = (n) => {
        const b = n.getBoundingClientRect();
        return [b.left, b.top, b.width, b.height].map(Math.round);
      };
      return {
        hasGhost: el.classList.contains("sd-has-ghost"),
        first: el.firstElementChild === g,
        ariaHidden: g.getAttribute("aria-hidden"),
        shown: gs.display !== "none" && gs.visibility === "visible",
        border: [gs.borderTopStyle, gs.borderTopColor === token("--sd-color-rule")],
        covers: JSON.stringify(r(g)) === JSON.stringify(r(el)),
        label: label.textContent,
        labelVisible: ls.visibility === "visible",
        labelSize: ls.fontSize,
        labelMuted: ls.color === token("--sd-color-muted"),
        content: getComputedStyle(el.querySelector(".sd-text")).visibility,
      };
    });
  await withPage({ root, url: pages.url("ghost", "step=first") }, async (page, ctx) => {
    assert.deepEqual(await ghostLook(page), {
      hasGhost: true, first: true, ariaHidden: "true", shown: true, border: ["dashed", true], covers: true,
      label: "2 · Result", labelVisible: true, labelSize: "28px", labelMuted: true, content: "hidden",
    });

    // On entrance the ghost goes as the box starts to move: never shown on a frame where its element is.
    await ctx.open(pages.url("ghost", "step=first&motion=full"));
    await animates(page);
    const frames = await page.evaluate(async () => {
      const el = document.querySelector('[data-el="result"]');
      const g = el.querySelector(":scope > .sd-ghost");
      const out = [];
      let done = false;
      const tick = () => {
        if (done) return;
        out.push({ visible: getComputedStyle(el).visibility === "visible", ghost: getComputedStyle(g).display !== "none", opacity: Number(getComputedStyle(el).opacity) });
        requestAnimationFrame(tick);
      };
      const moved = window.STEPDECK.goTo("ghost", "second").then(() => window.STEPDECK.settled());
      requestAnimationFrame(tick);
      await moved;
      done = true;
      return out;
    });
    assert.ok(frames.some((f) => f.visible && f.opacity < 1), "the box enters with motion");
    assert.deepEqual(frames.filter((f) => f.visible === f.ghost), [], "the ghost shows exactly while its element is hidden");
    const after = await ghostLook(page);
    assert.equal(after.shown, false, "no ghost once the element is shown");
    assert.equal(after.first, true, "the ghost node stays, first in the box");
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "ghost", steps: ["first", "second"], id: "result" });
    await clean(page, ctx);
  });

  // check measures the label: clean as it is, and a 20px label is a font-size problem on its element.
  const ok = cli("check", DECK, "--slide", "ghost");
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const bad = cli("check", shrunk, "--json");
  assert.equal(bad.status, 1, bad.stdout + bad.stderr);
  const problems = JSON.parse(bad.stdout);
  assert.deepEqual(problems.map((p) => [p.rule, p.slide, p.element, p.step]), [["font-too-small", "ghost", "result", "first"]], bad.stdout);
  assert.match(problems[0].measured, /20px/);
});

test("ghost DOM: a plain ghost, a labelled one, none for false", async () => {
  await withPage({ root, url: pages.url("ghost", "step=first") }, async (page, ctx) => {
    const html = await page.evaluate(async () => {
      const { renderSlideFrame } = await import(new URL("../core/layout.js", location.href).href);
      const frame = renderSlideFrame({
        id: "g",
        elements: [
          { id: "plain", type: "text", ghost: true },
          { id: "labelled", type: "text", ghost: "Next" },
          { id: "off", type: "text", ghost: false },
          { id: "unset", type: "text" },
        ],
      }, "", "", { regions: ["main"] });
      return ["plain", "labelled", "off", "unset"].map((id) => frame.mountPoint(id).outerHTML);
    });
    assert.deepEqual(html, [
      '<div class="sd-el sd-has-ghost" data-el="plain" data-type="text"><div class="sd-ghost" aria-hidden="true"></div></div>',
      '<div class="sd-el sd-has-ghost" data-el="labelled" data-type="text"><div class="sd-ghost" aria-hidden="true"><span class="sd-ghost-label">Next</span></div></div>',
      '<div class="sd-el" data-el="off" data-type="text"></div>',
      '<div class="sd-el" data-el="unset" data-type="text"></div>',
    ]);
    await clean(page, ctx);
  });
});

test("frame enterBox/exitBox: start state at once, abort ends hidden at once, inline styles restored", async () => {
  await withPage({ root, url: pages.url("ghost", "step=first") }, async (page, ctx) => {
    const r = await page.evaluate(async () => {
      const { renderSlideFrame } = await import(new URL("../core/layout.js", location.href).href);
      const frame = renderSlideFrame({
        id: "frame-test",
        elements: [
          { id: "flow", type: "text" },
          { id: "placed", type: "text", box: { x: 10, y: 20, w: 300, h: 40 } },
        ],
      }, "", "", { regions: ["main"] });
      frame.root.style.position = "fixed";
      document.body.appendChild(frame.root);
      const flow = frame.mountPoint("flow");
      const placed = frame.mountPoint("placed");
      const frameTick = () => new Promise((r) => requestAnimationFrame(r));
      const out = {};

      // enterBox writes the start state synchronously, and leaves no style attribute behind.
      frame.setVisible("flow", true);
      const entering = frame.enterBox("flow", "fade", { duration: 200 });
      out.enterStart = flow.style.opacity;
      await entering;
      out.enterEnd = flow.getAttribute("style");

      // exitBox, aborted mid-motion: resolves hidden at once, with the inline styles it touched restored.
      const ac = new AbortController();
      const exiting = frame.exitBox("flow", "rise", { duration: 2000, signal: ac.signal }, false);
      await frameTick();
      await frameTick();
      out.exitMid = { hidden: flow.classList.contains("sd-hidden"), opacity: Number(flow.style.opacity), transform: flow.style.transform };
      const t0 = performance.now();
      ac.abort();
      await exiting;
      out.abortMs = performance.now() - t0;
      out.exitEnd = { hidden: flow.classList.contains("sd-hidden"), collapsed: flow.classList.contains("sd-collapsed"), style: flow.getAttribute("style") };

      // A signal that is already aborted: no motion at all; `collapse` collapses.
      frame.setVisible("flow", true);
      const gone = new AbortController();
      gone.abort();
      await frame.exitBox("flow", "fade", { duration: 400, signal: gone.signal }, true);
      out.collapsed = { hidden: flow.classList.contains("sd-hidden"), collapsed: flow.classList.contains("sd-collapsed"), style: flow.getAttribute("style") };

      // A canvas box keeps its inline position through both motions.
      const before = placed.getAttribute("style");
      frame.setVisible("placed", true);
      const rising = frame.enterBox("placed", "rise", { duration: 100 });
      out.placedStart = placed.style.transform;
      await rising;
      await frame.exitBox("placed", "pop", { duration: 100 }, false);
      out.placed = { before, after: placed.getAttribute("style"), hidden: placed.classList.contains("sd-hidden") };
      frame.destroy();
      return out;
    });
    assert.equal(r.enterStart, "0", "the start state is written before enterBox returns");
    assert.equal(r.enterEnd, null);
    assert.equal(r.exitMid.hidden, false, "shown while it moves out");
    assert.ok(r.exitMid.opacity < 1, "moving out");
    // A rise leaves upwards: mid-exit the box sits above its place (a negative translateY).
    const lift = Number(/translateY\((-?[\d.]+)px\)/.exec(r.exitMid.transform)?.[1]);
    assert.ok(lift < 0, `the rise exit moves up (transform ${r.exitMid.transform})`);
    assert.ok(r.abortMs < 1000, `abort resolves at once (took ${r.abortMs.toFixed(1)} ms of a 2000 ms motion)`);
    assert.deepEqual(r.exitEnd, { hidden: true, collapsed: false, style: null });
    assert.deepEqual(r.collapsed, { hidden: true, collapsed: true, style: null });
    assert.match(r.placedStart, /^translateY\(\d+(\.\d+)?px\)$/);
    assert.deepEqual(r.placed, { before: "left: 10px; top: 20px; width: 300px; height: 40px;", after: "left: 10px; top: 20px; width: 300px; height: 40px;", hidden: true });
    await clean(page, ctx);
  });
});

test("dump reports the ghost of a hidden element", () => {
  const json = cli("dump", DECK, "--slide", "ghost", "--json");
  assert.equal(json.status, 0, json.stderr);
  const [first, second] = JSON.parse(json.stdout);
  const el = (s, id) => s.elements.find((e) => e.id === id);
  assert.equal(el(first, "result").visible, false);
  assert.equal(el(first, "result").ghost, "2 · Result");
  assert.equal(el(first, "result").text, "The result arrives here", "the label is not part of the element's text");
  assert.equal(el(second, "result").visible, true);
  assert.equal(Object.hasOwn(el(second, "result"), "ghost"), false, "no ghost on screen once the element is shown");
  assert.equal(Object.hasOwn(el(first, "method"), "ghost"), false);
  const text = cli("dump", DECK, "--slide", "ghost", "--step", "first");
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /^ {2}hidden +result +text +\d+,\d+ \d+×\d+ +ghost "2 · Result" +"The result arrives here"$/m);
  assert.match(text.stdout, /^ {2}visible +method +text +\d+,\d+ \d+×\d+ +"1 · Method"$/m);
});

test("lede: below the title and inside the title region, at least 28px, and check is clean", async () => {
  await withPage({ root, url: pages.url("lede", "step=start") }, async (page, ctx) => {
    const got = await page.evaluate(() => {
      const rect = (sel) => document.querySelector(sel).getBoundingClientRect();
      const region = rect('[data-region="title"]');
      // The text itself, not its box: a margin or an offset on the paragraph moves the one and not the other.
      const title = rect('[data-el="title"] p');
      const lede = rect('[data-el="lede"] p');
      const cs = getComputedStyle(document.querySelector('[data-el="lede"] p'));
      return {
        order: [...document.querySelectorAll('[data-region="title"] > .sd-el')].map((e) => e.dataset.el),
        gap: lede.top - title.bottom,
        inside: lede.top >= region.top && lede.bottom <= region.bottom + 0.5 && lede.left >= region.left && lede.right <= region.right + 0.5,
        size: parseFloat(cs.fontSize),
        text: document.querySelector('[data-el="lede"] p').textContent,
      };
    });
    assert.deepEqual(got.order, ["kicker", "title", "lede"]);
    assert.ok(got.gap >= -0.5, `the lede's text starts below the title's text (${got.gap})`);
    assert.equal(got.inside, true, "inside the title region");
    assert.ok(got.size >= 28, `at least the minimum audience font (${got.size})`);
    assert.equal(got.text, "Participants respond more as the dose rises.");
    await clean(page, ctx);
  });
  const ok = cli("check", DECK, "--slide", "lede", "--played");
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
});

test("lede: a changed text crossfades while the line is on screen; played equals jumped", async () => {
  await withPage({ root, url: pages.url("lede", "step=start&motion=full") }, async (page, ctx) => {
    await animates(page);
    const r = await sampleFrames(page, "lede", "next", "lede", (el) => {
      const p = el.querySelector("p");
      return { text: p.textContent, opacity: Number(getComputedStyle(p).opacity), inline: p.getAttribute("style") };
    });
    const lowest = Math.min(...r.frames.map((f) => f.opacity));
    assert.ok(lowest < 0.2, `the line dips close to invisible (lowest ${lowest})`);
    const swap = r.frames.findIndex((f) => f.text === "The line follows the step.");
    assert.ok(swap > 0, "the text swaps during the move, not before it");
    assert.ok(r.frames.slice(0, swap).every((f) => f.text === "Participants respond more as the dose rises."), "the old text until the swap");
    assert.ok(r.frames[swap].opacity < 0.5, `swapped while dim (${r.frames[swap].opacity})`);
    assert.equal(r.end.text, "The line follows the step.");
    assert.equal(r.end.opacity, 1);
    assert.equal(r.end.inline, null, "no inline style left on the paragraph");
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "lede", steps: ["start", "next"], id: "lede" });
    await clean(page, ctx);
  });
});

test("badge: tone 1 (4.5:1 as it is in modern) paints the second palette colour as text and border; check is clean", async () => {
  await withPage({ root, url: pages.url("badge", "step=start") }, async (page, ctx) => {
    const look = (id) => page.evaluate((id) => {
      const cs = getComputedStyle(document.querySelector(`[data-el="${id}"] p`));
      return { color: cs.color, border: cs.borderTopColor, width: cs.borderTopWidth, upper: cs.textTransform, size: parseFloat(cs.fontSize) };
    }, id);
    const toned = await look("toned");
    assert.equal(toned.border, paletteRgb("modern", 1), "the border is palette entry 1");
    assert.equal(toned.color, toned.border);
    assert.equal(toned.width, "2px");
    assert.ok(toned.size >= 28);
    const plain = await look("plain");
    assert.notEqual(plain.border, toned.border, "a badge without a tone takes the accent, not the tone");
    await clean(page, ctx);
  });
  const ok = cli("check", DECK, "--slide", "badge", "--played");
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
});

test("badge: a tone change fades the colours; with a text change over the crossfade, alone over the fast duration", async () => {
  const probe = (el) => {
    const p = el.querySelector("p");
    const cs = getComputedStyle(p);
    return { color: cs.color, border: cs.borderTopColor, opacity: Number(cs.opacity) };
  };
  await withPage({ root, url: pages.url("badge", "step=start&motion=full") }, async (page, ctx) => {
    await animates(page);
    // Step "done": tone 1 -> 0 together with the text (the whole crossfade, 400 ms).
    const done = await sampleFrames(page, "badge", "done", "toned", probe);
    const both = colorMove(done.frames);
    assert.equal(both.from, paletteRgb("modern", 1));
    assert.equal(both.to, paletteRgb("modern", 0));
    assert.ok(both.moved >= 3, `the colour was seen part-way (${both.moved} frames)`);
    assert.ok(both.arrived >= 300, `over the crossfade, not a snap (arrived at ${both.arrived.toFixed(0)} ms)`);
    // The border moves with the text: from palette colour to palette colour, through the colours between.
    const border = colorMove(done.frames.map((f) => ({ ms: f.ms, color: f.border })));
    assert.deepEqual([border.from, border.to], [paletteRgb("modern", 1), paletteRgb("modern", 0)]);
    assert.ok(border.moved >= 3, `the border colour was seen part-way (${border.moved} frames)`);

    // Step "same-text": tone 0 -> 1 alone: one fast duration (200 ms), and the paragraph never dims.
    const alone = await sampleFrames(page, "badge", "same-text", "toned", probe);
    const move = colorMove(alone.frames);
    assert.equal(move.to, paletteRgb("modern", 1));
    assert.ok(move.moved >= 3, `the colour was seen part-way (${move.moved} frames)`);
    assert.ok(move.arrived >= 170, `200 ms, not a snap (arrived at ${move.arrived.toFixed(0)} ms)`);
    assert.ok(move.arrived < both.arrived + 300, "the colour alone does not take the crossfade's time");
    assert.ok(alone.frames.every((f) => f.opacity === 1), "the text did not change, so the paragraph never dims");
    await clean(page, ctx);
  });
});

test("badge: played equals jumped, backward equals jumped, an interrupted change lands on the final tone", async () => {
  const steps = ["start", "done", "same-text"];
  await withPage({ root, url: pages.url("badge", "step=start") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "badge", steps, id: "toned" });
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "badge", steps, id: "toned" });
    // An interrupted change lands on the final tone. (expectInterruptEqualsJump asks for no inline style at all;
    // a toned badge keeps its two colours inline, so the same checks are made here, with those declarations allowed.)
    const jumped = await htmlAfterJump(ctx, page, pages, "badge", "same-text", "toned");
    await ctx.open(pages.url("badge", "step=start&motion=full"));
    await animates(page);
    await page.evaluate(async () => {
      window.STEPDECK.goTo("badge", "done");
      await new Promise((r) => setTimeout(r, 100));
      window.STEPDECK.goTo("badge", "same-text");
    });
    await settled(page);
    assert.equal(await elementHtml(page, "toned"), jumped, "interrupted equals a jump");
    const tone1 = paletteRgb("modern", 1); // reads at 4.5:1 as it is, so the text keeps it
    assert.equal(await page.evaluate(() => document.querySelector('[data-el="toned"] p').getAttribute("style")), `color: ${tone1}; border-color: ${tone1};`);
    assert.equal(await page.evaluate(() => document.querySelectorAll('[data-el="toned"] :not(p)[style]').length), 0);
    await clean(page, ctx);
  });
});
