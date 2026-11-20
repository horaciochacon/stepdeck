// terminal in Chrome (spec §6.2 `advance`, hard case 2): the slide drives it through `shown` only.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
//
// Windowing choice (stated once): the log renders only the newest min(shown, N) event lines, N being
// the number of lines that fit the log box (measured in canvas pixels). Older lines leave the DOM.
// "shown=9 lists exactly 9 event lines" therefore means 9 <= N; the spike slide is sized for that.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { deckPages, elementHtml, htmlAfterJump, sampleFrames, expectJumpEqualsPlayed, expectBackwardEqualsJump, expectInterruptEqualsJump } from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const motion = deckPages("test/fixtures/decks/motion/"); // modern theme: --sd-duration 400ms, --sd-stagger 80ms
const spike = (q) => `engine/core/render.html?deck=../../examples/spike/&slide=terminal&${q}`;
const session = JSON.parse(readFileSync(new URL("../../examples/spike/data/session.json", import.meta.url), "utf8"));
const STEPS = ["open", "inspect", "summarize", "fix", "report", "done"];
const SHOWN = [0, 4, 9, 14, 18, 22];

const snapshot = (page) =>
  page.evaluate(() => {
    const term = document.querySelector('[data-el="term"] .sd-terminal');
    if (!term) return null;
    const lines = [...term.querySelectorAll(".sd-terminal-line")];
    return {
      shown: Number(term.dataset.shown),
      capacity: Number(term.dataset.capacity),
      indexes: lines.map((l) => Number(l.dataset.i)),
      tasks: [...term.querySelectorAll(".sd-terminal-task")].map((t) => `${t.dataset.status}:${t.textContent}`),
      files: [...term.querySelectorAll(".sd-terminal-file")].map((f) => `${f.dataset.status}:${f.textContent}`),
      command: term.querySelector(".sd-terminal-command")?.textContent,
      html: term.outerHTML.replace(/\s*style=""/g, ""),
    };
  });

const goTo = async (page, step) => {
  await page.evaluate((s) => window.STEPDECK.goTo("terminal", s), step);
  await page.evaluate(() => window.STEPDECK.settled());
};

test("the fixture is what the tests assume: 22 synthetic events, 3 tasks, 3 files", () => {
  assert.equal(session.events.length, SHOWN.at(-1));
  assert.equal(session.tasks.length, 3);
  assert.equal(new Set(session.events.filter((e) => e.type === "file").map((e) => e.text)).size, 3);
  // "event 7" of the brief, 1-based: array index 6 is the first task going done.
  assert.deepEqual(session.events[6], { type: "task", index: 0, status: "done" });
  assert.ok(!session.events.slice(0, 4).some((e) => e.type === "task"), "task 0 is untouched before event 5");
});

