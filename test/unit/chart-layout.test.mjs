// core/chart-layout.js: the pure building blocks charts share (extents, order, splits, labels, draw order, swarm).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extentOf, rank, splitAt, spread, fit, wrapLabel, drawOrder, swarm } from "#engine/core/chart-layout.js";

// extentOf

test("extentOf: every column across rows, missing skipped", () => {
  const rows = [{ a: 3, b: "10", c: null }, { a: "", b: -2, c: "x" }, { a: NaN, b: Infinity, c: 4 }, { b: 7 }];
  assert.deepEqual(extentOf(rows, ["a", "b"]), [-2, 10]);
  assert.deepEqual(extentOf(rows, ["a", undefined, "c"]), [3, 4]);
});

test("extentOf: blank cells are missing, not zero", () => {
  assert.deepEqual(extentOf([{ a: " " }, { a: 5 }, { a: "\t\n" }], ["a"]), [5, 6]);
  assert.deepEqual(extentOf([{ a: "  " }, { a: 5 }, { a: 8 }], ["a"]), [5, 8]);
  assert.deepEqual(extentOf([{ a: " " }], ["a"]), [0, 1]);
});

test("extentOf: zero, single value and empty", () => {
  assert.deepEqual(extentOf([], ["a"]), [0, 1]);
  assert.deepEqual(extentOf([{ a: null }, { a: "" }], ["a"]), [0, 1]);
  assert.deepEqual(extentOf([{ a: 5 }], ["a"]), [5, 6]);
  assert.deepEqual(extentOf([{ a: 3 }, { a: 9 }], ["a"], { zero: true }), [0, 9]);
  assert.deepEqual(extentOf([{ a: -3 }, { a: -9 }], ["a"], { zero: true }), [-9, 0]);
  assert.deepEqual(extentOf([], ["a"], { zero: true }), [0, 1]);
});

// rank

const items = [
  { key: "a", value: 3, columns: { name: "pear", n: 2 } },
  { key: "b", value: 1, columns: { name: "apple", n: null } },
  { key: "c", value: 2, columns: { name: "Zed", n: 1 } },
  { key: "d", value: 5, columns: { name: "", n: 2 } },
];

test("rank: every sort form", () => {
  assert.deepEqual(rank(items), ["a", "b", "c", "d"]);
  assert.deepEqual(rank(items, "none"), ["a", "b", "c", "d"]);
  assert.deepEqual(rank(items, "value"), ["b", "c", "a", "d"]);
  assert.deepEqual(rank(items, "-value"), ["d", "a", "c", "b"]);
  assert.deepEqual(rank(items, { by: "n" }), ["c", "a", "d", "b"]);
  assert.deepEqual(rank(items, { by: "n", order: "asc" }), ["c", "a", "d", "b"]);
  assert.deepEqual(rank(items, { by: "n", order: "desc" }), ["a", "d", "c", "b"]);
  assert.deepEqual(rank(items, { by: "name" }), ["c", "b", "a", "d"]); // code point: "Z" < "a"; "" is missing
  assert.deepEqual(rank(items, ["c", "a"]), ["c", "a", "b", "d"]);
  assert.deepEqual(rank(items, ["d"]), ["d", "a", "b", "c"]);
});

test("rank: nulls last, ties stable", () => {
  const rows = [{ key: "a", value: 2 }, { key: "b", value: null }, { key: "c", value: 2 }, { key: "d", value: 1 }];
  assert.deepEqual(rank(rows, "value"), ["d", "a", "c", "b"]);
  assert.deepEqual(rank(rows, "-value"), ["a", "c", "d", "b"]);
});

test("rank: errors name the column or category", () => {
  assert.throws(() => rank(items, { by: "zzz" }), { message: "sort column 'zzz' not found (columns: name, n)" });
  assert.throws(() => rank(items, ["a", "nope"]), { message: "category 'nope' in `sort` not found (categories: a, b, c, d)" });
  const form = '`sort` must be "none", "value", "-value", { by, order } or a list of categories';
  for (const bad of ["up", 3, null, true, {}, { by: 4 }, { by: "n", order: "sideways" }]) assert.throws(() => rank(items, bad), { message: form });
});

// splitAt

