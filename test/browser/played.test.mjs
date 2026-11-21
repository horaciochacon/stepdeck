// `stepdeck check --played` (spec §10): every step is reached three ways (a fresh jump, an animated
// arrival from the previous step, an arrival from the next step) and the dumps must be equal.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { checkPlayed, runPlayed } from "../../cli/check.js";
import { formatProblem } from "../../cli/problems.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const spike = fileURLToPath(new URL("../../examples/spike/", import.meta.url));
const fixture = fileURLToPath(new URL("../fixtures/decks/played-mismatch/", import.meta.url));
const canvasFixture = fileURLToPath(new URL("../fixtures/decks/played-mismatch-canvas/", import.meta.url));
const lineStory = fileURLToPath(new URL("../fixtures/decks/line-story/", import.meta.url));
const cli = (...args) => spawnSync(process.execPath, ["cli/index.js", ...args], { cwd: repo, encoding: "utf8", env: process.env });

test("played equals jumped on spike deck", async () => {
  const report = await runPlayed(spike);
  assert.deepEqual(report.problems, []);
  // Not vacuous: every step of every slide was compared along every path that exists.
  const steps = { cover: 1, hello: 2, trend: 5, terminal: 6, story: 4 };
  assert.deepEqual(Object.keys(report.slides), Object.keys(steps));
  for (const [slide, n] of Object.entries(steps)) {
    assert.equal(report.slides[slide].jumped, n, `${slide}: jumps`);
    assert.equal(report.slides[slide].fromPrev, n - 1, `${slide}: animated arrivals from k-1`);
    assert.equal(report.slides[slide].fromNext, n - 1, `${slide}: arrivals from k+1`);
  }
  assert.deepEqual(await checkPlayed(spike, { slide: "hello" }), []);
});

test("played catches a non-idempotent component", async () => {
  const problems = await checkPlayed(fixture);
  assert.equal(problems.length, 1, JSON.stringify(problems, null, 2));
  const [p] = problems;
  assert.equal(p.rule, "played-mismatch");
  assert.equal(p.slide, "log");
  assert.equal(p.element, "log");
  assert.equal(p.step, "one", "the first step whose arrival differs");
  assert.match(p.measured, /text/);
  assert.match(p.fix, /idempotent/);
  assert.match(formatProblem(p), /^log\/log\/one · played-mismatch · .+ vs .+ · .*idempotent/);
});

test("check --played catches a canvas that differs", async () => {
  const problems = await checkPlayed(canvasFixture);
  assert.equal(problems.length, 1, JSON.stringify(problems, null, 2));
  const [p] = problems;
  assert.equal(p.rule, "played-mismatch");
  assert.equal(p.element, "counter");
  assert.match(p.measured, /^canvas n [2-9] \(n=[2-9]\) arriving from /, "the attribute that differs, the arrival's value and its layer: more updates ran than for the jump");
  assert.equal(p.limit, "n 1 (n=1) when jumped to", "the jump's");
});

test("check --played is clean on line-story", async () => {
  assert.deepEqual(await checkPlayed(lineStory), []);
});

test("cli: check --played exits 0 on the spike and 1 with problems; --json prints problems", () => {
  const ok = cli("check", "examples/spike", "--played", "--slide", "hello");
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const bad = cli("check", "test/fixtures/decks/played-mismatch", "--played");
  assert.equal(bad.status, 1, bad.stdout + bad.stderr);
  assert.match(bad.stdout, /^log\/log\/one · played-mismatch · /m);
  const json = cli("check", "test/fixtures/decks/played-mismatch", "--played", "--json");
  assert.equal(json.status, 1);
  assert.equal(JSON.parse(json.stdout)[0].rule, "played-mismatch");
});
