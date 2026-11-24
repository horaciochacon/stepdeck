// cli/check.js, cli/shoot.js and cli/dump.js without a browser: the layout rules on a hand-made measurement, the
// name of a PNG, and the size of the worker pool.
import { test } from "node:test";
import assert from "node:assert/strict";
import { availableParallelism } from "node:os";
import { layoutFindings } from "../../cli/check.js";
import { fileName } from "../../cli/shoot.js";
import { workerCount } from "../../cli/dump.js";

const item = (rects) => ({ text: "2016", rects, slack: 0, fontSize: 32, source: false, fg: [0, 0, 0, 1], bg: [255, 255, 255] });
const layout = (elements) => ({ minFont: 28, canvas: { w: 1920, h: 1080 }, elements });

test("text-outside-region: a region with no height says the figure does not fit that layout", () => {
  const el = (regionRect) => ({ id: "chart", region: "main", box: false, regionRect, paints: null, items: [item([{ x: 100, y: 500, w: 80, h: 40 }])] });
  const [flat] = layoutFindings(layout([el({ x: 96, y: 540, w: 1728, h: 0 })]));
  assert.equal(flat.rule, "text-outside-region");
  assert.match(flat.limit, /inside region 'main' at 96,540 1728×0/);
  assert.equal(flat.fix, "region 'main' has no height here: move the figure to a layout whose region has room (figure-notes, full-bleed or a half of halves)");
  const [short] = layoutFindings(layout([el({ x: 96, y: 300, w: 1728, h: 100 })]));
  assert.equal(short.rule, "text-outside-region");
  assert.match(short.fix, /^shorten the text/);
});

test("hidden-paints: a hidden element with a child that still shows is reported, text or not", () => {
  const paints = { what: "span.badge", rect: { x: 96.2, y: 200, w: 300, h: 51.6 } };
  const found = layoutFindings(layout([
    { id: "late", region: "main", box: false, regionRect: { x: 96, y: 96, w: 1728, h: 800 }, paints, items: [] },
    { id: "fine", region: "main", box: false, regionRect: { x: 96, y: 96, w: 1728, h: 800 }, paints: null, items: [] },
  ]));
  assert.deepEqual(found.map((f) => [f.element, f.rule]), [["late", "hidden-paints"]]);
  assert.equal(found[0].measured, "hidden at this step, but its <span.badge> at 96,200 300×52 has visibility: visible");
  assert.match(found[0].fix, /^never set visibility: visible on a child/);
});

test("shoot: an id cannot name a folder or leave shots/<size>/", () => {
  assert.equal(fileName("base"), "base");
  assert.equal(fileName("Step_2-b.v1"), "Step_2-b.v1");
  assert.equal(fileName("x/../../../escaped"), "x_.._.._.._escaped");
  assert.equal(fileName("two words"), "two_words");
  assert.equal(fileName("a\\b:c"), "a_b_c");
  assert.equal(fileName(".."), "_");
  assert.equal(fileName("."), "_");
  assert.equal(fileName(""), "_");
  for (const id of ["x/../../../escaped", "..", "/abs", "a\\..\\b"]) assert.ok(!/[\\/]/.test(fileName(id)) && !/^\.*$/.test(fileName(id)), id);
});

test("workerCount: STEPDECK_WORKERS, else min(4, half the cores), never under 1", () => {
  assert.equal(workerCount("1"), 1);
  assert.equal(workerCount("7"), 7);
  assert.equal(workerCount(""), Math.min(4, Math.max(1, Math.floor(availableParallelism() / 2))));
  assert.equal(workerCount(undefined), workerCount(""));
  for (const bad of ["0", "-1", "2.5", "many"]) assert.throws(() => workerCount(bad), /STEPDECK_WORKERS must be a whole number, 1 or more \(got '/, bad);
});
