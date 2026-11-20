// core/kit.js motion(info, ctx?): the legacy shape without a ctx, the theme's timing with one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { motion } from "#engine/core/kit.js";
import { makeMotion } from "#engine/core/motion.js";

const signal = new AbortController().signal;

test("motion without a ctx is { signal, duration } from the transition, as before", () => {
  assert.deepEqual(motion({ signal, transition: { duration: 123 } }), { signal, duration: 123 });
  assert.deepEqual(motion({ signal }), { signal, duration: undefined });
});

test("motion with a ctx is the theme's timing for the step", () => {
  const ctx = { motion: makeMotion({ "--sd-duration": "500ms", "--sd-duration-fast": "150ms", "--sd-stagger": "70ms" }) };
  const t = motion({ signal }, ctx);
  assert.equal(t.duration, 500);
  assert.equal(t.stagger, 70);
  assert.equal(t.signal, signal);
  assert.equal(typeof t.ease, "function");
  assert.equal(motion({ signal }, ctx, { fast: true }).duration, 150);
  assert.equal(motion({ signal, transition: { duration: 90 } }, ctx).duration, 90, "the step's transition wins");
});
