// `markdown` and `big-number` in Chrome (spec §6.3, §6.4, §6.6, §8). Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { checkPlayed } from "../../cli/check.js";
import { deckPages, elementHtml, htmlAfterJump, expectJumpEqualsPlayed, expectInterruptEqualsJump, sampleFrames } from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = fileURLToPath(new URL("../fixtures/decks/components-m1/", import.meta.url));
const url = (slide, q = "") => `engine/core/render.html?deck=../../test/fixtures/decks/components-m1/&slide=${slide}&${q}`;
const spike = (q) => `engine/core/render.html?deck=../../examples/spike/&slide=trend&${q}`;
const motion = deckPages("test/fixtures/decks/motion/"); // modern theme: --sd-duration 400ms, --sd-stagger 80ms

const goTo = async (page, slide, step) => {
  await page.evaluate(([sl, st]) => window.STEPDECK.goTo(sl, st), [slide, step]);
  await page.evaluate(() => window.STEPDECK.settled());
};
const digits = (page, id) => page.textContent(`[data-el="${id}"] .sd-big-number-value`);

test("color word localized: {{color:accent}} is the palette's Spanish name in an es deck", async () => {
  await withPage({ root, url: url("md", "step=start") }, async (page, ctx) => {
    const text = await page.textContent('[data-el="body"]');
    assert.match(text, /La serie en azul sube; la alerta va en bermellón\./);
    assert.doesNotMatch(text, /\{\{|accent|blue/);
    // The same deck in English names the same colors in English.
    await ctx.open(url("md", "step=start&lang=en"));
    assert.match(await page.textContent('[data-el="body"]'), /La serie en blue sube; la alerta va en vermillion\./);
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});

test("unknown color role is an element error naming the role; the sibling carries on", async () => {
  await withPage({ root, url: url("badcolor") }, async (page) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^badcolor\/bad: .*chartreuse/);
    assert.match(await page.textContent('[data-el="ok"]'), /Este sigue: azul\./);
  });
});

test("markdown escapes html", async () => {
  await withPage({ root, url: url("md", "step=start") }, async (page, ctx) => {
    const r = await page.evaluate(() => {
      const el = document.querySelector('[data-el="body"]');
      return {
        scripts: el.querySelectorAll("script").length,
        images: el.querySelectorAll("img").length,
        pwned: window.__pwned,
        text: el.textContent,
        strong: el.querySelector("strong")?.textContent,
        em: el.querySelector("em")?.textContent,
        code: el.querySelector("code")?.textContent,
        h2: el.querySelector("h2")?.textContent,
        items: el.querySelectorAll("li").length,
        hrefs: [...el.querySelectorAll("a")].map((a) => a.getAttribute("href")),
      };
    });
    assert.equal(r.scripts, 0, "no <script> element");
    assert.equal(r.images, 1, "only the allowed <img> (see the URL checks below)");
    assert.equal(r.pwned, undefined, "nothing ran");
    assert.match(r.text, /<script>window\.__pwned = 1<\/script>/, "the markup is shown as text");
    assert.match(r.text, /<img src=x onerror="window\.__pwned=1">/);
    // Markdown itself still works.
    assert.equal(r.strong, "primero");
    assert.equal(r.em, "segundo");
    assert.equal(r.code, "código");
    assert.equal(r.h2, "Resultados");
    assert.equal(r.items, 2);
    assert.ok(r.hrefs.every((h) => !/^javascript:/i.test(h ?? "")), "no javascript: link");
    assert.ok(r.hrefs.includes("#ok"));
    // Entity-encoded schemes (&#106;avascript:, &#x6A;, java&#x09;script:, javascript&colon;, &Tab;javascript:)
    // never reach the DOM as a link or image; what the browser resolves is always a safe URL.
    const urls = await page.evaluate(() => {
      const el = document.querySelector('[data-el="body"]');
      return {
        anchors: [...el.querySelectorAll("a")].map((a) => ({ text: a.textContent, href: a.href, protocol: a.protocol })),
        images: [...el.querySelectorAll("img")].map((i) => ({ alt: i.alt, src: i.src })),
        text: el.textContent,
      };
    });
    const safe = (p) => ["http:", "https:", "mailto:"].includes(p);
    assert.ok(urls.anchors.every((a) => safe(a.protocol)), JSON.stringify(urls.anchors));
    assert.deepEqual(urls.anchors.map((a) => a.text), ["enlace", "mail", "rel"], "only the allowed links are anchors");
    assert.ok(urls.images.every((i) => /^https?:\/\//.test(i.src)), JSON.stringify(urls.images));
    assert.deepEqual(urls.images.map((i) => i.alt), ["ok"], "only the allowed image is an img");
    for (const t of ["e1", "e2", "e3", "e4", "e5", "i1", "i2", "i3", "i4", "i5"]) assert.ok(urls.text.includes(t), `${t} is shown as text`);
    assert.equal(await page.evaluate(() => document.querySelector('[data-el="body"]').innerHTML.includes("&#")), false, "no raw entity left in an attribute");
    assert.deepEqual(ctx.errors, []);
  });
});

test("markdown text is theme-sized (>= 28px) and appears with the step", async () => {
  await withPage({ root, url: url("md", "step=start") }, async (page) => {
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll('[data-el="body"] p, [data-el="body"] li, [data-el="body"] code, [data-el="body"] h2')].map((e) =>
        parseFloat(getComputedStyle(e).fontSize),
      ),
    );
    assert.ok(sizes.length >= 4 && sizes.every((s) => s >= 28), `font sizes ${sizes}`);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-el="more"]')).visibility), "hidden");
    await goTo(page, "md", "more");
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-el="more"]')).visibility), "visible");
  });
});

