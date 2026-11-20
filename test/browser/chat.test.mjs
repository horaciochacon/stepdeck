// `chat` in Chrome (slide kit 1, task 5). Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test --test-concurrency=1 test/browser/chat.test.mjs
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
const deck = fileURLToPath(new URL("../fixtures/decks/chat/", import.meta.url));
const pages = deckPages("test/fixtures/decks/chat/");
const EXCHANGE = ["none", "one", "two", "three"];
const TYPING = ["first", "second", "third"];

// What a viewer reads in message `i`: innerText leaves out visibility:hidden text (the untyped rest).
const readText = (page, i, id = "chat") =>
  page.evaluate(([id, i]) => document.querySelectorAll(`[data-el="${id}"] .sd-chat-text`)[i].innerText, [id, i]);
const fullText = (page, i, id = "chat") =>
  page.evaluate(([id, i]) => document.querySelectorAll(`[data-el="${id}"] .sd-chat-text`)[i].textContent, [id, i]);

test("jump equals played: exchange and typing", async () => {
  await withPage({ root, url: pages.url("exchange", "step=none") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "exchange", steps: EXCHANGE, id: "chat" });
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "typing", steps: TYPING, id: "chat" });
  });
});

test("backward equals jump: exchange and typing", async () => {
  await withPage({ root, url: pages.url("exchange", "step=none") }, async (page, ctx) => {
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "exchange", steps: EXCHANGE, id: "chat" });
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "typing", steps: TYPING, id: "chat" });
  });
});

test("interrupt mid-motion equals jump", async () => {
  await withPage({ root, url: pages.url("exchange", "step=none") }, async (page, ctx) => {
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "exchange", from: "none", via: "one", to: "three", id: "chat" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "exchange", from: "two", via: "three", to: "none", id: "chat" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "typing", from: "first", via: "second", to: "third", id: "chat" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "typing", from: "first", via: "second", to: "first", id: "chat" });
  });
});

test("animated step moves", async () => {
  await withPage({ root, url: pages.url("exchange", "step=none") }, async (page, ctx) => {
    const rise = await expectAnimatedStepMoves(ctx, page, {
      pages, slide: "exchange", from: "none", to: "one", id: "chat",
      probe: (p) => p.evaluate(() => [...document.querySelectorAll('[data-el="chat"] .sd-chat-msg')].map((m) => getComputedStyle(m).opacity).join(",")),
    });
    assert.match(rise.mid, /^0\.\d+,1,1$/, "the new message is part-way through its fade");
    await expectAnimatedStepMoves(ctx, page, { pages, slide: "typing", from: "first", to: "second", id: "chat" });
  });
});

test("shown hides messages but they keep their space", async () => {
  await withPage({ root, url: pages.url("exchange", "step=one") }, async (page, ctx) => {
    const boxes = (p) => p.evaluate(() => [...document.querySelectorAll('[data-el="chat"] .sd-chat-msg')].map((m) => { const r = m.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.height)]; }));
    const visible = (p) => p.evaluate(() => [...document.querySelectorAll('[data-el="chat"] .sd-chat-msg')].map((m) => getComputedStyle(m).visibility === "visible"));
    const atOne = await boxes(page);
    assert.deepEqual(await visible(page), [true, false, false]);
    await ctx.open(pages.url("exchange", "step=three"));
    assert.deepEqual(await boxes(page), atOne, "the geometry is the same with every message shown");
    assert.deepEqual(await visible(page), [true, true, true]);
    await ctx.open(pages.url("exchange", "step=none"));
    assert.deepEqual(await visible(page), [false, false, false]);
    assert.deepEqual(ctx.errors, []);
  });
});

test("bubbles: user aligns right, agent and note align left", async () => {
  await withPage({ root, url: pages.url("exchange", "step=three") }, async (page) => {
    const r = await page.evaluate(() => {
      const region = document.querySelector('[data-el="chat"]').getBoundingClientRect();
      return [...document.querySelectorAll('[data-el="chat"] .sd-chat-msg')].map((m) => {
        const b = m.getBoundingClientRect();
        return { role: m.dataset.role, left: b.left - region.left, right: region.right - b.right, width: b.width / region.width };
      });
    });
    assert.deepEqual(r.map((m) => m.role), ["user", "agent", "note"]);
    assert.ok(r[0].right < 1 && r[0].left > 10, `user is flush right (${JSON.stringify(r[0])})`);
    for (const m of [r[1], r[2]]) assert.ok(m.left < 1 && m.right > 10, `${m.role} is flush left (${JSON.stringify(m)})`);
    assert.ok(r.every((m) => m.width < 0.9), "bubbles do not span the whole region");
  });
});

