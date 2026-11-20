// The tracked tree is publishable: no machine-specific paths in the files that ship.
import { test } from "node:test";
import assert from "node:assert/strict";
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