test("markdown: played equals jumped (check --played, fade leaves no residue)", async () => {
  const problems = await checkPlayed(fixture, { slide: "md" });
  assert.deepEqual(problems, []);
});

test("count-up lands on exact formatted value after settled", async () => {
  await withPage({ root, url: url("count", "step=start&motion=full") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    assert.equal(await digits(page, "num"), "1.000");
    // Sample the number while the step plays: it passes through values strictly between the two.
    const seen = await page.evaluate(async () => {
      const node = document.querySelector('[data-el="num"] .sd-big-number-value');
      const values = [];
      const stop = performance.now() + 1500;
      const go = window.STEPDECK.goTo("count", "up");
      const sample = () => {
        values.push(node.textContent);
        if (performance.now() < stop) requestAnimationFrame(sample);
      };
      sample();
      await go;
      await window.STEPDECK.settled();
      return values;
    });
    const asNumber = (s) => Number(s.replace(/\./g, "").replace(",", "."));
    const inBetween = seen.map(asNumber).filter((n) => n > 1000 && n < 53265);
    assert.ok(inBetween.length >= 3, `the count passes through intermediate values: ${seen.slice(0, 12)}`);
    assert.equal(await digits(page, "num"), "53.265", "es grouping, exact value");
    assert.equal(await page.getAttribute('[data-el="num"] .sd-big-number', "data-value"), "53265");
    // Same state as a fresh jump, and no inline residue.
    const played = await page.innerHTML('[data-el="num"]');
    await ctx.open(url("count", "step=up"));
    assert.equal(await page.innerHTML('[data-el="num"]'), played);
    assert.deepEqual(ctx.errors, []);
  });
});

test("count-up interrupted by a new step snaps to the exact value", async () => {
  await withPage({ root, url: url("count", "step=start&motion=full") }, async (page) => {
    await page.evaluate(async () => {
      window.STEPDECK.goTo("count", "up");
      await new Promise((r) => setTimeout(r, 120));
      window.STEPDECK.goTo("count", "same");
    });
    await page.evaluate(() => window.STEPDECK.settled());
    assert.equal(await digits(page, "num"), "53.265");
    assert.equal(await page.evaluate(() => document.querySelector('[data-el="num"] .sd-big-number').style.opacity), "");
  });
});

