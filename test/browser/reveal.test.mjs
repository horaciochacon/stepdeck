// Reveal shell (spec §9): engine-owned hash, mount on approach, presenter notes, query flags.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { dump, measureInPage } from "../../cli/dump.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const spikeDir = fileURLToPath(new URL("../../examples/spike/", import.meta.url));
const deck = (query = "", hash = "") => `examples/spike/index.html${query ? `?${query}` : ""}${hash}`;
const PRESENT = ".reveal .slides > section.present .sd-canvas";

const settle = (page) => page.evaluate(async () => {
  await window.STEPDECK.settled();
  await document.fonts.ready;
});
const where = (page) => page.evaluate(() => {
  const s = window.STEPDECK.state();
  return { slide: s?.slide, stepId: String(s?.stepId), hash: location.hash };
});
const pageErrors = (ctx) => ctx.errors.filter((e) => e.startsWith("pageerror"));

test("hash round-trip", async () => {
  await withPage({ root, url: deck("", "#/trend/annotate") }, async (page, ctx) => {
    assert.deepEqual(await where(page), { slide: "trend", stepId: "annotate", hash: "#/trend/annotate" });
    const label = await page.evaluate((sel) => {
      const el = document.querySelector(`${sel} .sd-annotation-label`);
      return el && { text: el.textContent, visibility: getComputedStyle(el).visibility };
    }, PRESENT);
    assert.deepEqual(label, { text: "250 mg", visibility: "visible" }, "the annotation is on screen");

    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => location.hash === "#/trend/focus", null, { timeout: 5000 });
    await settle(page);
    assert.deepEqual(await where(page), { slide: "trend", stepId: "focus", hash: "#/trend/focus" });

    // Editing the hash navigates; a step given by number is written back as its id.
    await page.evaluate(() => (location.hash = "#/hello/1"));
    await page.waitForFunction(() => window.STEPDECK.state()?.slide === "hello", null, { timeout: 5000 });
    await settle(page);
    assert.deepEqual(await where(page), { slide: "hello", stepId: "two", hash: "#/hello/two" });
    // STEPDECK.goTo moves reveal too.
    await page.evaluate(() => window.STEPDECK.goTo("trend", "regimens"));
    await settle(page);
    assert.deepEqual(await where(page), { slide: "trend", stepId: "regimens", hash: "#/trend/regimens" });
    assert.deepEqual(await page.evaluate(() => {
      const r = window.Reveal.getIndices();
      return [r.h, r.f];
    }), [2, 0], "reveal shows slide 2 (trend) with its first fragment");
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(pageErrors(ctx), []);
  });
});

test("back from next slide restores last step", async () => {
  await withPage({ root, url: deck("", "#/terminal/0") }, async (page, ctx) => {
    assert.equal((await where(page)).slide, "terminal");
    await page.keyboard.press("ArrowLeft");
    await page.waitForFunction(() => window.STEPDECK.state()?.slide === "trend", null, { timeout: 5000 });
    await settle(page);
    assert.deepEqual(await where(page), { slide: "trend", stepId: "total", hash: "#/trend/total" });
    const big = await page.evaluate((sel) => {
      const el = document.querySelector(`${sel} [data-el="big"]`);
      return getComputedStyle(el).visibility;
    }, PRESENT);
    assert.equal(big, "visible", "the last step's element is shown");
    // Forward again: next slide at step 0.
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => window.STEPDECK.state()?.slide === "terminal", null, { timeout: 5000 });
    await settle(page);
    assert.equal((await where(page)).hash, `#/terminal/${await page.evaluate(() => window.STEPDECK.steps.terminal[0])}`);
    assert.deepEqual(pageErrors(ctx), []);
  });
});