test("splitAt boundaries", () => {
  const pts = [{ x: 0, y: 10 }, { x: 2, y: 20 }, { x: 4, y: 40 }];
  const exact = splitAt(pts, 2);
  assert.deepEqual(exact.observed, [pts[0], pts[1]]);
  assert.deepEqual(exact.forecast, [pts[1], pts[2]]);
  assert.equal(exact.observed[1], exact.forecast[0]);

  const mid = splitAt(pts, 3);
  assert.deepEqual(mid.observed, [pts[0], pts[1], { x: 3, y: 30, boundary: true }]);
  assert.deepEqual(mid.forecast, [{ x: 3, y: 30, boundary: true }, pts[2]]);
  assert.equal(mid.observed.at(-1), mid.forecast[0]);

  assert.deepEqual(splitAt(pts, -1), { observed: [], forecast: pts });
  assert.deepEqual(splitAt(pts, 9), { observed: pts, forecast: [] });
  assert.deepEqual(splitAt(pts, NaN), { observed: pts, forecast: [] });
  assert.deepEqual(splitAt(pts, 0).observed, [pts[0]]);
  assert.deepEqual(splitAt(pts, 4).forecast, [pts[2]]);
  assert.deepEqual(splitAt([], 1), { observed: [], forecast: [] });
});

test("splitAt: null fields stay null at the boundary", () => {
  const pts = [{ x: 0, y: 10, lo: null, hi: 5, tag: "a" }, { x: 10, y: 30, lo: 2, hi: 15, tag: "b" }];
  const { observed } = splitAt(pts, 5);
  assert.deepEqual(observed.at(-1), { x: 5, y: 20, lo: null, hi: 10, tag: "b", boundary: true });
  const custom = splitAt([{ t: 0, v: 0 }, { t: 4, v: 8 }], 1, (p) => p.t);
  assert.deepEqual(custom.forecast[0], { t: 1, v: 2, boundary: true });
});

// spread

test("spread: today's chart.line placement", () => {
  assert.deepEqual(spread([100, 105, 300], 30, [-Infinity, 400]), [100, 130, 300]);
  assert.deepEqual(spread([380, 390], 30, [-Infinity, 400]), [370, 400]);
  assert.deepEqual(spread([105, 100, 300], 30, [-Infinity, 400]), [130, 100, 300]); // input order
  assert.deepEqual(spread([380, 390], 30), [380, 410]); // no max: no shift
  assert.deepEqual(spread([], 30), []);
});

test("spread: min stops the upward shift", () => {
  assert.deepEqual(spread([10, 20, 30], 30, [-100, 40]), [-20, 10, 40]); // room above: the whole overflow shifts
  assert.deepEqual(spread([10, 20, 30], 30, [0, 40]), [0, 30, 60]); // the first stops at min; the last may still pass max
  assert.deepEqual(spread([10, 12, 14], 30, [10, 20]), [10, 40, 70]);
});

// fit

test("fit: outside, inside, other side, negative marks", () => {
  assert.deepEqual(fit(100, 0, 40, [0, 200]), { x: 100, anchor: "start", inside: false });
  assert.deepEqual(fit(100, 0, 40, [0, 200], 4), { x: 104, anchor: "start", inside: false });
  assert.deepEqual(fit(180, 0, 40, [0, 200], 4), { x: 176, anchor: "end", inside: true });
  assert.deepEqual(fit(30, 20, 40, [0, 45], 4), { x: 16, anchor: "end", inside: false }); // too short to hold it: past start
  // negative marks (end left of start): everything mirrors
  assert.deepEqual(fit(100, 200, 40, [0, 300]), { x: 100, anchor: "end", inside: false });
  assert.deepEqual(fit(20, 200, 40, [0, 300], 4), { x: 24, anchor: "start", inside: true });
  assert.deepEqual(fit(20, 40, 40, [0, 300], 4), { x: 44, anchor: "start", inside: false });
  // equal start and end counts as positive
  assert.deepEqual(fit(50, 50, 10, [0, 100]), { x: 50, anchor: "start", inside: false });
});

// wrapLabel

test("wrapLabel: unchanged", () => {
  assert.deepEqual(wrapLabel("North region", 20, 2), ["North region"]);
  assert.deepEqual(wrapLabel("North region office", 12, 3), ["North region", "office"]);
  assert.deepEqual(wrapLabel("Supercalifragilistic", 8, 3), ["Supercal", "ifragili", "stic"]); // a long word is cut
  assert.deepEqual(wrapLabel("one two three four five six", 7, 2), ["one two", "three…"]); // too many lines end with an ellipsis
  assert.deepEqual(wrapLabel("", 8, 2), [""]);
  assert.deepEqual(wrapLabel("   ", 8, 2), [""]);
});

// drawOrder

const ids = Array.from({ length: 120 }, (_, i) => `d${i}`);