test("count-up does not rerun on unchanged step", async () => {
  await withPage({ root, url: url("count", "step=up&motion=full") }, async (page) => {
    // Slide level: a step that changes only a sibling never touches the big number.
    const mutations = await page.evaluate(async () => {
      const el = document.querySelector('[data-el="num"]');
      let n = 0;
      const mo = new MutationObserver((list) => (n += list.length));
      mo.observe(el, { subtree: true, childList: true, characterData: true, attributes: true });
      await window.STEPDECK.goTo("count", "same");
      await window.STEPDECK.settled();
      await new Promise((r) => setTimeout(r, 300));
      mo.disconnect();
      return n;
    });
    assert.equal(mutations, 0, "no DOM change in the big number");
    assert.equal(await digits(page, "num"), "53.265");

    // Component level: an update whose value did not change never tweens, even when animate is true.
    const result = await page.evaluate(async () => {
      const mod = (await import("../components/big-number/index.js")).default;
      const el = document.createElement("div");
      document.body.append(el);
      let tweens = 0;
      const ctx = {
        format: (spec) => (n) => `${spec}:${n}`,
        t: (k) => k,
        animate: {
          tween: async (from, to, on) => { tweens++; on(to); },
          fadeIn: async () => {},
        },
      };
      const props = { value: 7, format: ".0f", label: "x" };
      const inst = await mod.mount(el, props, ctx);
      const base = { entered: false, animate: true, signal: new AbortController().signal, step: 1, prevStep: 0 };
      await inst.update(props, { ...base, prev: null, changed: Object.keys(props), animate: false });
      const html = el.innerHTML;
      await inst.update({ ...props }, { ...base, prev: props, changed: [] });
      const unchanged = { tweens, same: el.innerHTML === html };
      await inst.update({ ...props, value: 9 }, { ...base, prev: props, changed: ["value"] });
      const afterChange = { tweens, text: el.querySelector(".sd-big-number-value").textContent };
      await inst.update({ ...props, value: 11 }, { ...base, prev: { ...props, value: 9 }, changed: ["value"], animate: false });
      const noAnimate = { tweens, text: el.querySelector(".sd-big-number-value").textContent };
      el.remove();
      return { unchanged, afterChange, noAnimate };
    });
    assert.deepEqual(result.unchanged, { tweens: 0, same: true });
    assert.deepEqual(result.afterChange, { tweens: 1, text: ".0f:9" });
    assert.deepEqual(result.noAnimate, { tweens: 1, text: ".0f:11" }, "info.animate false: written directly, no tween");
  });
});

test("big-number: es decimal comma, localized 95% CI with the same format, prefix and suffix", async () => {
  await withPage({ root, url: url("ci") }, async (page, ctx) => {
    assert.equal(await digits(page, "rate"), "12,5 %");
    assert.equal(await page.textContent('[data-el="rate"] .sd-big-number-ci'), "IC 95% 9,3–15,8");
    assert.equal(await page.textContent('[data-el="rate"] .sd-big-number-label'), "tasa");
    await ctx.open(url("ci", "lang=en"));
    assert.equal(await digits(page, "rate"), "12.5 %");
    assert.equal(await page.textContent('[data-el="rate"] .sd-big-number-ci'), "95% CI 9.3–15.8");
    const size = await page.evaluate(() => ({
      value: parseFloat(getComputedStyle(document.querySelector('[data-el="rate"] .sd-big-number-value')).fontSize),
      label: parseFloat(getComputedStyle(document.querySelector('[data-el="rate"] .sd-big-number-label')).fontSize),
      ci: parseFloat(getComputedStyle(document.querySelector('[data-el="rate"] .sd-big-number-ci')).fontSize),
    }));
    assert.ok(size.value >= 96, `display size ${size.value}`);
    assert.ok(size.label >= 28 && size.ci >= 28, JSON.stringify(size));
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
  });
});

test("big-number counts up from 0 when it appears in an animated step, and lands on the exact value", async () => {
  await withPage({ root, url: spike("step=focus&motion=full") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    const seen = await page.evaluate(async () => {
      const node = document.querySelector('[data-el="big"] .sd-big-number-value');
      const values = [];
      const stop = performance.now() + 1500;
      const go = window.STEPDECK.goTo("trend", "total");
      const sample = () => {
        values.push(node.textContent);
        if (performance.now() < stop) requestAnimationFrame(sample);
      };
      sample();
      await go;
      await window.STEPDECK.settled();
      return values;
    });
    const inBetween = seen.map((s) => Number(s.replace(/,/g, ""))).filter((n) => n > 0 && n < 2942);
    assert.ok(inBetween.length >= 3, `counts up from 0 on entry: ${seen.slice(0, 12)}`);
    assert.equal(await digits(page, "big"), "2,942");
    const played = await page.innerHTML('[data-el="big"]');
    // Jumped equals played.
    await ctx.open(spike("step=total"));
    assert.equal(await page.innerHTML('[data-el="big"]'), played);
    assert.deepEqual(ctx.errors, []);
  });
});

test("spike trend: the responders figure is a big-number bound to the data file, exact after played", async () => {
  await withPage({ root, url: spike("step=annotate&motion=full") }, async (page, ctx) => {
    const kind = await page.evaluate(() => window.STEPDECK.state().elements.big.type);
    assert.equal(kind, "big-number");
    await goTo(page, "trend", "total");
    assert.equal(await digits(page, "big"), "2,942");
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.errors, []);
  });
});