test("shown=9 lists exactly 9 event lines", async () => {
  await withPage({ root, url: spike("step=summarize") }, async (page, ctx) => {
    const s = await snapshot(page);
    assert.equal(s.shown, 9);
    assert.ok(s.capacity >= 9, `the log fits at least 9 lines (capacity ${s.capacity})`);
    assert.deepEqual(s.indexes, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});

test("task status derived: done at shown=9, pending at shown=4", async () => {
  await withPage({ root, url: spike("step=inspect") }, async (page) => {
    const at4 = await snapshot(page);
    assert.equal(at4.shown, 4);
    assert.match(at4.tasks[0], /^pending:/);
    assert.deepEqual(at4.files, []);
    await goTo(page, "summarize");
    const at9 = await snapshot(page);
    assert.match(at9.tasks[0], /^done:/);
    assert.match(at9.tasks[1], /^active:/);
    assert.match(at9.tasks[2], /^pending:/);
    assert.equal(at9.files.length, 1);
    assert.match(at9.files[0], /^created:src\/summarize\.py/);
  });
});

test("backward removes lines: step 3 to step 2 leaves exactly that step's count", async () => {
  await withPage({ root, url: spike("step=fix&motion=full") }, async (page) => {
    const atFix = await snapshot(page);
    assert.equal(atFix.indexes.length, Math.min(14, atFix.capacity));
    await goTo(page, "summarize");
    const back = await snapshot(page);
    assert.equal(back.indexes.length, 9);
    assert.match(back.tasks[1], /^active:/);
    assert.equal(back.files.length, 1);
    await page.goto(page.url().replace(/step=[^&]+/, "step=summarize"));
    await page.evaluate(() => window.STEPDECK.ready);
    await page.evaluate(() => window.STEPDECK.settled());
    assert.deepEqual(back, await snapshot(page), "going back equals a fresh jump");
  });
});

test("scroll window: at the last step only the newest N lines remain, all inside the log", async () => {
  await withPage({ root, url: spike("step=done") }, async (page, ctx) => {
    const s = await snapshot(page);
    assert.ok(s.capacity < 22, `the full session does not fit (capacity ${s.capacity}), so lines scroll out`);
    assert.equal(s.indexes.length, s.capacity);
    assert.equal(s.indexes.at(-1), 21);
    assert.equal(s.indexes[0], 22 - s.capacity);
    const inside = await page.evaluate(() => {
      const log = document.querySelector('[data-el="term"] .sd-terminal-log').getBoundingClientRect();
      return [...document.querySelectorAll('[data-el="term"] .sd-terminal-line')].every((l) => {
        const r = l.getBoundingClientRect();
        return r.top >= log.top - 0.5 && r.bottom <= log.bottom + 0.5 && r.left >= log.left - 0.5 && r.right <= log.right + 0.5;
      });
    });
    assert.ok(inside, "every line sits inside the log box");
    assert.deepEqual(s.tasks.map((t) => t.split(":")[0]), ["done", "done", "done"]);
    assert.equal(s.files.length, 3);
    assert.deepEqual(ctx.errors, []);
  });
});

test("capacity is measured in canvas pixels: the same at 1920 and 1280 wide", async () => {
  let big;
  await withPage({ root, url: spike("step=done") }, async (page) => {
    big = (await snapshot(page)).capacity;
  });
  await withPage({ root, size: 1280, url: spike("step=done") }, async (page) => {
    assert.equal((await snapshot(page)).capacity, big);
  });
});

test("all text is at least 28px and the window sits inside the canvas", async () => {
  await withPage({ root, url: spike("step=done") }, async (page) => {
    const r = await page.evaluate(() => {
      const term = document.querySelector('[data-el="term"] .sd-terminal');
      const sizes = new Set();
      const walker = document.createTreeWalker(term, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.textContent.trim()) sizes.add(parseFloat(getComputedStyle(n.parentElement).fontSize));
      }
      const box = term.getBoundingClientRect();
      const canvas = document.querySelector(".sd-canvas").getBoundingClientRect();
      return { min: Math.min(...sizes), box: [box.left, box.top, box.right, box.bottom], canvas: [canvas.left, canvas.top, canvas.right, canvas.bottom] };
    });
    assert.ok(r.min >= 28, `smallest text ${r.min}px`);
    assert.ok(r.box[0] >= r.canvas[0] && r.box[1] >= r.canvas[1] && r.box[2] <= r.canvas[2] + 0.5 && r.box[3] <= r.canvas[3] + 0.5);
  });
});

test("played equals jumped, at every step", async () => {
  const played = [];
  const jumped = [];
  await withPage({ root, url: spike("step=open&motion=full") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true, "the played run really animates");
    played.push(await snapshot(page));
    for (const step of STEPS.slice(1)) {
      await goTo(page, step);
      played.push(await snapshot(page));
    }
    for (const step of STEPS) {
      await ctx.open(spike(`step=${step}`));
      jumped.push(await snapshot(page));
    }
    assert.deepEqual(ctx.errors, []);
  });
  assert.deepEqual(played.map((s) => s.shown), SHOWN);
  assert.deepEqual(played, jumped);
});

// Interrupt the first animated step (typed command + staggered lines) mid-flight.
for (const target of ["open", "fix"]) {
  test(`a step interrupted mid-flight by goTo('${target}') snaps to the jumped state`, async () => {
    await withPage({ root, url: spike(`step=${target}`) }, async (page, ctx) => {
      const jumped = await snapshot(page);
      await ctx.open(spike("step=open&motion=full"));
      const r = await page.evaluate(async (target) => {
        const cmd = () => document.querySelector('[data-el="term"] .sd-terminal-command').textContent;
        window.STEPDECK.goTo("terminal", "inspect");
        await new Promise((res) => setTimeout(res, 150));
        const mid = cmd();
        const t0 = performance.now();
        window.STEPDECK.goTo("terminal", target);
        await window.STEPDECK.settled();
        return { mid, elapsed: performance.now() - t0 };
      }, target);
      assert.ok(r.mid.length > 0 && r.mid.length < session.command.length, `the command was being typed (${JSON.stringify(r.mid)})`);
      assert.ok(r.elapsed < 600, `the aborted step snapped (settled in ${Math.round(r.elapsed)} ms)`);
      const s = await snapshot(page);
      assert.equal(await page.evaluate(() => document.querySelectorAll('[data-el="term"] [style]').length), 0, "no inline styles remain");
      assert.deepEqual(s, jumped);
      assert.deepEqual(ctx.errors, []);
    });
  });
}

test("an animated step really types and staggers", async () => {
  await withPage({ root, url: spike("step=open&motion=full") }, async (page) => {
    const mid = await page.evaluate(async () => {
      window.STEPDECK.goTo("terminal", "inspect");
      await new Promise((res) => setTimeout(res, 200));
      const term = document.querySelector('[data-el="term"] .sd-terminal');
      return {
        command: term.querySelector(".sd-terminal-command").textContent,
        faded: [...term.querySelectorAll(".sd-terminal-line")].filter((l) => Number(getComputedStyle(l).opacity) < 1).length,
      };
    });
    await page.evaluate(() => window.STEPDECK.settled());
    const end = await snapshot(page);
    assert.notEqual(mid.command, end.command, "mid-flight the command is partially typed");
    assert.equal(end.command, session.command);
  });
});

// Owned entrance, in the motion fixture's terminal-enters slide (the command, then four lines at the "go" step).
// Per frame: how much of the command is typed, each log line's computed opacity, and whether any inline style is
// left inside the element.
const buildProbe = (el) => ({
  typed: el.querySelector(".sd-terminal-command").textContent.length,
  ops: [...el.querySelectorAll(".sd-terminal-line")].map((l) => Number(getComputedStyle(l).opacity)),
  inline: el.querySelectorAll("[style]").length > 0,
});
const motionSession = JSON.parse(readFileSync(new URL("../fixtures/decks/motion/data/session.json", import.meta.url), "utf8"));

test("terminal entering builds from empty: the command types, then the lines fade in", async () => {
  await withPage({ root, url: motion.url("terminal-enters", "step=start&motion=full") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    const full = motionSession.command.length;
    const r = await sampleFrames(page, "terminal-enters", "go", "term", buildProbe);
    const shown = r.frames.filter((f) => f.visible);
    assert.ok(shown.length > 0, "the terminal is shown");
    const first = shown[0];
    assert.ok(first.ms >= 150, `held for the third slot, 2 x 80 ms (first shown at ${first.ms.toFixed(0)} ms)`);
    assert.ok(first.typed < full && first.ops.every((o) => o < 0.5), `nothing shows built at the first shown frame (${first.typed} chars, ${first.ops})`);
    assert.deepEqual(r.frames.filter((f) => f.style !== null).map((f) => f.style), [], "the box stays still: the terminal builds itself");

    // 100 ms into the build the command is part-typed.
    const at100 = shown.find((f) => f.ms >= first.ms + 100);
    assert.ok(at100.typed > 0 && at100.typed < full, `the command is part-typed 100 ms in (${at100.typed} of ${full} chars)`);
    const typing = shown.filter((f) => f.typed > 0 && f.typed < full);
    assert.ok(typing.length >= 5, `the command was seen part-typed (${typing.length} frames)`);
    assert.ok(typing.every((f) => f.ops.every((o) => o === 0)), "no line shows while the command is typed");
    // Then the lines fade in one after another, each --sd-stagger (80 ms) after the previous.
    assert.ok(shown.every((f) => f.ops.every((o) => o === 0) || f.typed === full), "the lines come only once the command is fully typed");
    const startOf = (i) => shown.find((f) => f.ops[i] > 0).ms;
    const lag = startOf(2) - startOf(0);
    assert.ok(lag >= 140 && lag < 600, `the third line starts ~160 ms after the first (${lag.toFixed(0)} ms)`);
    assert.ok(shown.every((f) => f.ops.every((o, i) => i === 0 || f.ops[i - 1] >= o)), "lines come in in order");
    assert.ok(shown.some((f) => f.ops[0] > 0.1 && f.ops[0] < 0.9), "a line was seen part-faded");
    assert.equal(r.end.typed, full, "the end state is the full command");
    assert.ok(r.end.ops.length === 4 && r.end.ops.every((o) => o === 1), "the end state shows the four lines");
    assert.equal(r.end.inline, false, "no inline style left inside the terminal");
    assert.ok(r.settledMs < 6000, `the build settles (${r.settledMs.toFixed(0)} ms)`);
    assert.equal(await elementHtml(page, "term"), await htmlAfterJump(ctx, page, motion, "terminal-enters", "go", "term"));

    const steps = ["start", "go", "more"];
    await expectJumpEqualsPlayed(ctx, page, { pages: motion, slide: "terminal-enters", steps, id: "term" });
    await expectBackwardEqualsJump(ctx, page, { pages: motion, slide: "terminal-enters", steps, id: "term" });
    await expectInterruptEqualsJump(ctx, page, { pages: motion, slide: "terminal-enters", from: "start", via: "go", to: "more", id: "term" });
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});

// Interrupted in each phase of the build; the page watches every frame until the phase holds, then asks for the
// next step. The phase must have been reached, or the test fails.
const phases = {
  held: "getComputedStyle(document.querySelector('[data-el=\"term\"]')).visibility === 'hidden' && performance.now() - t0 > 60",
  typing: "p.typed > 3 && p.typed < FULL && p.ops.every((o) => o === 0)",
  lines: "p.typed === FULL && p.ops[0] > 0.2 && p.ops[0] < 0.8",
};
for (const [phase, until] of Object.entries(phases)) {
  test(`terminal interrupted while ${phase === "held" ? "held" : `its ${phase === "typing" ? "command types" : "lines fade in"}`} snaps to the jumped state`, async () => {
    await withPage({ root, url: motion.url("terminal-enters", "step=more") }, async (page, ctx) => {
      const jumped = await elementHtml(page, "term");
      await ctx.open(motion.url("terminal-enters", "step=start&motion=full"));
      const reached = await page.evaluate(
        async ([until, probe, FULL]) => {
          const read = new Function("el", `return (${probe})(el)`);
          const t0 = performance.now();
          window.STEPDECK.goTo("terminal-enters", "go");
          let hit = false;
          for (let i = 0; i < 400 && !hit; i++) {
            await new Promise((r) => requestAnimationFrame(r));
            const p = read(document.querySelector('[data-el="term"]'));
            hit = new Function("p", "t0", "FULL", `return ${until}`)(p, t0, FULL);
          }
          window.STEPDECK.goTo("terminal-enters", "more");
          await window.STEPDECK.settled();
          return hit;
        },
        [until, String(buildProbe), motionSession.command.length],
      );
      assert.ok(reached, `the ${phase} phase was reached before the next step came`);
      assert.equal(await elementHtml(page, "term"), jumped, `interrupted in the ${phase} phase equals a jump`);
      assert.equal(await page.evaluate(() => document.querySelectorAll('[data-el="term"] [style]').length), 0, "no inline styles remain");
      assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
      assert.deepEqual(ctx.errors, []);
    });
  });
}

test("a later step fades the new lines in with the theme's timing; the command is not typed again", async () => {
  await withPage({ root, url: motion.url("terminal-enters", "step=go&motion=full") }, async (page, ctx) => {
    const r = await sampleFrames(page, "terminal-enters", "more", "term", buildProbe);
    const full = motionSession.command.length;
    assert.ok(r.frames.every((f) => f.typed === full), "the command stays whole");
    assert.ok(r.frames.some((f) => f.ops[4] > 0.1 && f.ops[4] < 0.9), "a new line was seen part-faded");
    assert.ok(r.frames.every((f) => f.ops.slice(0, 4).every((o) => o === 1)), "the lines already shown stay put");
    assert.ok(r.settledMs >= 450, `400 ms fade plus one 80 ms stagger (settled at ${r.settledMs.toFixed(0)} ms)`);
    assert.equal(r.end.inline, false);
    assert.deepEqual(ctx.errors, []);
  });
});

test("entering with a new script: the old script's content is gone before the new one loads", async () => {
  await withPage({ root, url: spike("step=open") }, async (page) => {
    const r = await page.evaluate(async () => {
      const { default: terminal } = await import("../components/terminal/index.js");
      const { animate } = await import("../core/animate.js");
      const { makeMotion } = await import("../core/motion.js");
      const scripts = {
        "old.json": { title: "Old", command: "old run", tasks: ["Old task"], events: [{ type: "note", text: "Old one" }, { type: "note", text: "Old two" }, { type: "file", text: "old.txt" }] },
        "new.json": { title: "New", command: "new run", tasks: ["New task"], events: [{ type: "note", text: "New one" }, { type: "note", text: "New two" }, { type: "note", text: "New three" }] },
      };
      /** One element entering with new.json (held loading) over old.json, with this entrance. */
      const scenario = async (entrance) => {
        let gate = null; // while set, new.json stays loading
        const host = document.createElement("div");
        host.className = "sd-el";
        host.dataset.type = "terminal";
        host.style.cssText = "display:flex;flex-direction:column;width:1200px;height:600px";
        document.querySelector(".sd-canvas").appendChild(host);
        const ctx = { animate, motion: makeMotion({}), tokens: {}, data: async (path) => (path === "new.json" && gate ? gate : scripts[path]), size: { w: 1200, h: 600 } };
        const inst = await terminal.mount(host, { script: "old.json", shown: 3 }, ctx);
        const q = (sel) => [...host.querySelectorAll(sel)];
        // What paints: the texts, and the lines that are not at opacity 0.
        const showing = () => ({
          title: host.querySelector(".sd-terminal-title").textContent,
          command: host.querySelector(".sd-terminal-command").textContent,
          lines: q(".sd-terminal-line").filter((l) => l.style.opacity !== "0").map((l) => l.textContent),
          tasks: q(".sd-terminal-task").map((t) => t.textContent),
          files: q(".sd-terminal-file").map((f) => f.textContent),
        });
        const out = { before: showing() };
        let release;
        gate = new Promise((resolve) => (release = () => resolve(scripts["new.json"])));
        const signal = new AbortController().signal;
        const updating = inst.update({ script: "new.json", shown: 3, typing: true }, { animate: true, entered: true, entrance, signal });
        out.loading = showing();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        out.painted = showing();
        release();
        await updating;
        out.after = { ...showing(), styled: host.querySelectorAll("[style]:not(.sd-el)").length };
        host.remove();
        return out;
      };
      return { drawn: await scenario({ motion: "draw", duration: 60 }), moved: await scenario(null) };
    });
    const empty = { title: "", command: "", lines: [], tasks: [], files: [] };
    for (const [name, got] of Object.entries(r)) {
      assert.equal(got.before.command, "old run", `${name}: the old script is on screen before`);
      assert.equal(got.before.lines.length, 3, name);
      assert.deepEqual(got.loading, empty, `${name}: nothing of the old script is left once update returns its promise`);
      assert.deepEqual(got.painted, empty, `${name}: nor in the frames painted while the new script loads`);
      assert.equal(got.after.title, "New", name);
      assert.equal(got.after.command, "new run", name);
      assert.deepEqual(got.after.lines, ["noteNew one", "noteNew two", "noteNew three"], name);
      assert.equal(got.after.styled, 0, `${name}: no inline style left`);
    }
  });
});

test("the start state is written before update awaits; a shown element without an entrance snaps; timing is the theme's", async () => {
  await withPage({ root, url: spike("step=open") }, async (page) => {
    const r = await page.evaluate(async () => {
      const { default: terminal } = await import("../components/terminal/index.js");
      const { animate } = await import("../core/animate.js");
      const { makeMotion } = await import("../core/motion.js");
      const script = {
        title: "T", command: "assistant run", tasks: [],
        events: [{ type: "note", text: "One" }, { type: "note", text: "Two" }, { type: "note", text: "Three" }],
      };
      const make = async (tokens = {}) => {
        const host = document.createElement("div");
        host.className = "sd-el";
        host.dataset.type = "terminal"; // the element styles that give the log its height
        host.style.cssText = "display:flex;flex-direction:column;width:1200px;height:600px";
        document.querySelector(".sd-canvas").appendChild(host);
        const ctx = { animate, motion: makeMotion(tokens), tokens, data: async () => script, size: { w: 1200, h: 600 } };
        const hidden = { script: "s.json", shown: 0, typing: true };
        return { host, hidden, props: { ...hidden, shown: 3 }, inst: await terminal.mount(host, hidden, ctx) };
      };
      const state = (host) => ({
        command: host.querySelector(".sd-terminal-command").textContent,
        ops: [...host.querySelectorAll(".sd-terminal-line")].map((l) => l.style.opacity),
      });
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
      // Theme timing: two lines fade over --sd-duration 300 ms, the second 200 ms after the first.
      const { host, hidden, props, inst } = await make({ "--sd-duration": "300ms", "--sd-stagger": "200ms" });
      await inst.update({ ...hidden, shown: 1 }, info({ entered: false, animate: false }));
      const t0 = performance.now();
      await inst.update({ ...props, shown: 3 }, info({ entered: false }));
      out.elapsed = performance.now() - t0;
      return out;
    });
    assert.equal(r.sync.command, "", "the command starts empty");
    assert.deepEqual(r.sync.ops, ["0", "0", "0"], "every line starts at opacity 0");
    assert.deepEqual(r.after, { command: "assistant run", ops: ["", "", ""], styled: 0 });
    for (const name of ["none", "moved", "aborted"]) assert.deepEqual(r[name], { command: "assistant run", ops: ["", "", ""] }, `${name}: nothing is held back`);
    assert.ok(r.elapsed >= 480 && r.elapsed < 3000, `two lines: 300 ms fade, 200 ms stagger, 200 ms more (${r.elapsed.toFixed(0)} ms)`);
  });
});
