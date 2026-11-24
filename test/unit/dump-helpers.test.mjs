// The pure helpers of cli/dump.js that `dump`, `check` and `shoot` share: resolveStep (a --step value against a
// slide's step ids), changedIds (what a step changed) and jsonEqual. No browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertStepScope, changedIds, jsonEqual, resolveStep } from "../../cli/dump.js";

test("resolveStep: digits are an index, anything else an id; no step is null", () => {
  assert.equal(resolveStep(["a", "b"], "1", "s"), 1);
  assert.equal(resolveStep(["a", "b"], 0, "s"), 0);
  assert.equal(resolveStep(["a", "b"], "b", "s"), 1);
  assert.equal(resolveStep(["a", "b"], undefined, "s"), null);
  assert.equal(resolveStep(["a", "b"], null, "s"), null);
});

test("resolveStep: an index past the end and an unknown id throw, naming the slide and its steps", () => {
  assert.throws(() => resolveStep(["a", "b"], "9", "s"), { message: "unknown step '9' in slide 's' (steps: a, b)" });
  assert.throws(() => resolveStep(["a", "b"], "zz", "s"), { message: "unknown step 'zz' in slide 's' (steps: a, b)" });
  assert.throws(() => resolveStep(["a", "b"], "2", "s"), /unknown step '2'/);
});

test("assertStepScope: a step needs its slide", () => {
  assert.throws(() => assertStepScope({ step: "a" }), { message: "--step needs --slide" });
  assert.doesNotThrow(() => assertStepScope({ slide: "s", step: "a" }));
  assert.doesNotThrow(() => assertStepScope({}));
});

const el = (id, props = {}, visible = true) => ({ id, props, visible });

test("changedIds: with no previous measurement every element changed", () => {
  assert.deepEqual(changedIds(null, { elements: [el("a"), el("b")] }), ["a", "b"]);
});

test("changedIds: a props change, a visibility change and a new element, in the order of the new measurement", () => {
  const prev = { elements: [el("same", { n: 1 }), el("props", { n: 1 }), el("shown", {}, false)] };
  const next = { elements: [el("same", { n: 1 }), el("new"), el("props", { n: 2 }), el("shown", {}, true)] };
  assert.deepEqual(changedIds(prev, next), ["new", "props", "shown"]);
  assert.deepEqual(changedIds(prev, prev), []);
});

test("changedIds: props in another key order are not a change", () => {
  const prev = { elements: [el("a", { x: 1, y: { p: [1, 2], q: null } })] };
  const next = { elements: [el("a", { y: { q: null, p: [1, 2] }, x: 1 })] };
  assert.deepEqual(changedIds(prev, next), []);
});

test("jsonEqual ignores key order, at every depth", () => {
  assert.ok(jsonEqual({ a: 1, b: { c: 2, d: [1, { e: 3, f: 4 }] } }, { b: { d: [1, { f: 4, e: 3 }], c: 2 }, a: 1 }));
  assert.ok(jsonEqual(null, null));
  assert.ok(jsonEqual("x", "x"));
  assert.ok(jsonEqual([], []));
});

test("jsonEqual tells values, array order, missing keys and types apart", () => {
  assert.equal(jsonEqual({ a: 1 }, { a: 2 }), false);
  assert.equal(jsonEqual([1, 2], [2, 1]), false);
  assert.equal(jsonEqual([1, 2], [1, 2, 3]), false);
  assert.equal(jsonEqual({ a: 1 }, { a: 1, b: undefined }), false);
  assert.equal(jsonEqual({ a: undefined }, { b: undefined }), false);
  assert.equal(jsonEqual({}, []), false);
  assert.equal(jsonEqual({}, null), false);
  assert.equal(jsonEqual(1, "1"), false);
});
