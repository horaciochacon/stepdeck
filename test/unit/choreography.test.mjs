import { test } from "node:test";
import assert from "node:assert/strict";
import { motionParts, resolveEntrance, resolveExit, slotDelays } from "#engine/core/choreography.js";

const notOwned = { owns: false, themeEnter: "rise" };
const owned = { owns: true, themeEnter: "rise" };

test("resolveEntrance: an element that does not own its entrance moves its box with the theme's enter", () => {
  assert.deepEqual(resolveEntrance(undefined, notOwned), { box: "rise", own: null, delay: 0, duration: undefined });
  assert.deepEqual(resolveEntrance(undefined, { owns: false }), { box: "fade", own: null, delay: 0, duration: undefined }, "fallback fade");
  assert.deepEqual(resolveEntrance("pop", notOwned), { box: "pop", own: null, delay: 0, duration: undefined });
});

test("resolveEntrance: an owned element builds itself when enter is unset or draw", () => {
  assert.deepEqual(resolveEntrance(undefined, owned), { box: null, own: "draw", delay: 0, duration: undefined });
  assert.deepEqual(resolveEntrance("draw", owned), { box: null, own: "draw", delay: 0, duration: undefined });
});

test("resolveEntrance: an owned element with a box name moves its box and snaps its content", () => {
  for (const name of ["fade", "rise", "wipe", "pop"]) {
    assert.deepEqual(resolveEntrance(name, owned), { box: name, own: "none", delay: 0, duration: undefined }, name);
  }
});

test("resolveEntrance: none plays nothing", () => {
  assert.deepEqual(resolveEntrance("none", notOwned), { box: null, own: null, delay: 0, duration: undefined });
  assert.deepEqual(resolveEntrance("none", owned), { box: null, own: "none", delay: 0, duration: undefined });
  assert.deepEqual(resolveEntrance({ motion: "none" }, owned), { box: null, own: "none", delay: 0, duration: undefined });
});

test("resolveEntrance: the object form adds a delay and a duration", () => {
  assert.deepEqual(resolveEntrance({ motion: "rise", delay: 120, duration: 600 }, notOwned), { box: "rise", own: null, delay: 120, duration: 600 });
  assert.deepEqual(resolveEntrance({ motion: "draw", duration: 900 }, owned), { box: null, own: "draw", delay: 0, duration: 900 });
  assert.deepEqual(resolveEntrance({ motion: "wipe", delay: 50 }, owned), { box: "wipe", own: "none", delay: 50, duration: undefined });
});

test("resolveEntrance: a theme enter of none means no box motion", () => {
  assert.deepEqual(resolveEntrance(undefined, { owns: false, themeEnter: "none" }), { box: null, own: null, delay: 0, duration: undefined });
});

test("resolveExit: collapse and none snap; unset is fade; a name is kept", () => {
  assert.equal(resolveExit("rise", true), null, "collapse");
  assert.equal(resolveExit(undefined, true), null, "collapse, unset");
  assert.equal(resolveExit("none", false), null);
  assert.equal(resolveExit({ motion: "none" }, false), null);
  assert.equal(resolveExit(undefined, false), "fade");
  assert.equal(resolveExit("rise", false), "rise");
  assert.equal(resolveExit({ motion: "pop", duration: 300 }, false), "pop", "object form");
});

test("motionParts reads a name or the object form", () => {
  assert.deepEqual(motionParts(undefined), { name: undefined, delay: 0, duration: undefined });
  assert.deepEqual(motionParts("fade"), { name: "fade", delay: 0, duration: undefined });
  assert.deepEqual(motionParts({ motion: "rise", delay: 10, duration: 20 }), { name: "rise", delay: 10, duration: 20 });
});

test("slotDelays: the i-th entering id waits i × stagger plus its own delay", () => {
  assert.deepEqual(slotDelays(["a", "b", "c"], 80, { c: 100 }), { a: 0, b: 80, c: 260 });
  assert.deepEqual(slotDelays([], 80, {}), {});
  assert.deepEqual(slotDelays(["a", "b"], 0, {}), { a: 0, b: 0 });
});
