// examples/kit validates clean. The landing page embeds this deck, and the deploy waits only for the unit job, so
// the check is here as well as in test/browser/kit.test.mjs (which adds `check` and `check --played`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { validate } from "../../cli/validate.js";
import { formatProblem } from "../../cli/problems.js";

const kit = fileURLToPath(new URL("../../examples/kit/", import.meta.url));

test("the kit deck validates clean: no errors and no warnings", async () => {
  const problems = await validate(kit);
  assert.deepEqual(problems.map(formatProblem), []);
});
