// timeline: stop states are derived from the props (pure function, no DOM).
import { test } from "node:test";
import assert from "node:assert/strict";
import { stopStates } from "#engine/components/timeline/stops.js";

const three = [{ id: "a", label: "A" }, { id: "b", label: "B", sub: "s" }, { id: "c", label: "C" }];

test("even spacing: three stops sit at 0, 0.5 and 1", () => {
  assert.deepEqual(stopStates(three, 0).map((s) => s.at), [0, 0.5, 1]);
});

test("explicit `at` wins over even spacing; id, label and sub are carried", () => {
  const s = stopStates([{ label: "x", at: 0 }, { id: "k", label: "y", sub: "s", at: 0.25 }, { label: "z", at: 1 }], 0);
  assert.deepEqual(s.map((x) => x.at), [0, 0.25, 1]);
  assert.deepEqual(s.map((x) => x.id), ["0", "k", "2"], "id defaults to the index as a string");
  assert.deepEqual(s.map((x) => x.sub), [undefined, "s", undefined]);
  assert.deepEqual(s.map((x) => x.label), ["x", "y", "z"]);
});

test("reached: progress 0.5 passes the first two stops", () => {
  assert.deepEqual(stopStates(three, 0.5).map((s) => s.reached), [true, true, false]);
});

test("reached at the extremes, and a stop is reached when progress meets it", () => {
  assert.deepEqual(stopStates(three, 0).map((s) => s.reached), [true, false, false]);
  assert.deepEqual(stopStates(three, 1).map((s) => s.reached), [true, true, true]);
  assert.deepEqual(stopStates(three, 0.5 - 1e-12).map((s) => s.reached), [true, true, false], "float noise does not matter");
  assert.deepEqual(stopStates(three, 0.49).map((s) => s.reached), [true, false, false]);
});

test("fewer than two stops throws", () => {
  assert.throws(() => stopStates([{ label: "A" }], 0), /at least 2 stops/);
  assert.throws(() => stopStates([], 0), /at least 2 stops/);
  assert.throws(() => stopStates(undefined, 0), /at least 2 stops/);
});

test("bad progress, duplicate ids and bad `at` throw, naming the problem", () => {
  assert.throws(() => stopStates(three, 1.5), /progress/);
  assert.throws(() => stopStates(three, "half"), /progress/);
  assert.throws(() => stopStates([{ id: "a", label: "A" }, { id: "a", label: "B" }], 0), /duplicate.*'a'/);
  assert.throws(() => stopStates([{ label: "A", at: 0 }, { label: "B", at: 1.2 }], 0), /\bat\b.*0 and 1/);
  assert.throws(() => stopStates([{ label: "A", at: 0.6 }, { label: "B", at: 0.3 }], 0), /increas/);
});

test("schema: `orient` accepts only \"horizontal\", so a timeline may name it", async () => {
  const { readFileSync } = await import("node:fs");
  const { createAjv } = await import("../../cli/ajv.js");
  const schema = JSON.parse(readFileSync(new URL("../../engine/components/timeline/schema.json", import.meta.url), "utf8"));
  const valid = createAjv().compile(schema);
  const stops = [{ label: "A" }, { label: "B" }];
  assert.ok(valid({ stops, progress: 0, orient: "horizontal" }), JSON.stringify(valid.errors));
  assert.ok(valid({ stops, progress: 0 }), "orient is optional");
  assert.equal(valid({ stops, progress: 0, orient: "vertical" }), false, "vertical is not supported");
  assert.equal(schema.properties.orient.default, "horizontal");
});