test("card style shows label above text", async () => {
  await withPage({ root, url: pages.url("card", "") }, async (page, ctx) => {
    const r = await page.evaluate(() => {
      const region = document.querySelector('[data-el="chat"]').getBoundingClientRect();
      return [...document.querySelectorAll('[data-el="chat"] .sd-chat-msg')].map((m) => {
        const box = m.getBoundingClientRect();
        const label = m.querySelector(".sd-chat-label").getBoundingClientRect();
        const text = m.querySelector(".sd-chat-text").getBoundingClientRect();
        const cs = getComputedStyle(m);
        return {
          above: label.bottom <= text.top + 0.5,
          inside: label.top >= box.top && text.bottom <= box.bottom,
          full: Math.abs(box.width - region.width) < 1,
          border: parseFloat(cs.borderTopWidth),
          style: cs.borderTopStyle,
        };
      });
    });
    assert.equal(r.length, 2);
    for (const c of r) {
      assert.ok(c.above && c.inside, "the label sits at the top of the card, above the text");
      assert.ok(c.full, "cards stack full width");
      assert.equal(c.border, 2, "2px border");
      assert.equal(c.style, "solid");
    }
    assert.deepEqual(ctx.errors, []);
  });
});

test("card borders use the accent or the rule colour (theme tokens)", async () => {
  await withPage({ root, url: pages.url("card", "") }, async (page) => {
    const r = await page.evaluate(() => {
      const probe = (name) => {
        const el = document.createElement("i");
        el.style.color = `var(${name})`;
        document.querySelector(".sd-canvas").appendChild(el);
        const c = getComputedStyle(el).color;
        el.remove();
        return c;
      };
      const tokens = [probe("--sd-color-accent"), probe("--sd-color-rule")];
      const borders = [...document.querySelectorAll('[data-el="chat"] .sd-chat-msg')].map((m) => getComputedStyle(m).borderTopColor);
      return { tokens, borders };
    });
    for (const b of r.borders) assert.ok(r.tokens.includes(b), `border ${b} is one of ${r.tokens}`);
  });
});

test("typing types only the newest message on a forward step", async () => {
  await withPage({ root, url: pages.url("typing", "step=first&motion=full") }, async (page, ctx) => {
    const finalOf = await fullText(page, 1);
    assert.equal(await readText(page, 0), await fullText(page, 0));
    // Forward to 'second': message 1 is typed, message 0 stays complete throughout.
    await page.evaluate(() => { window.STEPDECK.goTo("typing", "second"); });
    const seen = [];
    for (let i = 0; i < 120 && !(seen.length && seen.at(-1).done); i++) {
      const s = await page.evaluate(() => {
        const t = [...document.querySelectorAll('[data-el="chat"] .sd-chat-text')];
        return { zero: t[0].innerText, one: t[1].innerText, done: t[1].innerText.length === t[1].textContent.length && !t[1].querySelector(".sd-chat-ghost") };
      });
      seen.push(s);
      await page.waitForTimeout(40);
    }
    await settled(page);
    const partial = seen.filter((s) => s.one.length > 0 && s.one.length < finalOf.length);
    assert.ok(partial.length >= 2, `typing passes through partial text (${seen.map((s) => s.one.length)})`);
    assert.ok(seen.every((s) => s.zero === seen[0].zero), "the older message is never retyped");
    assert.equal(await readText(page, 1), finalOf, "the end state is the full text");
    // Backward and a fresh jump never type.
    await goTo(page, "typing", "third");
    await goTo(page, "typing", "second");
    assert.equal(await readText(page, 1), finalOf, "going back shows the full text at once");
    await ctx.open(pages.url("typing", "step=third&motion=full"));
    await goTo(page, "typing", "second");
    assert.equal(await readText(page, 1), finalOf, "going back from a fresh load shows the full text");
    assert.deepEqual(ctx.errors, []);
  });
  await withPage({ root, url: pages.url("typing", "step=second&motion=full") }, async (page) => {
    assert.equal(await readText(page, 1), await fullText(page, 1), "a jump shows the full text");
  });
});

