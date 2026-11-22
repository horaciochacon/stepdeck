// signature (core/canvas.js), the FNV-1a hasher behind paintLines' signature, which needs no canvas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { signature, canvasLayer } from "#engine/core/canvas.js";
import * as marks from "#engine/core/chart-marks.js";

/** The hash of `s` as the fixed FNV-1a text hash, written out here independently of the module. */
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}

test("signature: deterministic, order-sensitive", () => {
  const build = (steps) => {
    const s = signature();
    for (const [kind, v] of steps) s[kind](v);
    return s.hex();
  };
  const steps = [["text", "red|2|"], ["tenth", 12.34], ["char", 44], ["tenth", -5], ["char", 10]];
  assert.equal(build(steps), build(steps), "the same feeds give the same hash");
  assert.match(build(steps), /^[0-9a-f]{8}$/);
  assert.notEqual(build(steps), build([...steps].reverse()), "the order matters");
  assert.equal(signature().hex(), "811c9dc5", "nothing fed is the offset basis");
  assert.equal(build([["text", "abc"]]), fnv("abc"), "text is FNV-1a over UTF-16 units");
  assert.equal(build([["text", "é☃😀"]]), fnv("é☃😀"), "including non-ASCII");
  assert.equal(build([["char", 97], ["char", 98], ["char", 99]]), fnv("abc"), "char is one unit");
  const s = signature();
  s.text("a");
  const once = s.hex();
  assert.equal(s.hex(), once, "hex does not reset");
  s.text("b");
  assert.equal(s.hex(), fnv("ab"), "and feeding goes on from where it was");
});

test("signature: tenth rounds like String(Math.round(v*10)/10)", () => {
  for (const v of [-0, 0, 0.05, 1e16, -3.25, 12.34, -0.04, 7, 99.95, 123456789.1, NaN, Infinity, -1e300]) {
    const s = signature();
    s.tenth(v);
    assert.equal(s.hex(), fnv(String(Math.round(v * 10) / 10)), `tenth(${v})`);
  }
});

test("canvas.js and chart-marks.js export the same canvasLayer", () => {
  assert.equal(marks.canvasLayer, canvasLayer);
});
