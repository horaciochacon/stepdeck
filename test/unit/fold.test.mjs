import { test } from "node:test";
import assert from "node:assert/strict";
import {
  expandSugar,
  mergePatch,
  stepIndex,
  stepCount,
  stateAt,
  initialElements,
} from "#engine/core/fold.js";

test("mergePatch merges objects, replaces arrays, deletes on null", () => {
  const target = { a: { b: 1, c: 2 }, l: [1] };
  const snapshot = structuredClone(target);
  const out = mergePatch(target, { a: { c: null }, l: [2] });
  assert.deepEqual(out, { a: { b: 1 }, l: [2] });
  assert.deepEqual(target, snapshot, "target is not mutated");
});

test("mergePatch follows RFC 7396 edge cases", () => {
  assert.deepEqual(mergePatch({ a: 1 }, 5), 5);
  assert.deepEqual(mergePatch(5, { a: 1 }), { a: 1 });
  assert.deepEqual(mergePatch({ a: 1 }, { b: { c: null, d: 1 } }), { a: 1, b: { d: 1 } });
  const patch = { l: [{ x: 1 }] };
  const out = mergePatch({}, patch);
  out.l[0].x = 2;
  assert.equal(patch.l[0].x, 1, "result does not alias the patch");
});

const steps5 = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }];

test("stepIndex accepts ids and numbers", () => {
  const s = { id: "s", steps: [{ id: "base" }, { id: "x" }] };
  assert.equal(stepIndex(s, "x"), 1);
  assert.equal(stepIndex(s, 1), 1);
  assert.throws(() => stepIndex(s, "nope"), { message: "unknown step 'nope' in slide 's'" });
  assert.throws(() => stepIndex(s, 2), { message: "unknown step '2' in slide 's'" });
});

test("stepCount is steps.length, or 1 without steps", () => {
  assert.equal(stepCount({ id: "s" }), 1);
  assert.equal(stepCount({ id: "s", steps: [] }), 1);
  assert.equal(stepCount({ id: "s", steps: steps5 }), 5);
});

const el = (id, extra = {}) => ({ id, type: "text", props: { text: id }, ...extra });
const vis = (s, k, id) => stateAt(s, k).elements[id].visible;

test("from hides before and shows after", () => {
  const s = { id: "s", elements: [el("e", { from: "x" })], steps: [{ id: "base" }, { id: "x" }] };
  assert.equal(vis(s, 0, "e"), false);
  assert.equal(vis(s, 1, "e"), true);
});

test("at shows only listed steps", () => {
  const s = { id: "s", elements: [el("e", { at: [1] })], steps: [{}, {}, {}] };
  assert.deepEqual([0, 1, 2].map((k) => vis(s, k, "e")), [false, true, false]);
});

test("explicit hide wins over from", () => {
  const s = { id: "s", elements: [el("e", { from: 0 })], steps: [{}, { hide: ["e"] }] };
  assert.equal(vis(s, 0, "e"), true);
  assert.equal(vis(s, 1, "e"), false);
});

test("explicit show wins over at", () => {
  const s = { id: "s", elements: [el("e", { at: [2] })], steps: [{}, { show: ["e"] }, {}] };
  assert.deepEqual([0, 1, 2].map((k) => vis(s, k, "e")), [false, true, true]);
});

test("elements are visible from step 0 by default", () => {
  const s = { id: "s", elements: [el("e")], steps: [{}, {}] };
  assert.deepEqual([0, 1].map((k) => vis(s, k, "e")), [true, true]);
});

test("set folds forward", () => {
  const s = {
    id: "s",
    elements: [el("e", { props: { a: 1, b: 2 } })],
    steps: [{}, { set: { e: { a: 9 } } }, {}],
  };
  assert.deepEqual(stateAt(s, 0).elements.e.props, { a: 1, b: 2 });
  assert.deepEqual(stateAt(s, 1).elements.e.props, { a: 9, b: 2 });
  assert.deepEqual(stateAt(s, 2).elements.e.props, { a: 9, b: 2 });
});