test("typing keeps the message box the size it ends at", async () => {
  await withPage({ root, url: pages.url("typing", "step=first&motion=full") }, async (page) => {
    const box = (p) => p.evaluate(() => { const r = document.querySelectorAll('[data-el="chat"] .sd-chat-msg')[1].getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
    await page.evaluate(() => { window.STEPDECK.goTo("typing", "second"); });
    await page.waitForTimeout(700);
    const mid = await box(page);
    await settled(page);
    assert.deepEqual(mid, await box(page), "the untyped rest keeps its space");
  });
});

test("without typing the text is whole during the move", async () => {
  await withPage({ root, url: pages.url("exchange", "step=none&motion=full") }, async (page) => {
    await page.evaluate(() => { window.STEPDECK.goTo("exchange", "one"); });
    await page.waitForTimeout(150);
    assert.equal(await readText(page, 0), await fullText(page, 0));
    await settled(page);
  });
});

test("markdown in messages is escaped", async () => {
  await withPage({ root, url: pages.url("escape", "") }, async (page, ctx) => {
    const r = await page.evaluate(() => {
      const el = document.querySelector('[data-el="chat"]');
      return {
        scripts: el.querySelectorAll("script").length,
        imgs: el.querySelectorAll("img").length,
        strong: el.querySelectorAll("strong").length,
        code: el.querySelectorAll("code").length,
        links: [...el.querySelectorAll("a")].map((a) => a.getAttribute("href")),
        pwned: window.__pwned,
        text: el.textContent,
      };
    });
    assert.equal(r.scripts, 0, "<script> is not an element");
    assert.match(r.text, /<script>window\.__pwned = 1<\/script>/, "it renders as text");
    assert.equal(r.imgs, 0);
    assert.deepEqual([r.strong, r.code], [1, 1], "inline markdown still renders");
    assert.deepEqual(r.links, ["#ok"], "the javascript: link is plain text");
    assert.equal(r.pwned, undefined);
    assert.deepEqual(ctx.errors, []);
  });
});

test("role, label and text are at least 28px", async () => {
  for (const [slide, query] of [["card", ""], ["exchange", "step=three"]]) {
    await withPage({ root, url: pages.url(slide, query) }, async (page) => {
      const r = await page.evaluate(() => {
        const min = parseFloat(getComputedStyle(document.querySelector(".sd-canvas")).getPropertyValue("--sd-min-audience-font"));
        const px = (sel) => [...document.querySelectorAll(`[data-el="chat"] ${sel}`)].map((n) => parseFloat(getComputedStyle(n).fontSize));
        return { min, text: px(".sd-chat-text"), label: px(".sd-chat-label"), code: px(".sd-chat-text code") };
      });
      assert.equal(r.min, 28);
      assert.ok(r.text.length >= 2 && r.text.every((s) => s >= 28), `${slide} text ${r.text}`);
      assert.ok(r.label.length >= 1 && r.label.every((s) => s >= 28), `${slide} label ${r.label}`);
    });
  }
});

test("bubble text has at least 4.5:1 contrast on its surface", async () => {
  await withPage({ root, url: pages.url("exchange", "step=three") }, async (page) => {
    const pairs = await page.evaluate(() => {
      // A computed color is rgb()/rgba() or color(srgb r g b [/ a]); read it by painting a pixel.
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const g = canvas.getContext("2d", { willReadFrequently: true });
      const rgb = (css) => {
        g.clearRect(0, 0, 1, 1);
        g.fillStyle = "#000";
        g.fillStyle = css;
        g.fillRect(0, 0, 1, 1);
        return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      return [...document.querySelectorAll('[data-el="chat"] .sd-chat-msg')].map((m) => {
        const cs = getComputedStyle(m);
        const t = getComputedStyle(m.querySelector(".sd-chat-text"));
        const bg = cs.backgroundColor;
        const clear = /rgba\(.*, 0\)$|transparent/.test(bg);
        return { role: m.dataset.role, fg: rgb(t.color), bg: rgb(clear ? getComputedStyle(document.querySelector(".sd-canvas")).backgroundColor : bg), bgRaw: bg };
      });
    });
    const lum = (c) => {
      const f = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
    };
    const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    assert.equal(pairs.length, 3);
    for (const p of pairs) assert.ok(ratio(p.fg, p.bg) >= 4.5, `${p.role}: ${ratio(p.fg, p.bg).toFixed(2)}:1 (${JSON.stringify(p)})`);
    const [user, agent] = pairs;
    assert.notDeepEqual(user.bg, agent.bg, "the user bubble is tinted, the agent bubble is the plain surface");
  });
});

test("long message wraps inside its bubble and the region", async () => {
  await withPage({ root, url: pages.url("long", "") }, async (page) => {
    const r = await page.evaluate(() => {
      const region = document.querySelector('[data-region="main"]').getBoundingClientRect();
      const m = document.querySelector('[data-el="chat"] .sd-chat-msg');
      const box = m.getBoundingClientRect();
      const text = m.querySelector(".sd-chat-text");
      const lineH = parseFloat(getComputedStyle(text).lineHeight);
      return { inside: box.left >= region.left - 0.5 && box.right <= region.right + 0.5, lines: text.getBoundingClientRect().height / lineH, scroll: m.scrollWidth - m.clientWidth };
    });
    assert.ok(r.inside, "the bubble stays inside the main region");
    assert.ok(r.lines > 1.5, `the long text wraps (${r.lines} lines)`);
    assert.ok(r.scroll <= 1, "no horizontal overflow");
  });
});

test("unknown role is an element error naming it; the sibling carries on", async () => {
  await withPage({ root, url: pages.url("badrole", "") }, async (page) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^badrole\/bad: .*robot/);
    assert.match(await page.textContent('[data-el="ok"]'), /Este sigue/);
  });
});

test("check is clean on the chat slides", async () => {
  for (const slide of ["exchange", "typing", "card", "long", "escape"]) {
    const problems = await check(deck, { slide });
    assert.deepEqual(problems.map(formatProblem), [], slide);
  }
});