// In the page: STEPDECK.goTo("mdswap", step), then one sample per animation frame of each markdown root in `ids`
// until the step settles. A sample is { opacity (the root's computed opacity), inline (its style attribute) }.
const sampleMarkdown = (page, step, ids) =>
  page.evaluate(async ([step, ids]) => {
    const read = () => ids.map((id) => {
      const root = document.querySelector(`[data-el="${id}"] .sd-markdown`);
      return { opacity: Number(getComputedStyle(root).opacity), inline: root.getAttribute("style") };
    });
    const frames = [];
    let done = false;
    const tick = () => {
      if (done) return;
      frames.push(read());
      requestAnimationFrame(tick);
    };
    const moved = window.STEPDECK.goTo("mdswap", step).then(() => window.STEPDECK.settled());
    requestAnimationFrame(tick);
    await moved;
    done = true;
    return frames;
  }, [step, ids]);

test("markdown: a changed md fades in; an entering markdown is moved by its box, not by itself", async () => {
  await withPage({ root, url: url("mdswap", "step=start&motion=full") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    const frames = await sampleMarkdown(page, "go", ["tick", "fresh"]);
    const tick = frames.map((f) => f[0]);
    const fresh = frames.map((f) => f[1]);
    assert.ok(tick.some((f) => f.opacity < 0.5), `the changed text fades in from nearly invisible (${tick.map((f) => f.opacity).slice(0, 8)})`);
    assert.ok(fresh.every((f) => f.inline === null && f.opacity === 1), "the entering markdown has no motion of its own");
    assert.equal(await page.evaluate(() => document.querySelector('[data-el="tick"]').textContent.trim()), "Después: dos");
    // Played equals jumped.
    const played = await page.innerHTML('[data-el="tick"]');
    const playedFresh = await page.innerHTML('[data-el="fresh"]');
    await ctx.open(url("mdswap", "step=go"));
    assert.equal(await page.innerHTML('[data-el="tick"]'), played);
    assert.equal(await page.innerHTML('[data-el="fresh"]'), playedFresh);
    assert.deepEqual(ctx.errors, []);
  });
});

// Owned entrance. Per frame: the figure's text, the root's inline opacity and the element's markup.
const numberProbe = (el) => ({
  digits: el.querySelector(".sd-big-number-value")?.textContent ?? null,
  rootOpacity: el.querySelector(".sd-big-number")?.style.opacity ?? "",
  content: el.innerHTML,
});
const errorsClean = async (page, ctx) => {
  assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
  assert.deepEqual(ctx.errors, []);
};

test("big-number no flash before the count: held for its slot, the first value shown is 0, the box stays still", async () => {
  await withPage({ root, url: motion.url("number-third", "step=start&motion=full") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    const r = await sampleFrames(page, "number-third", "go", "num", numberProbe);
    const shown = r.frames.filter((f) => f.visible);
    assert.ok(shown.length > 0, "the number is shown");
    const first = shown[0];
    assert.equal(first.digits, "0", "the first value shown is 0");
    assert.ok(first.ms >= 150, `held for the third slot, 2 x 80 ms (first shown at ${first.ms.toFixed(0)} ms)`);
    assert.deepEqual(r.frames.filter((f) => f.style !== null).map((f) => f.style), [], "the box stays still: the number counts itself");
    const values = shown.map((f) => Number(f.digits.replace(/,/g, "")));
    assert.ok(values.filter((n) => n > 0 && n < 4820).length >= 3, `counts through values in between: ${values.slice(0, 12)}`);
    assert.ok(shown.some((f) => f.digits === "4,820"), "lands on the value");
    // The count ends the step: its 160 ms hold (timers never fire early) plus 2.25 x 400 ms is at least 1060 ms
    // from the goTo; 2 x --sd-duration would settle at about 960 ms.
    assert.ok(r.settledMs >= 1040 && r.settledMs < 4000, `held 160 ms, then counts over 2.25 x --sd-duration (settled at ${r.settledMs.toFixed(0)} ms)`);
    assert.equal(await elementHtml(page, "num"), await htmlAfterJump(ctx, page, motion, "number-third", "go", "num"));

    await expectJumpEqualsPlayed(ctx, page, { pages: motion, slide: "number-third", steps: ["start", "go", "more"], id: "num" });
    await expectInterruptEqualsJump(ctx, page, { pages: motion, slide: "number-third", from: "start", via: "go", to: "more", id: "num" });
    await errorsClean(page, ctx);
  });
});

