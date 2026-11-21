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

// A cite of the local design notes, plans or review rulings (never published) points a reader at nothing: a
// task, a "Review Focus" item, a ruling label such as (R6) or (I2). A bare `spec §N` is fine: it names a section
// of the public engine design in docs/design/, which has no §5.x or §10.x.
const PRIVATE_CITE = /default-theme spec|slide kit spec|slide kit 1, (spec|§|task)|Review Focus|\bTask \d+\b|§(5|10)\.\d|\[call\]|\((R|I)\d+\)|, I\d+\)/;
const SELF = "test/unit/publishable.test.mjs";

test("tracked text files cite no local design notes or plans", () => {
  const hits = [];
  for (const f of files) {
    if (f === SELF || f.startsWith("docs/design/")) continue;
    const buf = readFileSync(join(ROOT, f));
    if (buf.includes(0)) continue; // binary content
    buf.toString("utf8").split("\n").forEach((line, i) => {
      if (PRIVATE_CITE.test(line)) hits.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, [], `cites of unpublished notes in: ${hits.join(", ")}`);
});

// docs/superpowers/ and .superpowers/ hold local plans, specs and agent scratch. They are git-ignored, but a
// forced `git add -f` would still commit them, and the next push would publish them.
test("the local working folders are never tracked", () => {
  const tracked = execFileSync("git", ["ls-files", "--", "docs/superpowers", ".superpowers"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  assert.deepEqual(tracked, [], `tracked, but never to be published: ${tracked.join(", ")}`);
});