test("mount on approach: current ±1 mounted once each, the rest show their title only", async () => {
  await withPage({ root, url: deck("", "#/hello/one") }, async (page) => {
    const sections = () => page.evaluate(() => [...document.querySelectorAll(".reveal .slides > section")].map((s) => ({
      slide: s.dataset.sdSlide,
      canvases: s.querySelectorAll(".sd-canvas").length,
      placeholder: s.querySelector(".sd-placeholder")?.textContent ?? null,
      fragments: s.querySelectorAll(".fragment").length,
    })));
    let s = await sections();
    assert.deepEqual(s.map((x) => x.slide), ["cover", "hello", "trend", "terminal", "story"]);
    assert.deepEqual(s.map((x) => x.fragments), [0, 1, 4, ...(await page.evaluate(() => [
      window.STEPDECK.steps.terminal.length - 1, window.STEPDECK.steps.story.length - 1,
    ]))], "one fragment per step after step 0");
    assert.deepEqual(s.map((x) => x.canvases), [1, 1, 1, 0, 0]);
    assert.deepEqual(s.map((x) => x.placeholder), [null, null, null, "An agent works through a task", "From study data to a result"],
      "an unmounted slide shows its title only");

    await page.evaluate(() => window.STEPDECK.goTo("terminal", 0));
    await settle(page);
    s = await sections();
    assert.deepEqual(s.map((x) => x.canvases), [1, 1, 1, 1, 1], "every slide frame is attached at most once");
  });
});

test("notes for the step are what the notes plugin reads", async () => {
  await withPage({ root, url: deck("", "#/trend/focus") }, async (page) => {
    const read = () => page.evaluate(() => {
      // The notes plugin takes the current fragment's data-notes, else the slide's (plugin/notes.js).
      const slide = window.Reveal.getCurrentSlide();
      const frag = slide.querySelector(".current-fragment");
      return {
        plugin: frag?.hasAttribute("data-notes") ? frag.getAttribute("data-notes") : slide.getAttribute("data-notes"),
        state: window.STEPDECK.state().notes ?? "",
      };
    });
    assert.deepEqual(await read(), { plugin: "Pause here.", state: "Pause here." });
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => location.hash === "#/trend/total", null, { timeout: 5000 });
    await settle(page);
    const after = await read();
    assert.equal(after.plugin, after.state);
    assert.notEqual(after.plugin, "Pause here.", "a step without notes does not inherit the previous step's");
  });
});

test("reduced motion disables animate unless motion=full", async () => {
  await withPage({ root }, async (page, ctx) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ctx.open(deck("", "#/trend/base"));
    assert.deepEqual(await page.evaluate(() => [window.STEPDECK.flags.motion, window.STEPDECK.flags.animate]), [false, false]);
    assert.equal(await page.evaluate(() => document.querySelector(".sd-motion-off")), null, "no indicator for the audience");

    await ctx.open(deck("motion=full", "#/trend/base"));
    assert.deepEqual(await page.evaluate(() => [window.STEPDECK.flags.motion, window.STEPDECK.flags.animate]), [true, true]);

    // Preview frames (the presenter's ?receiver iframes): never animate; "motion off" is shown there.
    await ctx.open(deck("receiver", "#/1/0"));
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), false);
    assert.equal(await page.evaluate(() => document.querySelector(".sd-motion-off")?.textContent), "motion off");
    assert.equal(await page.evaluate(() => location.hash), "#/1/0", "a preview frame leaves reveal's hash alone");
    await ctx.open(deck("receiver&motion=full", "#/1/0"));
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), false, "previews never animate");
    assert.equal(await page.evaluate(() => document.querySelector(".sd-motion-off")), null);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await ctx.open(deck("", "#/trend/base"));
    assert.deepEqual(await page.evaluate(() => [window.STEPDECK.flags.motion, window.STEPDECK.flags.animate]), [true, true]);
    await ctx.open(deck("capture", "#/trend/base"));
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), false);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("capture")), true);
  });
});

test("preview frames mute media", async () => {
  await withPage({ root, url: deck("receiver", "#/0/0") }, async (page) => {
    const muted = await page.evaluate(async () => {
      const v = document.createElement("video");
      document.querySelector(".reveal .slides > section.present .sd-canvas").appendChild(v);
      await new Promise((r) => setTimeout(r, 50));
      return v.muted;
    });
    assert.equal(muted, true);
  });
});