test("big-number entrance timing: entrance.duration wins; else 2.25 x --sd-duration", async () => {
  await withPage({ root, url: url("count", "step=start") }, async (page) => {
    const r = await page.evaluate(async () => {
      const mod = (await import("../components/big-number/index.js")).default;
      const { animate } = await import("../core/animate.js");
      const props = { value: 500, format: ".0f", label: "x" };
      const signal = new AbortController().signal;
      // A fresh big-number with `--sd-duration` = `base` ms, shown by an update with `entrance`; timed until it settles.
      const timed = async (base, entrance) => {
        const el = document.createElement("div");
        document.body.append(el);
        const ctx = { format: () => (n) => String(Math.round(n)), t: (k) => k, animate, tokens: { "--sd-duration": `${base}ms` } };
        const inst = await mod.mount(el, props, ctx);
        await inst.update(props, { prev: null, changed: Object.keys(props), animate: false, entered: false, entrance: null, signal });
        const digits = () => el.querySelector(".sd-big-number-digits").textContent;
        const t0 = performance.now();
        const updating = inst.update(props, { prev: props, changed: [], animate: true, entered: true, entrance, signal });
        const sync = digits();
        await updating;
        const ms = performance.now() - t0;
        const end = digits();
        el.remove();
        return { sync, ms, end };
      };
      return {
        own: await timed(100, { motion: "draw", duration: 500 }), // the theme's count would be 225 ms
        theme: await timed(400, { motion: "draw", duration: undefined }), // 2.25 x 400 = 900 ms
        none: await timed(400, { motion: "none", duration: undefined }),
      };
    });
    // Lower bounds hold because a tween never ends before its duration; upper bounds are generous.
    assert.equal(r.own.sync, "0", "the start state is written at once");
    assert.ok(r.own.ms >= 450 && r.own.ms < 3000, `entrance.duration 500 ms wins over the theme's 225 ms (took ${r.own.ms.toFixed(0)} ms)`);
    assert.equal(r.theme.sync, "0");
    assert.ok(r.theme.ms >= 860 && r.theme.ms < 3000, `2.25 x a 400 ms --sd-duration is 900 ms; 2 x would be 800 (took ${r.theme.ms.toFixed(0)} ms)`);
    assert.equal(r.none.sync, "500", "none: the value at once");
    assert.ok(r.none.ms < 300, `none: no count, which would take 900 ms (took ${r.none.ms.toFixed(0)} ms)`);
    for (const k of ["own", "theme", "none"]) assert.equal(r[k].end, "500");
  });
});

test("big-number enter none snaps: no frame in motion, the end equals the jump", async () => {
  await withPage({ root }, async (page, ctx) => {
    const jumped = await htmlAfterJump(ctx, page, motion, "number-none", "go", "num");
    const content = await page.evaluate(() => document.querySelector('[data-el="num"]').innerHTML);
    await ctx.open(motion.url("number-none", "step=start&motion=full"));
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    const r = await sampleFrames(page, "number-none", "go", "num", numberProbe);
    const shown = r.frames.filter((f) => f.visible);
    assert.ok(shown.length > 0, "the number is shown");
    assert.deepEqual(shown.filter((f) => f.style !== null || f.content !== content).map((f) => [f.ms, f.digits]), [], "every shown frame is the end state");
    assert.equal(await elementHtml(page, "num"), jumped);
    await errorsClean(page, ctx);
  });
});

test("big-number enter rise: the box rises, the value shows at once", async () => {
  await withPage({ root }, async (page, ctx) => {
    const jumped = await htmlAfterJump(ctx, page, motion, "number-rise", "go", "num");
    const content = await page.evaluate(() => document.querySelector('[data-el="num"]').innerHTML);
    await ctx.open(motion.url("number-rise", "step=start&motion=full"));
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    const r = await sampleFrames(page, "number-rise", "go", "num", numberProbe);
    assert.ok(r.frames.some((f) => f.visible && /translateY/.test(f.style ?? "")), "the box rises");
    assert.deepEqual(r.frames.filter((f) => f.visible && f.content !== content).map((f) => [f.ms, f.digits, f.rootOpacity]), [], "the value shows from the first frame, with no fade of its own");
    assert.equal(await elementHtml(page, "num"), jumped);
    await errorsClean(page, ctx);
  });
});
