// engine/vendor/marked/marked.esm.js is a copy of the npm package's lib/marked.esm.js. Nothing imports the npm copy:
// the `marked` devDependency is there so that a version bump fails this test until the vendored file is refreshed
// (and THIRD_PARTY_NOTICES.md and docs/contributing/conventions.md with it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const vendored = fileURLToPath(new URL("../../engine/vendor/marked/marked.esm.js", import.meta.url));
const installed = fileURLToPath(new URL("../../node_modules/marked/lib/marked.esm.js", import.meta.url));
const pkg = fileURLToPath(new URL("../../node_modules/marked/package.json", import.meta.url));
const missing = !existsSync(installed) && "node_modules/marked is not installed (run `npm install`)";

test("the vendored marked is the installed marked, byte for byte", { skip: missing }, () => {
  const { version } = JSON.parse(readFileSync(pkg, "utf8"));
  assert.ok(
    readFileSync(vendored).equals(readFileSync(installed)),
    `engine/vendor/marked/marked.esm.js differs from node_modules/marked/lib/marked.esm.js (marked ${version}): ` +
      "copy the installed file over the vendored one and update the version in THIRD_PARTY_NOTICES.md",
  );
});
