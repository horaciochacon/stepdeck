// The browser commands as a whole run (cli/dump.js withDeck, cli/browser.js): the worker pool gives the same output
// with one page or several, a deck whose slide list is ahead of its files, failed requests in `dump` and in
// ctx.failed, the figure's inner size in `check --played`, and the names `shoot` writes.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/cli-pool.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { check, runCheck } from "../../cli/check.js";
import { dump, withDeck } from "../../cli/dump.js";
import { shoot } from "../../cli/shoot.js";
import { formatProblem } from "../../cli/problems.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const at = (path) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const spike = at("examples/spike/");
const unwritten = at("test/fixtures/decks/unwritten-slides/");
const inner = at("test/fixtures/decks/played-mismatch-inner/");
const show = (problems) => problems.map(formatProblem).join("\n") || "(no problems)";

/** Runs fn with STEPDECK_WORKERS set to `n` (undefined: unset), then puts the variable back. */
async function withWorkers(n, fn) {
  const before = process.env.STEPDECK_WORKERS;
  if (n === undefined) delete process.env.STEPDECK_WORKERS;
  else process.env.STEPDECK_WORKERS = String(n);
  try {
    return await fn();
  } finally {
    if (before === undefined) delete process.env.STEPDECK_WORKERS;
    else process.env.STEPDECK_WORKERS = before;
  }
}

test("worker pool: each() runs on up to `workers` pages and returns the results in job order", async () => {
  await withWorkers(3, () =>
    withDeck(spike, {}, async (session) => {
      assert.equal(session.workers, 3);
      const jobs = session.slides.flatMap((id) => session.steps[id].map((_, k) => ({ id, k })));
      const pages = new Set();
      const seen = await session.each(jobs, async (page, { id, k }, index) => {
        pages.add(page.page);
        await page.open(id, k, { capture: true });
        const m = await page.measure();
        return { index, slide: m.slide, step: m.step, visible: await page.visibility() };
      });
      assert.equal(pages.size, 3, "three pages of the one browser");
      assert.deepEqual(seen.map((r) => [r.index, r.slide, r.step]), jobs.map(({ id, k }, index) => [index, id, k]));
      assert.deepEqual([...new Set(seen.map((r) => r.visible))], ["visible"], "every page is visible, so each one animates");
      // Fewer jobs than workers: no more pages than jobs. The earliest failed job is the one thrown.
      assert.deepEqual(await session.each([1], async (_, job) => job * 2), [2]);
      await assert.rejects(session.each([0, 1, 2, 3, 4, 5], async (_, job) => {
        if (job === 1 || job === 2) throw new Error(`job ${job}`);
        return job;
      }), /^Error: job 1$/);
    }),
  );
});

test("worker pool: dump and check --played say the same with one page and with three", async () => {
  const run = (workers) => withWorkers(workers, async () => ({ dump: await dump(spike), check: await runCheck(spike, { played: true }) }));
  const one = await run(1);
  const three = await run(3);
  assert.deepEqual(three.dump, one.dump);
  assert.deepEqual(three.check, one.check);
  assert.equal(one.dump.length, one.check.steps);
  // A problem list is merged in deck order too: the unwritten slides, each named once, in the order of deck.js.
  const lists = [await withWorkers(1, () => check(unwritten)), await withWorkers(3, () => check(unwritten))];
  assert.deepEqual(lists[1], lists[0]);
});

test("a slide listed in deck.js and not written yet does not fail the slides that are", async () => {
  // The runtime imports every listed slide at boot, so each page load asks for slides/later.js and slides/last.js.
  const first = await runCheck(unwritten, { slide: "first", played: true });
  assert.deepEqual(first.problems, [], show(first.problems));
  assert.equal(first.steps, 2);
  for (const step of await dump(unwritten, { slide: "first" })) assert.deepEqual(step.errors, [], `dump at step ${step.stepId}`);
  // The whole deck: one line per missing slide, at that slide, saying which file is missing.
  const all = await check(unwritten);
  assert.deepEqual(all.map((p) => [p.slide, p.step, p.rule, p.measured]), [
    ["later", "0", "render-error", "later: cannot load slide: slides/later.js not found (create it, or remove 'later' from slides in deck.js)"],
    ["last", "0", "render-error", "last: cannot load slide: slides/last.js not found (create it, or remove 'last' from slides in deck.js)"],
  ], show(all));
  const cli = spawnSync(process.execPath, ["cli/index.js", "check", "test/fixtures/decks/unwritten-slides", "--slide", "first", "--played"], { cwd: repo, encoding: "utf8", env: process.env });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  assert.equal(cli.stdout, "check: 1 slide, 2 steps, 2 played arrivals compared, 0 problems\n");
});