test("replace swaps props wholesale and folds forward", () => {
  const s = {
    id: "s",
    elements: [el("e", { props: { a: 1, b: 2 } })],
    steps: [{}, { replace: { e: { c: 3 } } }, {}],
  };
  assert.deepEqual(stateAt(s, 2).elements.e.props, { c: 3 });
});

test("only is not folded", () => {
  const s = {
    id: "s",
    elements: [el("e", { props: { hl: null, n: 1 } })],
    steps: [{}, { only: { e: { hl: "x" } } }, {}],
  };
  assert.equal(stateAt(s, 0).elements.e.props.hl, null);
  assert.equal(stateAt(s, 1).elements.e.props.hl, "x");
  assert.equal(stateAt(s, 2).elements.e.props.hl, null);
});

test("only applies after set in the same step", () => {
  const s = {
    id: "s",
    elements: [el("e", { props: { a: 1 } })],
    steps: [{ set: { e: { a: 2 } }, only: { e: { a: 3 } } }, {}],
  };
  assert.equal(stateAt(s, 0).elements.e.props.a, 3);
  assert.equal(stateAt(s, 1).elements.e.props.a, 2);
});

test("advance expands to per-step values", () => {
  const s = {
    id: "s",
    elements: [el("t", { type: "terminal", props: {}, advance: { prop: "shown", values: [0, 4, 9], start: "b" } })],
    steps: steps5,
  };
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((k) => stateAt(s, k).elements.t.props.shown),
    [undefined, 0, 4, 9, 9],
  );
});

test("advance defaults to start 0 and ignores values past the last step", () => {
  const s = {
    id: "s",
    elements: [el("t", { advance: { prop: "n", values: [1, 2, 3, 4] } })],
    steps: [{}, {}],
  };
  assert.deepEqual([0, 1].map((k) => stateAt(s, k).elements.t.props.n), [1, 2]);
});

test("explicit set wins over advance in the same step", () => {
  const s = {
    id: "s",
    elements: [el("t", { advance: { prop: "n", values: [1, 2], start: 0 } })],
    steps: [{}, { set: { t: { n: 99 } } }],
  };
  assert.equal(stateAt(s, 1).elements.t.props.n, 99);
});

test("expandSugar returns one patch per step index", () => {
  const s = {
    id: "s",
    elements: [el("e", { from: "c" }), el("t", { advance: { prop: "n", values: [5, 6], start: "b" } })],
    steps: steps5,
  };
  const patches = expandSugar(s);
  assert.equal(patches.length, 5);
  assert.deepEqual(patches[0].hide, ["e"]);
  assert.deepEqual(patches[2].show, ["e"]);
  assert.deepEqual(patches[1].set, { t: { n: 5 } });
  assert.deepEqual(patches[2].set, { t: { n: 6 } });
  assert.equal(patches[3].set, undefined);
});

test("title string becomes a title element that a step can set", () => {
  const s = {
    id: "s",
    title: "First",
    elements: [el("e")],
    steps: [{}, { set: { title: { text: "Second" } } }],
  };
  const st0 = stateAt(s, 0);
  assert.equal(st0.title, "First");
  assert.equal(st0.elements.title.region, "title");
  assert.equal(st0.elements.title.type, "text");
  assert.equal(st0.elements.title.visible, true);
  assert.equal(stateAt(s, 1).title, "Second");
});

test("elements carry type, region, box, collapse, enter, exit and ghost", () => {
  const s = {
    id: "s",
    elements: [
      el("a", { region: "main", collapse: true, enter: "fade", exit: "none" }),
      el("b", { box: { x: 1, y: 2, w: 3, h: 4 } }),
    ],
  };
  const { elements } = stateAt(s, 0);
  assert.deepEqual(elements.a, {
    type: "text", props: { text: "a" }, visible: true, region: "main", collapse: true, enter: "fade", exit: "none", ghost: undefined,
  });
  assert.equal(elements.b.collapse, false);
  assert.deepEqual(elements.b.box, { x: 1, y: 2, w: 3, h: 4 });
  assert.equal("region" in elements.b, false);
});