test("drawOrder: deterministic and seeded", () => {
  assert.deepEqual(drawOrder(ids), drawOrder(ids));
  assert.deepEqual(drawOrder(ids), drawOrder(ids, 1));
  assert.notDeepEqual(drawOrder(ids, 1), drawOrder(ids, 2));
  assert.deepEqual([...drawOrder(ids, 2)].sort(), [...ids].sort());
});

test("drawOrder: independent of the file's row order", () => {
  const shuffled = [...ids].sort((a, b) => ((a.length * 7919 + a.charCodeAt(1) * 31 + a.charCodeAt(a.length - 1)) % 13) - ((b.length * 7919 + b.charCodeAt(1) * 31 + b.charCodeAt(b.length - 1)) % 13));
  assert.notDeepEqual(shuffled, ids);
  assert.deepEqual(drawOrder(shuffled), drawOrder(ids));
  assert.deepEqual(drawOrder([...ids].reverse()), drawOrder(ids));
});

test("drawOrder: adding draws keeps the old ones' relative order", () => {
  const before = drawOrder(ids.slice(0, 60));
  const after = drawOrder(ids).filter((id) => before.includes(id));
  assert.deepEqual(after, before);
});

test("drawOrder: prefixes grow", () => {
  const order = drawOrder(ids);
  assert.deepEqual(order.slice(0, 50).slice(0, 10), order.slice(0, 10));
  assert.equal(new Set(order.slice(0, 50)).size, 50);
});

test("drawOrder: golden vectors (the order decks already paint must not change)", () => {
  assert.deepEqual(drawOrder(["a", "b", "c", "d", "e"], 1), ["b", "c", "a", "d", "e"]);
  assert.deepEqual(drawOrder(["a", "b", "c", "d", "e"], 2), ["e", "d", "a", "c", "b"]);
  assert.deepEqual(drawOrder(["x", "é", "😀", "10"]), ["10", "x", "é", "😀"]);
});

test("drawOrder: duplicates and numbers", () => {
  const order = drawOrder([3, "3", 1]);
  assert.deepEqual([...order].sort(), ["1", "3"]);
  assert.deepEqual(drawOrder([3, 3, 3]), ["3"]);
  assert.deepEqual(drawOrder([]), []);
});

// swarm

const lcg = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;

test("swarm: deterministic, no overlap when there is room", () => {
  const rand = lcg(7);
  const xs = Array.from({ length: 60 }, () => rand() * 200);
  const r = 3;
  const dy = swarm(xs, { r, maxDy: 1000 });
  assert.deepEqual(swarm(xs, { r, maxDy: 1000 }), dy);
  assert.equal(dy.length, xs.length);
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      if (Math.abs(xs[i] - xs[j]) < 2 * r) assert.ok(Math.abs(dy[i] - dy[j]) >= 2 * r - 1e-9, `points ${i} and ${j} overlap`);
    }
  }
  assert.deepEqual(swarm([5], { r: 3, maxDy: 10 }), [0]);
  assert.deepEqual(swarm([0, 100], { r: 3, maxDy: 10 }), [0, 0]);
  assert.deepEqual(swarm([0, 1, 2], { r: 3, maxDy: 100 }), [0, 6, -6]);
});

test("swarm: clamped to maxDy", () => {
  const xs = Array.from({ length: 40 }, (_, i) => i * 0.5);
  for (const maxDy of [0, 6, 12, 30]) for (const dy of swarm(xs, { r: 3, maxDy })) assert.ok(Math.abs(dy) <= maxDy, `|${dy}| > ${maxDy}`);
  assert.deepEqual(swarm([1, 1, 1], { r: 3, maxDy: -5 }), [0, 0, 0]);
});

test("swarm all equal", () => {
  const dy = swarm(Array(20).fill(5), { r: 4, maxDy: 20 });
  assert.equal(dy.length, 20);
  for (const d of dy) {
    assert.ok(!Number.isNaN(d));
    assert.ok(Math.abs(d) <= 20);
  }
});

test("swarm: non-finite x is NaN", () => {
  const dy = swarm([1, NaN, 2, Infinity, null, undefined, 3], { r: 3, maxDy: 20 });
  assert.deepEqual(dy.map(Number.isNaN), [false, true, false, true, true, true, false]);
  assert.deepEqual(dy.filter((d) => !Number.isNaN(d)), [0, 6, -6]);
});

// the module

test("chart-layout.js has no imports", async () => {
  const source = await readFile(new URL("../../engine/core/chart-layout.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^\s*import[\s{*"']/m);
  assert.doesNotMatch(source, /\bimport\s*\(/);
  assert.doesNotMatch(source, /\brequire\s*\(/);
});
