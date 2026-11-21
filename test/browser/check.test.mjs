// `stepdeck check` layout rules and `stepdeck shoot` (spec §10): measured in the bare shell, in
// capture mode, after fonts and settled(). Every fixture under test/fixtures/check/<rule>/ is a
// minimal deck that must produce exactly its rule; the spike deck must check clean.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { relative } from "node:path";
import { check } from "../../cli/check.js";
import { shoot } from "../../cli/shoot.js";
import { formatProblem } from "../../cli/problems.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const spike = fileURLToPath(new URL("../../examples/spike/", import.meta.url));
const fixture = (rule) => fileURLToPath(new URL(`../fixtures/check/${rule}/`, import.meta.url));
const cli = (...args) => spawnSync(process.execPath, ["cli/index.js", ...args], { cwd: repo, encoding: "utf8", env: process.env });
const show = (problems) => problems.map(formatProblem).join("\n") || "(no problems)";

// rule -> where the one problem must point (element null: slide or step level).
const cases = {
  "text-outside-canvas": { element: "edge", step: "0" },
  "text-outside-region": { element: "wide", step: "0" },
  "text-overlap": { element: "b", step: "0" },
  "font-too-small": { element: "small", step: "0" },
  contrast: { element: "pale", step: "0" },
  "console-error": { element: null, step: "0" },
  "network-error": { element: null, step: "0" },
  "remote-style": { element: null, step: "0", rule: "network-error" },
  "remote-fetch": { element: null, step: "0", rule: "network-error" },
  "render-error": { element: null, step: "0" },
  "step0-shows-all": { element: null, step: "first" },
};

for (const [name, where] of Object.entries(cases)) {
  const rule = where.rule ?? name;
  test(`check: fixture ${name} produces exactly ${rule}`, async () => {
    const problems = await check(fixture(name));
    assert.deepEqual([...new Set(problems.map((p) => p.rule))], [rule], show(problems));
    assert.equal(problems.length, 1, show(problems));
    const [p] = problems;
    assert.equal(p.slide, "s");
    assert.equal(p.element, where.element);
    assert.equal(p.step, where.step);
    assert.ok(p.measured && p.limit && p.fix, show(problems));
  });
}

test("check: measured values name the numbers", async () => {
  const [small] = await check(fixture("font-too-small"));
  assert.match(small.measured, /20px/);
  assert.match(small.limit, /28px/);
  const [pale] = await check(fixture("contrast"));
  assert.match(pale.measured, /^1\.\d+:1/);
  assert.match(pale.limit, /4\.5:1/);
  const [net] = await check(fixture("network-error"));
  assert.match(net.measured, /404.*missing\.png/);
});