test("notes: step notes, else slide notes; transition comes from the step", () => {
  const s = {
    id: "s",
    notes: "slide",
    elements: [],
    steps: [{}, { notes: "step", transition: { stagger: 50, duration: 200 } }],
  };
  assert.equal(stateAt(s, 0).notes, "slide");
  assert.equal(stateAt(s, 0).transition, null);
  assert.equal(stateAt(s, 1).notes, "step");
  assert.deepEqual(stateAt(s, 1).transition, { stagger: 50, duration: 200 });
});

test("unknown element ids in a patch throw a clear error", () => {
  const s = { id: "s", elements: [el("e")], steps: [{ id: "x", set: { ghost: { a: 1 } } }] };
  assert.throws(() => stateAt(s, 0), { message: "unknown element 'ghost' in slide 's' step 'x'" });
});

test("stateAt does not mutate the slide definition", () => {
  const s = fixture();
  const before = structuredClone(s);
  for (let k = 0; k < stepCount(s); k++) stateAt(s, k);
  assert.deepEqual(s, before);
});

function fixture() {
  return {
    id: "fx",
    title: "Fixture",
    notes: "slide notes",
    elements: [
      el("chart", { region: "main", type: "chart.line", props: { series_shown: ["a"], axes: { y: "People" } } }),
      el("n1", { region: "notes", from: "annotate" }),
      el("flash", { at: ["focus"] }),
      el("term", { type: "terminal", props: { script: "s.json" }, advance: { prop: "shown", values: [0, 4, 9], start: "regimens" } }),
      el("old", { props: { text: "old" } }),
    ],
    steps: [
      { id: "base" },
      { id: "regimens", set: { chart: { series_shown: ["a", "b"] } }, notes: "n-regimens" },
      { id: "annotate", set: { chart: { annotate: [{ x: 300 }] }, title: { text: "Annotated" } }, hide: ["old"] },
      { id: "focus", only: { chart: { highlight: "b" } }, transition: { stagger: 20, duration: 150 } },
      { id: "total", replace: { old: { text: "new" } }, show: ["old"], set: { chart: { axes: { y: null } } } },
    ],
  };
}

// Independent sequential reference: replay patches 0..k one at a time, using only
// the public pieces (expandSugar, mergePatch), in a different shape from stateAt.
function replay(slide, k) {
  const sugar = expandSugar(slide);
  const defs = [];
  if (typeof slide.title === "string") {
    defs.push({ id: "title", type: "text", region: "title", props: { text: slide.title, accent: true } });
  }
  defs.push(...slide.elements);
  const state = new Map(defs.map((d) => [d.id, { props: structuredClone(d.props ?? {}), visible: true }]));
  for (let i = 0; i <= k; i++) {
    for (const p of [sugar[i], slide.steps?.[i] ?? {}]) {
      for (const [id, props] of Object.entries(p.replace ?? {})) state.get(id).props = structuredClone(props);
      for (const [id, patch] of Object.entries(p.set ?? {})) state.get(id).props = mergePatch(state.get(id).props, patch);
      for (const id of p.show ?? []) state.get(id).visible = true;
      for (const id of p.hide ?? []) state.get(id).visible = false;
    }
  }
  for (const [id, patch] of Object.entries(slide.steps?.[k]?.only ?? {})) {
    state.get(id).props = mergePatch(state.get(id).props, patch);
  }
  return Object.fromEntries([...state].map(([id, v]) => [id, v]));
}

test("jump equals replay (property over every k, in shuffled order)", () => {
  const s = fixture();
  const n = stepCount(s);
  const order = [3, 0, 4, 1, 2, 4, 0];
  assert.ok(order.every((k) => k < n));
  for (const k of order) {
    const jumped = stateAt(s, k);
    const ref = replay(s, k);
    assert.deepEqual(Object.keys(jumped.elements).sort(), Object.keys(ref).sort());
    for (const [id, r] of Object.entries(ref)) {
      assert.deepEqual(jumped.elements[id].props, r.props, `props of ${id} at ${k}`);
      assert.equal(jumped.elements[id].visible, r.visible, `visible of ${id} at ${k}`);
    }
  }
  // Spot checks so the property cannot pass vacuously.
  assert.deepEqual(stateAt(s, 4).elements.chart.props.axes, {});
  assert.equal(stateAt(s, 3).elements.chart.props.highlight, "b");
  assert.equal("highlight" in stateAt(s, 4).elements.chart.props, false);
  assert.equal(stateAt(s, 4).elements.term.props.shown, 9);
  assert.equal(stateAt(s, 4).elements.old.props.text, "new");
  assert.equal(stateAt(s, 2).title, "Annotated");
});

