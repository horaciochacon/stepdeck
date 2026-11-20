// The tracked tree is publishable: no machine-specific paths in the files that ship, and none of the local
// working folders tracked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, publicFiles } from "./helpers/tracked.mjs";

const BINARY = /\.(woff2?|png|webp|gif|jpe?g|ico|pdf)$/i;
const PRIVATE_PATH = /\/Users\/|\/Volumes\/|\/private\/tmp|\/home\/[a-z]/;

const files = publicFiles().filter((f) => !BINARY.test(f));

test("tracked text files contain no machine paths", () => {
  const hits = [];
  for (const f of files) {
    const buf = readFileSync(join(ROOT, f));
    if (buf.includes(0)) continue; // binary content
    buf.toString("utf8").split("\n").forEach((line, i) => {
      if (PRIVATE_PATH.test(line)) hits.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, [], `machine paths in: ${hits.join(", ")}`);
});

// docs/superpowers/ and .superpowers/ hold local plans, specs and agent scratch. They are git-ignored, but a
// forced `git add -f` would still commit them, and the next push would publish them.
test("the local working folders are never tracked", () => {
  const tracked = execFileSync("git", ["ls-files", "--", "docs/superpowers", ".superpowers"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  assert.deepEqual(tracked, [], `tracked, but never to be published: ${tracked.join(", ")}`);
});
