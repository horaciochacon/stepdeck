// The first commands must work before `npm install` (I5): only the commands that need Ajv load it,
// and they fail with exit 2 and the fix instead of a module-not-found crash.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const hook = fileURLToPath(new URL("helpers/no-ajv.mjs", import.meta.url));
const noAjv = (...args) =>
  spawnSync(process.execPath, ["--import", hook, join(repo, "cli/index.js"), ...args], { cwd: repo, encoding: "utf8", env: process.env });

test("the hook really hides ajv", () => {
  const r = spawnSync(process.execPath, ["--import", hook, "--input-type=module", "-e", "await import('ajv')"], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /ERR_MODULE_NOT_FOUND|Cannot find package 'ajv'/);
});

test("--help works without Ajv", () => {
  const r = noAjv("--help");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^usage: stepdeck/);
});

test("new works without Ajv", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "stepdeck-no-ajv-")));
  try {
    const r = noAjv("new", join(root, "deck"));
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(join(root, "deck", "deck.js")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validate without Ajv exits 2 and says to run npm install in the engine folder", () => {
  const r = noAjv("validate", "examples/spike");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /run `npm install` in .+ first/);
  assert.ok(r.stderr.includes(repo.replace(/\/$/, "")), r.stderr);
  const json = noAjv("validate", "examples/spike", "--json");
  assert.equal(json.status, 2);
  assert.match(JSON.parse(json.stdout).error, /npm install/);
});