test("stateAt carries enter, exit and ghost from the element", () => {
  const s = {
    id: "s",
    elements: [
      el("p", { from: 1, enter: { motion: "pop", delay: 120 }, exit: "fade", ghost: "2 · Adjust" }),
      el("q", { ghost: true }),
      el("r"),
    ],
    steps: [{}, {}],
  };
  const { elements } = stateAt(s, 0);
  assert.equal(elements.p.ghost, "2 · Adjust");
  assert.deepEqual(elements.p.enter, { motion: "pop", delay: 120 });
  assert.equal(elements.p.exit, "fade");
  assert.equal(elements.q.ghost, true);
  assert.equal(elements.r.ghost, undefined);
});

test("lede string becomes a text element right after the title, in the title region with role lede", () => {
  const s = { id: "s", section: "Methods", title: "T", lede: "One line.", elements: [{ id: "b", type: "text", props: { text: "x" } }] };
  const defs = initialElements(s);
  assert.deepEqual(defs.map((d) => d.id), ["kicker", "title", "lede", "b"]);
  assert.deepEqual(defs[2], { id: "lede", type: "text", region: "title", props: { text: "One line.", role: "lede" } });
  assert.deepEqual(stateAt(s, 0).elements.lede.props, { text: "One line.", role: "lede" });
  assert.deepEqual(initialElements({ id: "s", lede: "Only a lede.", elements: [] }).map((d) => d.id), ["lede"], "no title needed");
  assert.deepEqual(initialElements({ id: "s", title: "T", elements: [] }).map((d) => d.id), ["title"], "no lede, no element");
  assert.deepEqual(initialElements({ id: "s", title: "T", lede: "", elements: [] }).map((d) => d.id), ["title", "lede"], "an empty lede still reserves its element, so a step can fill it");
});

test("a step can set the lede text, and a replace keeps the role default", () => {
  const s = { id: "s", title: "T", lede: "First", elements: [], steps: [{}, { set: { lede: { text: "Second" } } }, { replace: { lede: { text: "Third" } } }] };
  assert.equal(stateAt(s, 1).elements.lede.props.text, "Second");
  assert.deepEqual(stateAt(s, 1).elements.lede.props, { text: "Second", role: "lede" });
  assert.deepEqual(stateAt(s, 2).elements.lede.props, { text: "Third", role: "lede" }, "a replace drops props; the role default comes back");
});

test("an explicit lede element wins over the sugar and gets role lede unless its props set a role", () => {
  const explicit = { id: "lede", type: "text", region: "title", props: { text: "Mine" } };
  const s = { id: "s", title: "T", lede: "Sugar", elements: [explicit] };
  const defs = initialElements(s);
  assert.deepEqual(defs.map((d) => d.id), ["title", "lede"], "one lede, the author's");
  assert.equal(stateAt(s, 0).elements.lede.props.text, "Mine");
  assert.equal(stateAt(s, 0).elements.lede.props.role, "lede");
  assert.deepEqual(explicit.props, { text: "Mine" }, "the author's definition is not mutated");

  const own = { id: "s", elements: [{ id: "lede", type: "text", region: "title", props: { text: "Mine", role: "note" } }] };
  assert.equal(stateAt(own, 0).elements.lede.props.role, "note");

  const md = { id: "s", elements: [{ id: "lede", type: "markdown", region: "title", props: { md: "Mine" } }] };
  assert.equal("role" in stateAt(md, 0).elements.lede.props, false, "only a text element gets the role");
});
