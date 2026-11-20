// `markdown` and `big-number` in Chrome (spec §6.3, §6.4, §6.6, §8). Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { checkPlayed } from "../../cli/check.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = fileURLToPath(new URL("../fixtures/decks/components-m1/", import.meta.url));
const url = (slide, q = "") => `engine/core/render.html?deck=../../test/fixtures/decks/components-m1/&slide=${slide}&${q}`;
const spike = (q) => `engine/core/render.html?deck=../../examples/spike/&slide=trend&${q}`;

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
