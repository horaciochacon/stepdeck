// `image` in Chrome (slide kit 1). Run with:
//   STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test --test-concurrency=1 test/browser/image.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { check } from "../../cli/check.js";
import { validate } from "../../cli/validate.js";
import { createAjv } from "../../cli/ajv.js";
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
const deck = fileURLToPath(new URL("../fixtures/decks/image/", import.meta.url));
const validateFixture = (name) => fileURLToPath(new URL(`../fixtures/validate/${name}/`, import.meta.url));
const pages = deckPages("test/fixtures/decks/image/");
const STEPS = ["a", "b", "c", "d"];

// What a viewer sees of the picture.
const picture = (page, id = "pic") =>
  page.evaluate((id) => {
    const el = document.querySelector(`[data-el="${id}"]`);
    const img = el.querySelector("img");
    const cs = getComputedStyle(img);
    const box = img.getBoundingClientRect();
    return {
      loaded: img.complete && img.naturalWidth > 0,
      natural: [img.naturalWidth, img.naturalHeight],
      url: img.currentSrc,
      alt: img.getAttribute("alt"),
      fit: cs.objectFit,
      opacity: cs.opacity,
      box: [box.width, box.height],
      caption: el.querySelector("figcaption")?.textContent ?? null,
    };
  }, id);

test("image loads before settled, from a path resolved against the deck root", async () => {
  await withPage({ root, url: pages.url("show", "step=a") }, async (page, ctx) => {
    let p = await picture(page);
    assert.ok(p.loaded, "complete with a natural size once settled");
    assert.deepEqual(p.natural, [640, 360]);
    assert.ok(p.url.endsWith("/test/fixtures/decks/image/assets/a.svg"), p.url);
    assert.equal(p.alt, "A blue circle beside an orange panel");
    await ctx.open(pages.url("show", "step=b&motion=full"));
    await goTo(page, "show", "a");
    await goTo(page, "show", "b");
    p = await picture(page);
    assert.ok(p.loaded);
    assert.deepEqual(p.natural, [400, 400]);
    assert.ok(p.url.endsWith("/assets/b.svg"));
    assert.equal(p.alt, "A green triangle");
    assert.deepEqual(ctx.errors, []);
  });
});

test("settled() waits for a slow image", async () => {
  await withPage({ root, url: pages.url("slow", "step=first&motion=full") }, async (page) => {
    await page.route("**/assets/b.svg", async (route) => {
      await new Promise((r) => setTimeout(r, 600));
      await route.continue();
    });
    const t0 = Date.now();
    await page.evaluate(() => { window.STEPDECK.goTo("slow", "second"); });
    await settled(page);
    const p = await picture(page);
    assert.ok(p.loaded, "the new image is loaded when settled() resolves");
    assert.deepEqual(p.natural, [400, 400]);
    assert.ok(Date.now() - t0 >= 500, "settled() waited for the response");
  });
});

test("jump equals played", async () => {
  await withPage({ root, url: pages.url("show", "step=a") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "show", steps: STEPS, id: "pic" });
  });
});

test("backward equals jump", async () => {
  await withPage({ root, url: pages.url("show", "step=a") }, async (page, ctx) => {
    await expectBackwardEqualsJump(ctx, page, { pages, slide: "show", steps: STEPS, id: "pic" });
  });
});

test("interrupt mid-motion equals jump", async () => {
  await withPage({ root, url: pages.url("show", "step=a") }, async (page, ctx) => {
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "show", from: "a", via: "b", to: "c", id: "pic" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "show", from: "b", via: "c", to: "d", id: "pic" });
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "show", from: "c", via: "d", to: "a", id: "pic" });
  });
});

test("animated step moves: a new source fades in", async () => {
  await withPage({ root, url: pages.url("show", "step=a") }, async (page, ctx) => {
    const probe = (p) => p.evaluate(() => getComputedStyle(document.querySelector('[data-el="pic"] img')).opacity);
    const { mid, end } = await expectAnimatedStepMoves(ctx, page, { pages, slide: "show", from: "a", to: "b", id: "pic", probe });
    assert.ok(Number(mid) < 1, `mid-flight opacity ${mid}`);
    assert.equal(end, "1");
  });
  await withPage({ root, url: pages.url("show", "step=b") }, async (page, ctx) => {
    const probe = (p) => p.evaluate(() => getComputedStyle(document.querySelector('[data-el="pic"] figcaption')).opacity);
    const { mid, end } = await expectAnimatedStepMoves(ctx, page, { pages, slide: "show", from: "b", to: "c", id: "pic", probe });
    assert.ok(Number(mid) < 1, `a changed caption fades: ${mid}`);
    assert.equal(end, "1");
  });
});

