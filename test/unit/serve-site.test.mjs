// `npm run site` (cli/serve-site.js): a bad or busy port is one line and exit code 2, and no temporary
// folder is left behind.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "../../cli/serve.js";

const script = fileURLToPath(new URL("../../cli/serve-site.js", import.meta.url));
// The child makes its temporary folder under TMPDIR, so an empty one shows that nothing was left.
const run = (port, tmp) => spawnSync(process.execPath, [script, port], { encoding: "utf8", env: { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp } });

test("serve-site: a port that is not a number is refused in one line", () => {
  const tmp = mkdtempSync(join(tmpdir(), "stepdeck-test-"));
  try {
    for (const bad of ["abc", "70000", "-1", "80.5"]) {
      const res = run(bad, tmp);
      assert.equal(res.status, 2, bad);
      assert.equal(res.stderr, `stepdeck: '${bad}' is not a port (use a number from 0 to 65535, as in \`npm run site -- 8001\`)\n`);
      assert.equal(res.stdout, "");
    }
    assert.deepEqual(readdirSync(tmp), []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("serve-site: a busy port is one line with the next port to try, and no temporary folder is left", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "stepdeck-test-"));
  const busy = await serve({ root: tmp, port: 0 });
  try {
    const res = run(String(busy.port), tmp);
    assert.equal(res.status, 2);
    assert.equal(res.stderr, `stepdeck: port ${busy.port} is in use; try \`npm run site -- ${busy.port + 1}\`\n`);
    assert.deepEqual(readdirSync(tmp), []);
  } finally {
    await busy.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("serve-site: port 0 serves the site under /stepdeck/ and SIGTERM removes the temporary folder", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "stepdeck-test-"));
  const child = spawn(process.execPath, [script, "0"], { env: { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp }, stdio: ["ignore", "pipe", "inherit"] });
  try {
    const line = await new Promise((ok, fail) => {
      child.stdout.once("data", (d) => ok(String(d)));
      child.once("exit", (code) => fail(new Error(`exited with ${code} before printing a URL`)));
    });
    const url = /^stepdeck site: (http:\/\/127\.0\.0\.1:\d+\/stepdeck\/)\n$/.exec(line)?.[1];
    assert.ok(url, line);
    const res = await fetch(url);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<title>stepdeck<\/title>/);
    assert.equal(readdirSync(tmp).length, 1);
    const exited = new Promise((ok) => child.once("exit", ok));
    child.kill("SIGTERM");
    assert.equal(await exited, 0);
    assert.deepEqual(readdirSync(tmp), []);
  } finally {
    child.kill("SIGKILL");
    rmSync(tmp, { recursive: true, force: true });
  }
});
