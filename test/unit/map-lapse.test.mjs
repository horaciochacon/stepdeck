// components/map/lapse.js: the time-lapse of the map, in Node. A step's time-lapse state and its element errors, the
// frame pair at a moment of a run, the frames a run decodes as it goes, and the panel's label during a crossfade.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeFormat } from "#engine/core/format.js";
import { lapseOf, pairAt, runFrames, runMoment, READ_AHEAD } from "#engine/components/map/lapse.js";

const ctx = { format: makeFormat("en") };
const LABELS = ["2000", "2001", "2002", "2003"];
/** A prepared time-lapse layer: its labels and each frame's numbers. */
const lapse = (labels = LABELS, numbers = (i) => ({ people: 100 * (i + 1) })) => ({ prepared: { lapse: { labels, numbers: labels.map((_, i) => numbers(i)), raster: null } } });
const of = (props, layers = [lapse()], ids = layers.map((_, i) => `l${i}`)) => lapseOf(props, ids.map((id) => ({ id })), layers, ctx);

test("lapseOf: no time-lapse layer, no time-lapse", () => {
  assert.equal(of({ frame: "2001", pace: 50 }, [{ prepared: { legend: null } }, { prepared: null }]), null, "frame and pace do nothing without one");
});

test("lapseOf: the frame, the pace and the numbers of a step", () => {
  const first = of({});
  assert.deepEqual({ labels: first.labels, index: first.index, pace: first.pace, numbers: first.numbers }, { labels: LABELS, index: 0, pace: 700, numbers: [] }, "the first frame, at 700 ms");
  const step = of({ frame: 2002, pace: 100, numbers: [{ key: "people", label: "People", format: ",.0f" }] }, [{ prepared: null }, lapse()], ["s", "years"]);
  assert.equal(step.index, 2, "labels compare as text");
  assert.equal(step.pace, 100);
  const [people] = step.numbers;
  assert.deepEqual({ ...people, fmt: undefined }, { key: "people", label: "People", format: ",.0f", fmt: undefined, values: [100, 200, 300, 400] });
  assert.equal(people.fmt(1234.5), "1,235");
  assert.equal(of({ numbers: [{ key: "people", format: "," }] }).numbers[0].label, "", "no label: the number alone");
});

test("lapseOf: the element errors", () => {
  assert.throws(() => of({}, [lapse(), lapse(["2000", "2001", "2002", "2004"])], ["years", "rain"]), { message: "time-lapse layers 'years' and 'rain' have different frame labels" });
  assert.throws(() => of({ frame: "1999" }), { message: "frame '1999' not found (frames: 2000, 2001, 2002, 2003)" });
  for (const pace of [99, 2001, "fast"]) assert.throws(() => of({ pace }), { message: "`pace` must be 100 to 2000 ms a frame" }, String(pace));
  assert.doesNotThrow(() => of({ pace: 100 }));
  assert.doesNotThrow(() => of({ pace: 2000 }));
  assert.throws(() => of({ numbers: [{ key: "births", format: "," }] }), { message: "`numbers` key 'births' is in no time-lapse layer (keys: people)" });
  assert.throws(() => of({ numbers: [{ key: "people", format: "," }] }, [lapse(), lapse()], ["north", "south"]), { message: "`numbers` key 'people' is in time-lapse layers 'north' and 'south'" });
  assert.throws(() => of({ numbers: [{ key: "people", label: "People" }] }), { message: '`numbers` key \'people\' needs a `format` (a d3-format string such as ",.0f")' });
});

test("pairAt: the frames on screen at a moment of a run, forward and backward", () => {
  const run = [3, 4, 5];
  assert.deepEqual(pairAt(run, 0), { at: 3, next: 4, mix: 0, place: 0 });
  assert.deepEqual(pairAt(run, 0.25), { at: 3, next: 4, mix: 0.5, place: 0 });
  assert.deepEqual(pairAt(run, 0.5), { at: 4, next: 5, mix: 0, place: 1 });
  assert.deepEqual(pairAt(run, 1), { at: 4, next: 5, mix: 1, place: 1 }, "the end is the last move, fully mixed");
  assert.deepEqual(pairAt(run, 1.2), pairAt(run, 1), "past the end");
  assert.deepEqual(pairAt(run, -0.1), pairAt(run, 0), "before the start");
  assert.deepEqual(pairAt([5, 4, 3, 2], 0.5), { at: 4, next: 3, mix: 0.5, place: 1 }, "backward");
  assert.deepEqual(pairAt([7, 8], 0.75), { at: 7, next: 8, mix: 0.75, place: 0 }, "one move");
});

test("runMoment: the label turns to the next frame half way, the numbers count between the two", () => {
  const s = of({ numbers: [{ key: "people", label: "People", format: ",.0f" }] });
  const rest = { frame: "2000", layers: [{ alpha: 1, frame: { at: 0, next: 0, mix: 0 } }], panel: { label: "2000", alpha: 1, rows: [{ key: "people", label: "People", text: "100", opacity: 1 }] } };
  const at = (mix) => runMoment(rest, { lapse: s }, { at: 1, next: 2, mix });
  assert.equal(at(0.49).frame, "2001");
  assert.equal(at(0.5).frame, "2002");
  assert.equal(at(0.5).panel.label, "2002", "the panel says what the canvases do");
  assert.equal(at(0.25).panel.rows[0].text, "225");
  assert.deepEqual(at(0.25).layers[0].frame, { at: 1, next: 2, mix: 0.25 }, "every layer on the pair");
});

test("runFrames: asks ahead once, keeps failures, never rejects", async () => {
  const asked = [];
  const decoded = new Set();
  const raster = {
    grid(i) {
      asked.push(i);
      if (i === 6) return Promise.reject(new Error("data/f/6.png: not found"));
      decoded.add(i);
      return Promise.resolve({});
    },
    decoded: (i) => (decoded.has(i) ? {} : undefined),
  };
  const s = { layers: [{ prepared: { lapse: { raster } } }, { prepared: { lapse: { raster } } }, { prepared: null }] };
  const run = [9, 8, 7, 6, 5, 4, 3, 2, 1];
  const frames = runFrames(s, run);
  await frames.ask(0);
  assert.deepEqual(asked, run.slice(0, READ_AHEAD + 1), "the first place and four past it, once per raster");
  assert.ok(frames.ready(9) && !frames.ready(4));
  await frames.ask(0);
  assert.equal(asked.length, READ_AHEAD + 1, "a place is asked for once");
  await frames.ask(2);
  assert.deepEqual(asked, run.slice(0, 2 + READ_AHEAD + 1));
  assert.equal(frames.failure(6).message, "data/f/6.png: not found", "a failure is kept, not thrown");
  assert.equal(frames.failure(5), undefined);
  await frames.ask(100);
  assert.deepEqual(asked, run, "never past the run's end");
});