test("fit snaps between contain and cover; the image fills the element", async () => {
  await withPage({ root, url: pages.url("show", "step=b") }, async (page, ctx) => {
    let p = await picture(page);
    assert.equal(p.fit, "contain", "contain is the default");
    await ctx.open(pages.url("show", "step=c"));
    p = await picture(page);
    assert.equal(p.fit, "cover");
    const region = await page.evaluate(() => {
      const r = document.querySelector('[data-region="main"]').getBoundingClientRect();
      return [r.width, r.height];
    });
    assert.ok(p.box[0] >= region[0] - 1, `cover fills the width (${p.box} in ${region})`);
    assert.ok(p.box[1] > region[1] * 0.5, `and a good part of the height (${p.box} in ${region})`);
    assert.deepEqual(ctx.errors, []);
  });
});

test("going backward drops the caption and restores the source", async () => {
  await withPage({ root, url: pages.url("show", "step=c&motion=full") }, async (page) => {
    assert.equal((await picture(page)).caption, "The same triangle, cropped to fill the box");
    await goTo(page, "show", "b");
    const b = await picture(page);
    assert.equal(b.caption, "A synthetic triangle");
    assert.equal(b.fit, "contain");
    await goTo(page, "show", "a");
    const a = await picture(page);
    assert.equal(a.caption, null, "no caption element without a caption");
    assert.ok(a.url.endsWith("/assets/a.svg"));
  });
});

test("caption is in the note size (at least 28px) and the muted colour", async () => {
  await withPage({ root, url: pages.url("show", "step=b") }, async (page) => {
    const r = await page.evaluate(() => {
      const canvas = getComputedStyle(document.querySelector(".sd-canvas"));
      const cap = getComputedStyle(document.querySelector('[data-el="pic"] figcaption'));
      const probe = document.createElement("i");
      document.querySelector(".sd-canvas").appendChild(probe);
      probe.style.fontSize = canvas.getPropertyValue("--sd-font-size-note");
      probe.style.color = canvas.getPropertyValue("--sd-color-muted");
      const expected = { size: getComputedStyle(probe).fontSize, color: getComputedStyle(probe).color };
      probe.remove();
      return { size: cap.fontSize, color: cap.color, expected, min: parseFloat(canvas.getPropertyValue("--sd-min-audience-font")) };
    });
    assert.equal(r.size, r.expected.size, "the note size token");
    assert.equal(r.color, r.expected.color, "the muted colour token");
    assert.ok(parseFloat(r.size) >= r.min, `${r.size} >= ${r.min}`);
    assert.equal(r.min, 28);
  });
});

test("missing image is an element error naming the path; the sibling carries on", async () => {
  await withPage({ root, url: pages.url("missing", "") }, async (page) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /^missing\/pic: .*assets\/nope\.svg/);
    assert.match((await page.textContent('[data-el="pic"] .sd-error')) ?? "", /assets\/nope\.svg/);
    assert.match(await page.textContent('[data-el="ok"]'), /carries on/);
  });
});

test("a path outside the deck is an element error naming it", async () => {
  await withPage({ root, url: pages.url("outside", "") }, async (page) => {
    const errors = await page.evaluate(() => window.STEPDECK.errors);
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], /^outside\/pic: .*\.\.\/outside\.svg/);
    assert.match(await page.textContent('[data-el="ok"]'), /carries on/);
  });
});

