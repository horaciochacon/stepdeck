// core/map-paint.js: the pixel loops of a raster picture, which run without a canvas. The fast loops must write the
// bytes the straightforward ones wrote.
import { test } from "node:test";
import assert from "node:assert/strict";
import { coverMask, rasterPixels } from "#engine/core/map-paint.js";

// A small deterministic generator, so the grid is the same on every run.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

/** The loop `rasterImage` had before: one `set` of a 4-byte view per pixel. */
function slowPixels(out, w, table, grid, lutData, stripe, landCells, mask, clip) {
  for (let p = 0; p < table.length; p++) {
    const cell = table[p];
    if (clip && cell >= 0 && !mask[p]) continue;
    if (cell >= 0 && grid.data[cell]) {
      out.set(lutData.subarray(grid.levels[cell] * 4, grid.levels[cell] * 4 + 4), p * 4);
    } else if (stripe && (cell >= 0 ? landCells?.[cell] : mask?.[p])) {
      stripe((p % w) + 0.5, Math.floor(p / w) + 0.5, out, p * 4);
    }
  }
}

test("rasterPixels: byte for byte what a set() per pixel wrote, with and without hatch, land and clip", () => {
  const next = rng(7);
  const [w, h, cells, levels] = [37, 23, 60, 9];
  const table = Int32Array.from({ length: w * h }, () => Math.floor(next() * (cells + 8)) - 8); // some pixels outside (-1 and below)
  const grid = {
    data: Uint8Array.from({ length: cells }, () => (next() < 0.7 ? 1 : 0)),
    levels: Uint8Array.from({ length: cells }, () => Math.floor(next() * levels)),
  };
  const lutData = Uint8ClampedArray.from({ length: levels * 4 }, () => Math.floor(next() * 256));
  const landCells = Uint8Array.from({ length: cells }, () => (next() < 0.5 ? 1 : 0));
  const mask = Uint8Array.from({ length: w * h }, () => (next() < 0.6 ? 1 : 0));
  const stripe = (x, y, out, at) => {
    out[at] = (x * 3) % 256;
    out[at + 1] = (y * 5) % 256;
    out[at + 2] = 17.6; // a fraction, clamped and rounded by the array as the hatch's blend is
    out[at + 3] = 255;
  };
  let painted = 0;
  for (const [s, land, m, clip] of [
    [null, null, null, false], [stripe, landCells, mask, false], [stripe, landCells, mask, true],
    [stripe, null, mask, false], [stripe, landCells, null, false], [null, null, mask, true],
  ]) {
    const [fast, slow] = [new Uint8ClampedArray(w * h * 4), new Uint8ClampedArray(w * h * 4)];
    rasterPixels(fast, w, table, grid, lutData, s, land, m, clip);
    slowPixels(slow, w, table, grid, lutData, s, land, m, clip);
    assert.deepEqual(fast, slow);
    painted += fast.reduce((n, v) => n + (v ? 1 : 0), 0);
  }
  assert.ok(painted > 1000, "the cases paint something");
});

test("coverMask: 1 where the alpha is at least 250, as Uint8Array.from gave it", () => {
  const next = rng(11);
  const n = 500;
  const rgba = Uint8ClampedArray.from({ length: n * 4 }, (_, i) => (i % 4 === 3 ? [0, 249, 250, 251, 255][Math.floor(next() * 5)] : Math.floor(next() * 256)));
  const mask = coverMask(rgba, n);
  assert.ok(mask instanceof Uint8Array);
  assert.deepEqual(mask, Uint8Array.from({ length: n }, (_, p) => (rgba[p * 4 + 3] >= 250 ? 1 : 0)));
  assert.ok(mask.includes(1) && mask.includes(0));
});
