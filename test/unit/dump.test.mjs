import { test } from "node:test";
import assert from "node:assert/strict";
import { GOTO_TIMEOUT_MS } from "../../cli/dump.js";

test("GOTO_TIMEOUT_MS is the page timeout plus the longest run", () => {
  assert.equal(GOTO_TIMEOUT_MS, 50_000);
});