test("a long caption wraps inside the region", async () => {
  await withPage({ root, url: pages.url("long", "") }, async (page, ctx) => {
    const r = await page.evaluate(() => {
      const region = document.querySelector('[data-region="main"]').getBoundingClientRect();
      const cap = document.querySelector('[data-el="pic"] figcaption');
      const b = cap.getBoundingClientRect();
      const img = document.querySelector('[data-el="pic"] img').getBoundingClientRect();
      return { inside: b.left >= region.left - 0.5 && b.right <= region.right + 0.5 && b.bottom <= region.bottom + 0.5, lines: b.height / parseFloat(getComputedStyle(cap).lineHeight), imgAbove: img.bottom <= b.top + 0.5, imgHeight: img.height };
    });
    assert.ok(r.inside, "the caption stays inside the main region");
    assert.ok(r.lines > 1.5, `the caption wraps (${r.lines} lines)`);
    assert.ok(r.imgAbove && r.imgHeight > 100, "the picture shrinks to make room");
    assert.deepEqual(ctx.errors, []);
  });
});

test("an image in the cover's figure region fits its column", async () => {
  await withPage({ root, url: pages.url("cover", "") }, async (page, ctx) => {
    const r = await page.evaluate(() => {
      const region = document.querySelector('[data-region="figure"]').getBoundingClientRect();
      const img = document.querySelector('[data-el="figure"] img').getBoundingClientRect();
      return { inside: img.left >= region.left - 0.5 && img.right <= region.right + 0.5 && img.top >= region.top - 0.5 && img.bottom <= region.bottom + 0.5, w: img.width };
    });
    assert.ok(r.inside && r.w > 200, JSON.stringify(r));
    assert.ok((await picture(page, "figure")).loaded);
    assert.deepEqual(ctx.errors, []);
  });
});

test("check is clean on the image slides", async () => {
  for (const slide of ["show", "slow", "cover", "long"]) {
    const problems = await check(deck, { slide });
    assert.deepEqual(problems.map(formatProblem), [], slide);
  }
});

test("validate: the deck reports only the missing file; alt is required and non-empty", async () => {
  const problems = await validate(deck);
  assert.deepEqual(problems.map((p) => [p.slide, p.rule]), [["missing", "file-missing"]], problems.map(formatProblem).join("\n"));
  assert.match(problems[0].measured, /assets\/nope\.svg/);

  for (const [name, shows] of [["image-alt-missing", /alt/], ["image-alt-empty", /alt/]]) {
    const found = await validate(validateFixture(name));
    assert.equal(found.length, 1, found.map(formatProblem).join("\n"));
    assert.equal(found[0].rule, "prop-invalid", name);
    assert.match(`${found[0].measured} ${found[0].limit} ${found[0].fix}`, shows, name);
  }

  // Whitespace only is not alt text either.
  const schema = JSON.parse(readFileSync(new URL("../../engine/components/image/schema.json", import.meta.url), "utf8"));
  const ok = createAjv().compile(schema);
  assert.equal(ok({ src: "a.svg", alt: "A circle" }), true);
  assert.equal(ok({ src: "a.svg", alt: "   " }), false);
  assert.equal(ok({ src: "a.svg" }), false);
  assert.equal(ok({ alt: "x" }), false, "src is required too");
  assert.equal(ok({ src: "a.svg", alt: "x", fit: "stretch" }), false);
});

test("an entering image is moved by its box, not by itself", async () => {
  await withPage({ root, url: pages.url("enter", "step=start&motion=full") }, async (page, ctx) => {
    assert.equal(await page.evaluate(() => window.STEPDECK.flags.animate), true);
    const frames = await page.evaluate(async () => {
      const read = () => {
        const fig = document.querySelector('[data-el="pic"] figure');
        const box = document.querySelector('[data-el="pic"]');
        return {
          figure: fig.getAttribute("style"),
          img: fig.querySelector("img").getAttribute("style"),
          box: Number(getComputedStyle(box).opacity),
          visible: getComputedStyle(box).visibility === "visible",
        };
      };
      const out = [];
      let done = false;
      const tick = () => {
        if (done) return;
        out.push(read());
        requestAnimationFrame(tick);
      };
      const moved = window.STEPDECK.goTo("enter", "go").then(() => window.STEPDECK.settled());
      requestAnimationFrame(tick);
      await moved;
      done = true;
      return out;
    });
    assert.ok(frames.every((f) => f.figure === null && f.img === null), "the figure and the picture never get an inline style");
    assert.ok(frames.some((f) => f.visible && f.box < 1), "the box fades in");
    assert.deepEqual(ctx.errors, []);
  });
});
