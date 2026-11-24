// core/kit.js motion(info, ctx?): the legacy shape without a ctx, the theme's timing with one; motionMs; langKey.
import { test } from "node:test";
import assert from "node:assert/strict";
import { langKey, motion, motionMs } from "#engine/core/kit.js";
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

test("motionMs reads --sd-duration as ctx.motion.timing does: ms, a bare number or seconds", () => {
  const ms = (token, info = {}, factor) => {
    const tokens = token === undefined ? {} : { "--sd-duration": token };
    return motionMs(info, { tokens, motion: makeMotion(tokens) }, factor);
  };
  assert.equal(ms("400ms"), 400);
  assert.equal(ms("500ms", {}, 2), 1000);
  assert.equal(ms("400"), 400);
  assert.equal(ms("0.4s"), 400, "seconds are not read as 0.4 ms");
  assert.equal(ms(".5s", {}, 2), 1000);
  assert.equal(ms("1s"), 1000);
  assert.equal(ms(undefined), 400, "no token: 400 ms");
  assert.equal(ms("soon", {}, 2), 800, "a token that is not a duration: 400 ms");
  assert.equal(ms("0.4s", { transition: { duration: 90 } }, 2), 90, "the step's transition wins, as it is");
  assert.equal(ms("400ms", { transition: { duration: 0 } }), 0);
});

test("motionMs without ctx.motion is the transition's duration, else factor x 400", () => {
  assert.equal(motionMs({}, {}), 400);
  assert.equal(motionMs({}, undefined, 2), 800);
  assert.equal(motionMs({ transition: { duration: 120 } }, {}, 2), 120);
});

test("langKey: the exact tag, then its primary subtag, then en", () => {
  const table = { en: 1, es: 2, "pt-BR": 3 };
  assert.equal(langKey(table, "es"), "es");
  assert.equal(langKey(table, "es-PE"), "es");
  assert.equal(langKey(table, "es-419"), "es");
  assert.equal(langKey(table, "pt-BR"), "pt-BR");
  assert.equal(langKey(table, "pt"), "en");
  assert.equal(langKey(table, "fr-CA"), "en");
  assert.equal(langKey(table, undefined), "en");
  assert.equal(langKey(table, "constructor"), "en", "own keys only");
});