test("a request answered with an HTTP error is one failed line, not two", async () => {
  // A module that is a 404 is also aborted by Chrome (net::ERR_ABORTED): the status line is the one kept.
  await withPage({ root: repo, url: "engine/core/render.html?deck=../../test/fixtures/decks/unwritten-slides/&slide=first&capture" }, async (page, ctx) => {
    assert.deepEqual(ctx.failed.filter((line) => line.includes("slides/later.js")), ["404 /test/fixtures/decks/unwritten-slides/slides/later.js"]);
    assert.deepEqual(ctx.failed.filter((line) => line.startsWith("failed ")), []);
  });
});

test("dump lists a failed request with its URL, in place of Chrome's console line", async () => {
  const [step] = await dump(at("test/fixtures/check/network-error/"));
  assert.equal(step.errors.filter((line) => /^network: 404 \/test\/fixtures\/check\/network-error\/.*missing\.png$/.test(line)).length, 1, step.errors.join("\n"));
  assert.deepEqual(step.errors.filter((line) => line.includes("Failed to load resource")), []);
  const [remote] = await dump(at("test/fixtures/check/remote-fetch/"));
  assert.ok(remote.errors.some((line) => line.startsWith("network: remote https://stepdeck-remote.invalid/data.json (blocked")), remote.errors.join("\n"));
  const cli = spawnSync(process.execPath, ["cli/index.js", "dump", "test/fixtures/check/network-error"], { cwd: repo, encoding: "utf8", env: process.env });
  assert.equal(cli.status, 1);
  assert.match(cli.stdout, /^  error: network: 404 \/test\/fixtures\/check\/network-error\/.*missing\.png$/m);
});

test("check --played compares the size of the figure inside the box; dump does not list it", async () => {
  const problems = await check(inner, { played: true });
  assert.deepEqual(problems.map((p) => [p.rule, p.element, p.step]), [["played-mismatch", "fig", "wide"]], show(problems));
  assert.equal(problems[0].measured, "inner <svg> 300×200 arriving from 'narrow' (animated)");
  assert.equal(problems[0].limit, "<svg> 600×200 when jumped to");
  for (const step of await dump(inner)) for (const e of step.elements) assert.ok(!("inner" in e), `${e.id} at ${step.stepId}`);
  // One arrival is one arrival.
  const cli = spawnSync(process.execPath, ["cli/index.js", "check", "test/fixtures/decks/played-mismatch-inner", "--slide", "figure", "--step", "narrow", "--played"], { cwd: repo, encoding: "utf8", env: process.env });
  assert.equal(cli.stdout, "check: 1 slide, 1 step, 1 played arrival compared, 0 problems\n", cli.stderr);
});

test("shoot: a step id with / or .. is written inside shots/<size>/, under a safe name", async () => {
  const deck = at("test/fixtures/validate/step-id-chars/");
  const dir = join(deck, "shots", "960");
  try {
    const paths = await shoot(deck);
    assert.deepEqual(paths, ["s-00-ok-1.png", "s-01-x_.._.._escaped.png", "s-02-two_words.png", "s-03-Also_ok.png"].map((name) => join(dir, name)));
    for (const path of paths) {
      assert.equal(dirname(path), dir);
      assert.deepEqual([...readFileSync(path).subarray(1, 4)].map((c) => String.fromCharCode(c)).join(""), "PNG");
    }
    // The same files with one page as with several.
    const bytes = paths.map((path) => readFileSync(path));
    assert.deepEqual(await withWorkers(1, () => shoot(deck)), paths);
    paths.forEach((path, i) => assert.ok(readFileSync(path).equals(bytes[i]), `${path} is the same PNG`));
  } finally {
    rmSync(join(deck, "shots"), { recursive: true, force: true });
  }
});
