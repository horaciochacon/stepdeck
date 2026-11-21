// The kit example deck: every new layout and component, building step by step.
// It must stay clean under validate, check and check --played.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { validate } from "../../cli/validate.js";
import { check, runPlayed } from "../../cli/check.js";
import { formatProblem } from "../../cli/problems.js";
import { withPage } from "../../cli/browser.js";
import { deckPages, expectJumpEqualsPlayed } from "./helpers.mjs";

const kit = fileURLToPath(new URL("../../examples/kit/", import.meta.url));
const root = fileURLToPath(new URL("../../", import.meta.url));
const pages = deckPages("examples/kit/");

// Steps per slide, in deck order.
const STEPS = {
  cover: 1, question: 1, concept: 3, sandbox: 4, criteria: 4,
  tasks: 5, speed: 2, estimate: 2, exchange: 3, track: 3,
};

test("kit deck is clean", async () => {
  const v = await validate(kit);
  assert.deepEqual(v.map(formatProblem), [], "validate");

  const c = await check(kit);
  assert.deepEqual(c.map(formatProblem), [], "check");

  // check --played, and not vacuous: every step of every slide was compared along every path.
  const played = await runPlayed(kit);
  assert.deepEqual(played.problems.map(formatProblem), [], "check --played");
  assert.deepEqual(Object.keys(played.slides), Object.keys(STEPS));
  for (const [slide, n] of Object.entries(STEPS)) {
    assert.equal(played.slides[slide].jumped, n, `${slide}: jumps`);
    assert.equal(played.slides[slide].fromPrev, n - 1, `${slide}: animated arrivals from k-1`);
    assert.equal(played.slides[slide].fromNext, n - 1, `${slide}: arrivals from k+1`);
  }
});

test("a text that fades in leaves the same html as a jump (no empty style attribute)", async () => {
  await withPage({ root, url: pages.url("speed", "step=before") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "speed", steps: ["before", "agent"], id: "after" });
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "estimate", steps: ["one", "both"], id: "n2" });
  });
});