for (const size of [1920, 2560, 1280]) {
  test(`jump via hash equals bare render (viewport ${size})`, async () => {
    const [bare] = await dump(spikeDir, { slide: "trend", step: "annotate" });
    await withPage({ root, size, url: deck("capture", "#/trend/annotate") }, async (page, ctx) => {
      const m = await page.evaluate(measureInPage, [1920, PRESENT]);
      assert.deepEqual(m.errors, []);
      assert.equal(m.stepId, "annotate");
      assert.deepEqual(m.elements, bare.elements);
      const leak = await page.evaluate((sel) => {
        const c = document.querySelector(sel);
        const cs = getComputedStyle(c);
        return { textAlign: cs.textAlign, fontFamily: cs.fontFamily === getComputedStyle(document.documentElement).getPropertyValue("--sd-font-body").trim() };
      }, PRESENT);
      assert.deepEqual(leak, { textAlign: "start", fontFamily: true }, "no reveal styling reaches the canvas");
      assert.deepEqual(pageErrors(ctx), []);
    });
  });
}

test("theme and lang flags reach the reveal shell", async () => {
  await withPage({ root, url: deck("lang=es&theme=academic-light", "#/hello/one") }, async (page) => {
    const flags = await page.evaluate(() => window.STEPDECK.flags);
    assert.equal(flags.lang, "es");
    assert.equal(flags.theme, "academic-light");
  });
});

test("a failed slide shows its error on that slide only", async () => {
  await withPage({ root, url: "test/fixtures/decks/broken/index.html#/bad-patch/oops" }, async (page, ctx) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^bad-patch: unknown element 'ghost'/);
    const perSlide = await page.evaluate(() => [...document.querySelectorAll(".reveal .slides > section")].map((s) => ({
      slide: s.dataset.sdSlide,
      canvases: s.querySelectorAll(".sd-canvas").length,
      errors: [...s.querySelectorAll(".sd-error")].map((e) => e.textContent.split(":")[0]),
    })));
    assert.deepEqual(perSlide, [
      { slide: "bad-type", canvases: 1, errors: ["bad-type/typo"] },
      { slide: "bad-patch", canvases: 1, errors: ["bad-patch"] },
      { slide: "bad-shape", canvases: 1, errors: ["bad-shape"] },
    ]);
    assert.deepEqual(pageErrors(ctx), []);
  });
});

test("presenter view: the step's notes, live previews, and opening it never moves the talk", async () => {
  await withPage({ root, url: deck("", "#/trend/focus") }, async (page, ctx) => {
    const [popup] = await Promise.all([page.context().waitForEvent("page"), page.keyboard.press("s")]);
    const notes = () => popup.evaluate(() => {
      const n = document.querySelector(".speaker-controls-notes");
      return !n || n.classList.contains("hidden") ? null : n.querySelector(".value").textContent;
    });
    const previews = () => Promise.all(popup.frames().filter((f) => /receiver/.test(f.url())).map((f) =>
      f.evaluate(() => { const s = window.STEPDECK?.state(); return s ? `${s.slide}/${s.stepId}` : null; }).catch(() => null)));
    const until = async (fn, want) => {
      for (let i = 0; i < 100; i++) {
        if (JSON.stringify(await fn()) === JSON.stringify(want)) return;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.deepEqual(await fn(), want);
    };
    await until(notes, "Pause here.");
    await until(previews, ["trend/focus", "trend/total"]);
    await new Promise((r) => setTimeout(r, 800)); // past the speaker view's 500 ms relay debounce
    assert.equal(await page.evaluate(() => location.hash), "#/trend/focus", "opening the presenter view keeps the talk where it is");

    await page.bringToFront();
    await page.keyboard.press("ArrowRight");
    await until(previews, ["trend/total", "terminal/open"]);
    await until(notes, null);
    assert.equal(await page.evaluate(() => location.hash), "#/trend/total");
    assert.deepEqual(pageErrors(ctx), []);
  });
});

test("STEPDECK.goTo to an unknown slide records an error and keeps the talk where it is", async () => {
  await withPage({ root, url: deck("", "#/hello/one") }, async (page, ctx) => {
    await page.evaluate(() => window.STEPDECK.goTo("nope", 0));
    await settle(page);
    assert.deepEqual(await where(page), { slide: "hello", stepId: "one", hash: "#/hello/one" });
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), ["stepdeck: unknown slide 'nope' (slides: cover, hello, trend, terminal, story)"]);
    assert.deepEqual(pageErrors(ctx), []);
  });
});

