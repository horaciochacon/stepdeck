// parseHash and formatHash (engine/core/shells/reveal.js): the `#/<slide>/<step>` address of the reveal shell.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHash, formatHash } from "#engine/core/shells/reveal.js";

test("parseHash: #/<slide>/<step>, digits as an index and anything else as a step id", () => {
  assert.deepEqual(parseHash("#/intro/2"), { slide: "intro", step: 2 });
  assert.deepEqual(parseHash("#/intro/focus"), { slide: "intro", step: "focus" });
  assert.deepEqual(parseHash("#/intro/2/"), { slide: "intro", step: 2 });
});

test("parseHash: no step is step 0", () => {
  assert.deepEqual(parseHash("#/intro"), { slide: "intro", step: 0 });
  assert.deepEqual(parseHash("#/intro/"), { slide: "intro", step: 0 });
});

test("parseHash decodes percent escapes in the slide and the step", () => {
  assert.deepEqual(parseHash("#/a%20b/c%2Fd"), { slide: "a b", step: "c/d" });
  assert.deepEqual(parseHash("#/caf%C3%A9/1"), { slide: "café", step: 1 });
});

test("parseHash: an escape that does not decode is an error that quotes the hash", () => {
  assert.deepEqual(parseHash("#/%E0%A4%A/1"), { error: "cannot decode '#/%E0%A4%A/1'" });
  assert.deepEqual(parseHash("#/intro/%"), { error: "cannot decode '#/intro/%'" });
});

test("parseHash: not an engine hash is null", () => {
  for (const hash of ["", "#", "#/", "#foo", "#/a/b/c", "/intro/2", undefined, null]) {
    assert.equal(parseHash(hash), null, String(hash));
  }
});

test("formatHash escapes both parts, and parseHash reads it back", () => {
  assert.equal(formatHash("intro", "focus"), "#/intro/focus");
  assert.equal(formatHash("a b", "c/d"), "#/a%20b/c%2Fd");
  for (const [slide, step] of [["intro", "focus"], ["a b", "c/d"], ["café", "paso dos"], ["50%", "a#b?c"]]) {
    assert.deepEqual(parseHash(formatHash(slide, step)), { slide, step }, `${slide}/${step}`);
  }
});