test("check: a remote request is blocked and named as remote (spec §3: no remote requests)", async () => {
  const [bg] = await check(fixture("remote-style"));
  assert.match(bg.measured, /^remote https:\/\/stepdeck-remote\.invalid\/bg\.png \(blocked/);
  const [fetched] = await check(fixture("remote-fetch"));
  assert.match(fetched.measured, /^remote https:\/\/stepdeck-remote\.invalid\/data\.json \(blocked/);
});

test("spike deck checks clean at 1920", async () => {
  const problems = await check(spike);
  assert.deepEqual(problems, [], show(problems));
});

test("spike deck checks clean with --played (one run, both passes)", async () => {
  const problems = await check(spike, { played: true });
  assert.deepEqual(problems, [], show(problems));
});

test("check --played keeps the played-mismatch fixture to its one problem", async () => {
  const problems = await check(fileURLToPath(new URL("../fixtures/decks/played-mismatch/", import.meta.url)), { played: true });
  assert.deepEqual(problems.map((p) => p.rule), ["played-mismatch"], show(problems));
});

test("cli: check runs the layout rules; exit 0 clean, 1 problems, 2 run failure with --json error", () => {
  const ok = cli("check", "examples/spike", "--slide", "hello");
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /^check: 1 slide, 2 steps, 0 problems$/m);
  const bad = cli("check", "test/fixtures/check/contrast");
  assert.equal(bad.status, 1, bad.stdout + bad.stderr);
  assert.match(bad.stdout, /^s\/pale\/0 · contrast · 1\.\d+:1 #bbbbbb on #ffffff .* vs 4\.5:1 · /m);
  const json = cli("check", "test/fixtures/check/contrast", "--json");
  assert.equal(json.status, 1);
  assert.equal(JSON.parse(json.stdout)[0].rule, "contrast");
  const failed = cli("check", "test/fixtures/check/contrast", "--slide", "nope", "--json");
  assert.equal(failed.status, 2, failed.stdout + failed.stderr);
  assert.match(JSON.parse(failed.stdout).error, /unknown slide 'nope'/);
});

const pngSize = (file) => {
  const b = readFileSync(file);
  assert.equal(b.toString("latin1", 1, 4), "PNG");
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
};

test("shoot: one PNG per step at <deck>/shots/<size>/<slide>-<nn>-<stepId>.png", async () => {
  const out = fileURLToPath(new URL("shots/960/", `file://${spike}`));
  rmSync(out, { recursive: true, force: true });
  const paths = await shoot(spike, { size: 960 });
  const names = paths.map((p) => relative(out, p));
  assert.equal(names.length, 18);
  assert.deepEqual(names.slice(0, 4), ["cover-00-0.png", "hello-00-one.png", "hello-01-two.png", "trend-00-base.png"]);
  assert.ok(names.includes("terminal-05-done.png"));
  for (const p of paths) {
    assert.ok(existsSync(p), p);
    assert.deepEqual(pngSize(p), { width: 960, height: 540 }, p);
  }
  // shots/ never gets committed.
  const ignored = spawnSync("git", ["check-ignore", "-q", paths[0]], { cwd: repo });
  assert.equal(ignored.status, 0, "shots/ must be git-ignored");
});

test("cli: shoot --slide --size 1280, and only 1920|1280|960", () => {
  const ok = cli("shoot", "examples/spike", "--slide", "hello", "--size", "1280", "--json");
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const paths = JSON.parse(ok.stdout);
  assert.equal(paths.length, 2);
  assert.match(paths[1], /shots\/1280\/hello-01-two\.png$/);
  assert.deepEqual(pngSize(paths[1]), { width: 1280, height: 720 });
  const bad = cli("shoot", "examples/spike", "--size", "1000");
  assert.equal(bad.status, 2, bad.stdout + bad.stderr);
  assert.match(bad.stderr, /1920\|1280\|960/);
});

test("check --step: only that step, and with --played only its two arrivals", async () => {
  const { runCheck } = await import("../../cli/check.js");
  const one = await runCheck(spike, { slide: "trend", step: "focus", played: true });
  assert.deepEqual(one.problems, [], show(one.problems));
  assert.equal(one.steps, 1);
  assert.deepEqual(one.played.trend, { jumped: 1, fromPrev: 1, fromNext: 1 });
  // The first and last steps have one neighbour each.
  const first = await runCheck(spike, { slide: "trend", step: 0, played: true });
  assert.deepEqual(first.played.trend, { jumped: 1, fromPrev: 0, fromNext: 1 });
  // A step-scoped played run still catches a non-idempotent component at that step.
  const mismatch = await runCheck(fileURLToPath(new URL("../fixtures/decks/played-mismatch/", import.meta.url)), { slide: "log", step: "two", played: true });
  assert.deepEqual(mismatch.problems.map((p) => [p.rule, p.step]), [["played-mismatch", "two"]], show(mismatch.problems));
  // step0-shows-all needs both ends of a slide, so a --step run never reports it.
  const s0 = await runCheck(fixture("step0-shows-all"), { slide: "s", step: "first" });
  assert.deepEqual(s0.problems, [], show(s0.problems));
});

test("cli: --step on check and shoot; needs --slide; unknown step exits 2", () => {
  const ok = cli("check", "examples/spike", "--slide", "trend", "--step", "focus", "--played");
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /^check: 1 slide, 1 step, 2 played arrivals compared, 0 problems$/m);
  const shot = cli("shoot", "examples/spike", "--slide", "trend", "--step", "annotate", "--json");
  assert.equal(shot.status, 0, shot.stdout + shot.stderr);
  const paths = JSON.parse(shot.stdout);
  assert.equal(paths.length, 1);
  assert.match(paths[0], /shots\/960\/trend-02-annotate\.png$/);
  const noSlide = cli("check", "examples/spike", "--step", "focus");
  assert.equal(noSlide.status, 2);
  assert.match(noSlide.stderr, /--step needs --slide/);
  const unknown = cli("shoot", "examples/spike", "--slide", "trend", "--step", "nope");
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /unknown step 'nope' in slide 'trend'/);
});