test("an unknown step or a bad hash records an error and reveal, the engine and the hash agree", async () => {
  const agree = (page) => page.evaluate(() => {
    const s = window.STEPDECK.state();
    const { h, f } = window.Reveal.getIndices();
    return { slide: s?.slide, stepId: String(s?.stepId), hash: location.hash, reveal: [h, f ?? -1] };
  });
  // On load: an unknown step opens its slide at step 0.
  await withPage({ root, url: deck("", "#/trend/bogus") }, async (page, ctx) => {
    assert.deepEqual(await agree(page), { slide: "trend", stepId: "base", hash: "#/trend/base", reveal: [2, -1] });
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), [
      "stepdeck: unknown step 'bogus' in slide 'trend' (steps: base, regimens, annotate, focus, total) in the URL hash",
    ]);
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => location.hash === "#/trend/regimens", null, { timeout: 5000 });
    await settle(page);
    assert.deepEqual(await agree(page), { slide: "trend", stepId: "regimens", hash: "#/trend/regimens", reveal: [2, 0] });

    // While presenting: a bad hash (unknown step, unknown slide, bad escape) or goTo keeps the talk.
    const kept = { slide: "trend", stepId: "regimens", hash: "#/trend/regimens", reveal: [2, 0] };
    for (const bad of ["#/trend/bogus", "#/nope/0", "#/tr%E0%A4end/0"]) {
      await page.evaluate((h) => (location.hash = h), bad);
      await page.waitForFunction(() => location.hash === "#/trend/regimens", null, { timeout: 5000 });
      await settle(page);
      assert.deepEqual(await agree(page), kept, bad);
    }
    await page.evaluate(() => window.STEPDECK.goTo("trend", "bogus"));
    await page.evaluate(() => window.STEPDECK.goTo("hello", 7));
    await settle(page);
    assert.deepEqual(await agree(page), kept);
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.deepEqual(errors.slice(1), [
      "stepdeck: unknown step 'bogus' in slide 'trend' (steps: base, regimens, annotate, focus, total) in the URL hash",
      "stepdeck: unknown slide 'nope' (slides: cover, hello, trend, terminal, story) in the URL hash",
      "stepdeck: cannot decode '#/tr%E0%A4end/0' in the URL hash",
      "stepdeck: unknown step 'bogus' in slide 'trend' (steps: base, regimens, annotate, focus, total)",
      "stepdeck: unknown step '7' in slide 'hello' (steps: one, two)",
    ]);
    assert.deepEqual(pageErrors(ctx), []);
  });
  // On load: an unknown slide or a bad escape opens the first slide; ?step= unknown opens step 0.
  for (const [url, want] of [
    [deck("", "#/nope/0"), { slide: "cover", stepId: "0", hash: "#/cover/0", reveal: [0, -1] }],
    [deck("", "#/tr%E0%A4end/0"), { slide: "cover", stepId: "0", hash: "#/cover/0", reveal: [0, -1] }],
    [deck("slide=trend&step=bogus"), { slide: "trend", stepId: "base", hash: "#/trend/base", reveal: [2, -1] }],
  ]) {
    await withPage({ root, url }, async (page) => {
      assert.deepEqual(await agree(page), want, url);
      assert.equal((await page.evaluate(() => window.STEPDECK.errors)).length, 1, url);
    });
  }
});
