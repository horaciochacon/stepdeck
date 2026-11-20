// The gallery deck (site/gallery): every built-in layout and component as a slide, checked in a browser
// with --played under both shipped themes. test/unit/gallery.test.mjs covers its coverage and validate.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { REPO } from "../../cli/engine.js";
import { check } from "../../cli/check.js";
import { formatProblem } from "../../cli/problems.js";

const gallery = join(REPO, "site", "gallery");

for (const theme of ["modern", "academic-light"]) {
  test(`gallery deck checks clean with --played under ${theme}`, async () => {
    const problems = await check(gallery, { played: true, theme });
    assert.deepEqual(problems.map(formatProblem), []);
  });
}
