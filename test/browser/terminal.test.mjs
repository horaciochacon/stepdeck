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

const root = fileURLToPath(new URL("../../", import.meta.url));
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
