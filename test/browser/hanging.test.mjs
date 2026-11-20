// A component whose update never settles (I1): the controller's watchdog fails the element after
// 10 s and records the error; the reveal shell's neighbour prefetch never blocks navigation; `check`
// reports the element instead of aborting; a page that does not settle names its URL.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage, deckTarget } from "../../cli/browser.js";
import { check } from "../../cli/check.js";
import { formatProblem } from "../../cli/problems.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const deckDir = fileURLToPath(new URL("../fixtures/decks/hanging/", import.meta.url));
const show = (problems) => problems.map(formatProblem).join("\n") || "(no problems)";
const HANG_ERROR = "hang/h: did not settle within 10s";

test("reveal: a hanging component on a neighbour does not stop navigation; its error is recorded", { timeout: 60_000 }, async () => {
  await withPage({ root, timeout: 30_000 }, async (page, ctx) => {
    // Open at `title` and wait for ready only: the prefetch of `hang` (its neighbour) is still stuck.
    await page.goto(new URL("test/fixtures/decks/hanging/index.html#/title/0", ctx.base).href);
    await page.waitForFunction(() => window.STEPDECK?.state()?.slide === "title", null, { timeout: 10_000 });
    await page.keyboard.press("ArrowRight");
    // Well before the 10 s watchdog: the stuck prefetch must not hold up the slide asked for.
    await page.waitForFunction(() => window.STEPDECK.state()?.slide === "hang", null, { timeout: 4_000 });
    // The watchdog fails the element and records it while the slide is on screen.
    await page.waitForFunction((line) => window.STEPDECK.errors.includes(line), HANG_ERROR, { timeout: 20_000 });
    assert.match(await page.evaluate(() => document.querySelector(".reveal section.present .sd-error")?.textContent ?? ""), /did not settle within 10s/);
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => window.STEPDECK.state()?.slide === "next", null, { timeout: 10_000 });
    await page.evaluate(() => window.STEPDECK.settled());
    assert.equal(await page.evaluate(() => location.hash), "#/next/0");
    assert.equal(
      await page.evaluate(() => document.querySelector(".reveal section.present .sd-el[data-el='lead']")?.textContent),
      "After the hanging slide.",
      "the next slide is mounted, not a placeholder",
    );
    assert.deepEqual(ctx.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});

test("check: a hanging component is a render-error naming slide and element; the run completes", { timeout: 120_000 }, async () => {
  const problems = await check(deckDir);
  assert.deepEqual(
    problems.map((p) => [p.rule, p.slide, p.step, p.measured]),
    [["render-error", "hang", "0", HANG_ERROR]],
    show(problems),
  );
});

test("withPage: a page that does not settle in time names its URL, slide and step", { timeout: 30_000 }, async () => {
  const target = deckTarget(deckDir);
  await assert.rejects(
    withPage({ root: target.root, url: target.url({ slide: "hang", step: 0 }), timeout: 2_000 }),
    (error) => {
      assert.match(error.message, /deck did not become ready/);
      assert.match(error.message, /render\.html\?deck=/, "names the URL");
      assert.match(error.message, /slide 'hang', step '0'/);
      return true;
    },
  );
});
