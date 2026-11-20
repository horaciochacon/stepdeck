// Element entrance and exit choreography in the slide controller: the stagger hold, box motion through
// ctxBase.enterBox/exitBox, info.entrance for components that own their entrance, and abort.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SlideController } from "#engine/core/controller.js";
import { makeFormat } from "#engine/core/format.js";

// ---------- fakes ----------

const now = () => performance.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

/** A component module that logs every update into the shared `calls` log, with its element id. */
function logged(calls, { onUpdate } = {}) {
  return {
    mount(el, props, ctx) {
      calls.ctx[el.id] = ctx;
      return {
        async update(p, info) {
          calls.push({ kind: "update", id: el.id, props: p, info, at: now() });
          if (onUpdate) await onUpdate(el.id, p, info);
        },
      };
    },
  };
}

/** `schemas[type]` is the schema the registry returns for `type`; an Error rejects. Reads are counted. */
function fakeRegistry(modules, schemas, reads) {
  const registry = {
    async get(name) {
      if (!(name in modules)) throw new Error(`unknown component '${name}'`);
      return modules[name];
    },
  };
  if (schemas !== null) {
    registry.schema = async (name) => {
      reads[name] = (reads[name] ?? 0) + 1;
      const s = schemas[name];
      if (s instanceof Error) throw s;
      return s ?? {};
    };
  }
  return registry;
}

/**
 * A controller whose ctxBase records setVisible, enterBox and exitBox calls with timestamps.
 * Types: `rec` (box-moved) and `own` (declares "x-enter": "own"). `enterBox`/`exitBox` give the promise
 * those calls return; `boxes: false` leaves both callbacks out of ctxBase.
 */
function harness(slide, options = {}) {
  const {
    tokens = {},
    schemas = { own: { "x-enter": "own" } },
    enterBox = () => undefined,
    exitBox = () => undefined,
    boxes = true,
    onUpdate,
    modules = {},
    settleTimeout,
  } = options;
  const calls = [];
  calls.ctx = {};
  const reads = {};
  const ctxBase = {
    setVisible: (id, visible, collapse) => calls.push({ kind: "setVisible", id, visible, collapse, at: now() }),
    load: async () => ({}),
    format: makeFormat("en"),
    t: (key) => key,
    tokens,
  };
  if (boxes) {
    ctxBase.enterBox = (id, name, opts) => {
      calls.push({ kind: "enterBox", id, name, opts, at: now() });
      return enterBox(id, name, opts);
    };
    ctxBase.exitBox = (id, name, opts, collapse) => {
      calls.push({ kind: "exitBox", id, name, opts, collapse, at: now() });
      return exitBox(id, name, opts, collapse);
    };
  }
  const component = logged(calls, { onUpdate });
  const registry = fakeRegistry({ rec: component, own: component, ...modules }, schemas, reads);
  const c = new SlideController({
    slide,
    registry,
    ctxBase,
    mountPoint: (id) => ({ id }),
    ...(settleTimeout ? { settleTimeout } : {}),
  });
  const of = (kind, id) => calls.filter((k) => k.kind === kind && (id === undefined || k.id === id));
  return { c, calls, of, reads };
}

const visibility = ({ kind, id, visible, collapse }) => ({ kind, id, visible, collapse });

const threeCards = {
  id: "s",
  elements: [
    { id: "a", type: "rec", from: "s1", props: {} },
    { id: "b", type: "rec", from: "s1", props: {} },
    { id: "c", type: "rec", from: "s1", props: {} },
  ],
  steps: [{ id: "s0" }, { id: "s1" }, { id: "s2" }],
};

// ---------- the hold ----------

test("three entering elements are held to their slots", async () => {
  const tokens = { "--sd-stagger": "50ms", "--sd-enter": "rise", "--sd-duration": "400ms" };
  const { c, calls, of } = harness(threeCards, { tokens });
  await c.goTo(0);
  calls.length = 0;
  const t0 = now();
  await c.goTo(1, { animate: true });

  const enters = of("enterBox");
  assert.deepEqual(enters.map((e) => e.id), ["a", "b", "c"]);
  enters.forEach((e, i) => {
    const at = e.at - t0;
    // A timer never fires early; a busy event loop can fire it late, so only the upper bound is loose.
    assert.ok(at >= i * 50 - 25 && at <= i * 50 + 100, `${e.id} entered at ${at.toFixed(1)} ms, expected about ${i * 50}`);
    assert.equal(e.name, "rise", "the theme's --sd-enter");
    assert.equal(e.opts.duration, 400);
    assert.equal(typeof e.opts.ease, "function");
    assert.ok(e.opts.signal instanceof AbortSignal);
    const k = calls.indexOf(e);
    assert.deepEqual(visibility(calls[k - 1]), { kind: "setVisible", id: e.id, visible: true, collapse: false }, "setVisible right before enterBox");
    const update = of("update", e.id)[0];
    assert.ok(calls.indexOf(update) > k, "update after enterBox");
    assert.equal(update.info.entrance, null, "not owned");
    assert.equal(update.info.entered, true);
    assert.equal(update.info.animate, true);
  });
  assert.deepEqual(c.errors, []);
});

test("an element's own delay is added to its slot; the step's transition.stagger replaces the token", async () => {
  const slide = {
    ...threeCards,
    elements: [
      { id: "a", type: "rec", from: "s1", props: {} },
      { id: "b", type: "rec", from: "s1", enter: { motion: "pop", delay: 60, duration: 250 }, props: {} },
    ],
    steps: [{ id: "s0" }, { id: "s1", transition: { stagger: 20 } }],
  };
  const { c, calls, of } = harness(slide, { tokens: { "--sd-stagger": "500ms" } });
  await c.goTo(0);
  calls.length = 0;
  const t0 = now();
  await c.goTo(1, { animate: true });
  const [a, b] = of("enterBox");
  assert.equal(a.name, "fade", "no --sd-enter token: fade");
  assert.equal(b.name, "pop");
  assert.equal(b.opts.duration, 250, "the element's own duration");
  assert.ok(a.at - t0 <= 100, `a at ${(a.at - t0).toFixed(1)} ms`);
  const bAt = b.at - t0;
  assert.ok(bAt >= 55 && bAt <= 180, `b at ${bAt.toFixed(1)} ms, expected about 80 (20 + 60)`);
});

// ---------- owned entrances ----------

test("owned element gets info.entrance and no enterBox", async () => {
  const slide = {
    ...threeCards,
    elements: [
      { id: "chart", type: "own", from: "s1", props: {} },
      { id: "timed", type: "own", from: "s1", enter: { motion: "draw", duration: 900 }, props: {} },
      { id: "card", type: "rec", from: "s1", props: {} },
    ],
  };
  const { c, of } = harness(slide, { tokens: { "--sd-stagger": "10ms" } });
  await c.goTo(0);
  assert.equal(of("update", "chart")[0].info.entrance, null, "first render: null");
  await c.goTo(1, { animate: true });
  assert.deepEqual(of("enterBox").map((e) => e.id), ["card"]);
  assert.deepEqual(of("update", "chart")[1].info.entrance, { motion: "draw", duration: undefined });
  assert.deepEqual(of("update", "timed")[1].info.entrance, { motion: "draw", duration: 900 });
  assert.equal(of("update", "card")[1].info.entrance, null);
  for (const id of ["chart", "timed", "card"]) {
    assert.deepEqual(visibility(of("setVisible", id).at(-1)), { kind: "setVisible", id, visible: true, collapse: false });
  }
  // A later change on an animating step is not an entrance.
  await c.goTo(2, { animate: true });
  assert.equal(of("update", "chart").length, 2, "nothing changed: no update");
});

test("owned element with enter \"rise\" gets enterBox rise and entrance.motion \"none\"", async () => {
  const slide = { ...threeCards, elements: [{ id: "chart", type: "own", from: "s1", enter: "rise", props: {} }] };
  const { c, of } = harness(slide);
  await c.goTo(0);
  await c.goTo(1, { animate: true });
  const [box] = of("enterBox");
  assert.equal(box.id, "chart");
  assert.equal(box.name, "rise");
  assert.equal(of("update", "chart")[1].info.entrance.motion, "none");
});

test("enter none: no enterBox, entrance none for owned", async () => {
  const slide = {
    ...threeCards,
    elements: [
      { id: "chart", type: "own", from: "s1", enter: "none", props: {} },
      { id: "card", type: "rec", from: "s1", enter: { motion: "none" }, props: {} },
    ],
  };
  const { c, of } = harness(slide, { tokens: { "--sd-enter": "rise" } });
  await c.goTo(0);
  await c.goTo(1, { animate: true });
  assert.deepEqual(of("enterBox"), []);
  assert.deepEqual(of("update", "chart")[1].info.entrance, { motion: "none", duration: undefined });
  assert.equal(of("update", "card")[1].info.entrance, null);
  assert.equal(of("setVisible", "chart").at(-1).visible, true);
  assert.equal(of("setVisible", "card").at(-1).visible, true);
});

test("x-enter is read once per type at mount; a failed schema read counts as not owned", async () => {
  const slide = {
    ...threeCards,
    elements: [
      { id: "o1", type: "own", from: "s1", props: {} },
      { id: "o2", type: "own", from: "s1", props: {} },
      { id: "x", type: "broken", from: "s1", props: {} },
    ],
  };
  const { c, of, reads } = harness(slide, {
    schemas: { own: { "x-enter": "own" }, broken: new Error("cannot read schema.json") },
    modules: { broken: { mount: () => ({ update() {} }) } },
  });
  await c.mount();
  assert.deepEqual(reads, { own: 1, broken: 1 });
  await c.goTo(0);
  await c.goTo(1, { animate: true });
  await c.goTo(2, { animate: true });
  assert.deepEqual(reads, { own: 1, broken: 1 }, "not read again");
  assert.deepEqual(of("enterBox").map((e) => e.id), ["x"], "the unreadable type moves its box");
  assert.deepEqual(c.errors, []);

  // A registry without schema(): nothing is owned, and nothing fails.
  const bare = harness(slide, { schemas: null, modules: { broken: { mount: () => ({ update() {} }) } } });
  await bare.c.goTo(0);
  await bare.c.goTo(1, { animate: true });
  assert.deepEqual(bare.of("enterBox").map((e) => e.id), ["o1", "o2", "x"]);
  assert.deepEqual(bare.c.errors, []);
});

// ---------- exits ----------

const exits = {
  id: "x",
  elements: [
    { id: "risen", type: "rec", at: ["s0"], exit: "rise", props: {} },
    { id: "plain", type: "rec", at: ["s0"], props: {} },
    { id: "timed", type: "rec", at: ["s0"], exit: { motion: "pop", duration: 250 }, props: {} },
    { id: "folded", type: "rec", at: ["s0"], collapse: true, exit: "rise", props: {} },
    { id: "off", type: "rec", at: ["s0"], exit: "none", props: {} },
  ],
  steps: [{ id: "s0" }, { id: "s1" }],
};

test("exit plays exitBox before update; collapsed exit snaps with no exitBox", async () => {
  const ended = {};
  const exitBox = (id) => sleep(30).then(() => (ended[id] = now()));
  // A long stagger: an exit held to a slot, as an entrance is, would start 500 ms or more late.
  const { c, calls, of } = harness(exits, { exitBox, tokens: { "--sd-stagger": "500ms" } });
  await c.goTo(0);
  calls.length = 0;
  const t0 = now();
  await c.goTo(1, { animate: true });

  const boxes = of("exitBox");
  assert.deepEqual(boxes.map((b) => [b.id, b.name, b.collapse]), [
    ["risen", "rise", false],
    ["plain", "fade", false],
    ["timed", "pop", false],
  ]);
  assert.equal(boxes[2].opts.duration, 250);
  assert.equal(boxes[0].opts.duration, 400, "the theme default");
  assert.equal(typeof boxes[0].opts.ease, "function");
  for (const b of boxes) {
    assert.ok(b.at - t0 < 250, `${b.id}: exits start at t = 0 (started at ${(b.at - t0).toFixed(0)} ms, a stagger slot is 500 ms)`);
    assert.deepEqual(of("setVisible", b.id), [], `${b.id}: exitBox hides the box itself`);
    const update = of("update", b.id)[0];
    assert.ok(update.at >= ended[b.id], `${b.id}: update after its out motion`);
    assert.equal(update.info.entered, false);
    assert.equal(update.info.entrance, null);
  }
  const folded = of("setVisible", "folded");
  assert.deepEqual(folded.map(visibility), [{ kind: "setVisible", id: "folded", visible: false, collapse: true }]);
  assert.ok(folded[0].at < Math.min(...Object.values(ended)), "collapsed exit snaps at t = 0");
  assert.deepEqual(of("setVisible", "off").map(visibility), [{ kind: "setVisible", id: "off", visible: false, collapse: false }]);
  assert.deepEqual(c.errors, []);
});

test("an exitBox that rejects still hides the box, and fails its element", async () => {
  const slide = { ...exits, elements: [exits.elements[0], exits.elements[1]] };
  const exitBox = (id) => (id === "risen" ? Promise.reject(new Error("motion broke")) : undefined);
  const { c, of } = harness(slide, { exitBox });
  await c.goTo(0);
  await c.goTo(1, { animate: true });
  const hidden = of("setVisible", "risen").at(-1);
  assert.ok(hidden, "setVisible was called");
  assert.deepEqual(visibility(hidden), { kind: "setVisible", id: "risen", visible: false, collapse: false });
  assert.deepEqual(c.errors, ["x/risen: motion broke"]);
  assert.equal(of("update", "plain").length, 2, "the sibling still updated");
});

test("exit and entrance on one step", async () => {
  const slide = {
    id: "w",
    elements: [
      { id: "old", type: "rec", at: ["s0"], props: {} },
      { id: "new", type: "rec", from: "s1", props: {} },
      { id: "oldC", type: "rec", at: ["s0"], collapse: true, props: {} },
      { id: "newC", type: "own", from: "s1", collapse: true, enter: "rise", props: {} },
    ],
    steps: [{ id: "s0" }, { id: "s1" }],
  };
  const motion = () => sleep(30);
  const { c, calls, of } = harness(slide, { tokens: { "--sd-stagger": "20ms" }, enterBox: motion, exitBox: motion });
  await c.goTo(0);
  calls.length = 0;
  await c.goTo(1, { animate: true });
  await c.settled();
  assert.deepEqual(of("exitBox").map((b) => b.id), ["old"]);
  assert.deepEqual(of("enterBox").map((b) => b.id), ["new", "newC"]);
  // The collapsed swap: the exit snaps before the entering element shows.
  const hide = calls.findIndex((k) => k.kind === "setVisible" && k.id === "oldC");
  const show = calls.findIndex((k) => k.kind === "setVisible" && k.id === "newC");
  assert.ok(hide !== -1 && hide < show, "oldC collapses before newC shows");
  assert.equal(calls[hide].collapse, true);
  for (const id of ["old", "new", "oldC", "newC"]) assert.equal(of("update", id).length, 1, `${id} updated`);
  assert.equal(c.state.step, 1);
  assert.deepEqual(c.errors, []);
});

test("without enterBox/exitBox the controller falls back to setVisible", async () => {
  const slide = {
    id: "f",
    elements: [
      { id: "gone", type: "rec", at: ["s0"], exit: "rise", props: {} },
      { id: "here", type: "rec", from: "s1", props: {} },
    ],
    steps: [{ id: "s0" }, { id: "s1" }],
  };
  const { c, calls, of } = harness(slide, { boxes: false });
  await c.goTo(0);
  calls.length = 0;
  await c.goTo(1, { animate: true });
  assert.deepEqual(of("setVisible").map(visibility), [
    { kind: "setVisible", id: "gone", visible: false, collapse: false },
    { kind: "setVisible", id: "here", visible: true, collapse: false },
  ]);
  const gone = calls.findIndex((k) => k.id === "gone" && k.kind === "update");
  assert.ok(gone > calls.findIndex((k) => k.id === "gone" && k.kind === "setVisible"), "setVisible before update");
  assert.deepEqual(c.errors, []);
});

// ---------- when nothing is held ----------

test("jump, backward and first render: no hold, no enterBox, entrance null", async () => {
  const slide = {
    id: "j",
    elements: [
      { id: "a", type: "rec", from: "s1", props: {} },
      { id: "b", type: "own", from: "s2", props: {} },
      { id: "c", type: "rec", from: "s2", props: {} },
      { id: "x", type: "rec", at: ["s0"], props: {} },
    ],
    steps: [{ id: "s0" }, { id: "s1" }, { id: "s2" }],
  };
  const { c, calls, of } = harness(slide, { tokens: { "--sd-stagger": "500ms" } });
  const quick = async (label, run) => {
    calls.length = 0;
    const t0 = now();
    await run();
    assert.ok(now() - t0 < 400, `${label}: settled at once (${(now() - t0).toFixed(0)} ms; the first hold would be 500 ms)`);
    assert.deepEqual(of("enterBox"), [], `${label}: no enterBox`);
    assert.deepEqual(of("exitBox"), [], `${label}: no exitBox`);
    for (const u of of("update")) assert.equal(u.info.entrance, null, `${label}: ${u.id} entrance`);
    const firstUpdate = calls.findIndex((k) => k.kind === "update");
    const lastVisible = calls.findLastIndex((k) => k.kind === "setVisible");
    assert.ok(firstUpdate === -1 || lastVisible < firstUpdate, `${label}: every setVisible before any update`);
  };
  await quick("first render", () => c.goTo(0, { animate: true }));
  assert.equal(of("update").length, 4);
  await quick("jump", () => c.goTo(2, { animate: true }));
  assert.deepEqual(of("setVisible").map((k) => [k.id, k.visible]), [["a", true], ["b", true], ["c", true], ["x", false]]);
  await quick("backward", () => c.goTo(1, { animate: true }));
  assert.deepEqual(of("setVisible").map((k) => [k.id, k.visible]), [["b", false], ["c", false]]);
  await quick("forward by one, not requested", () => c.goTo(2));
  assert.deepEqual(of("setVisible").map((k) => [k.id, k.visible]), [["b", true], ["c", true]]);
});

test("a step with duration 0 holds nothing", async () => {
  const slide = {
    ...threeCards,
    elements: [...threeCards.elements, { id: "d", type: "rec", from: "s1", enter: { motion: "rise", delay: 1000 }, props: {} }],
    steps: [{ id: "s0" }, { id: "s1", transition: { duration: 0 } }],
  };
  const { c, of } = harness(slide, { tokens: { "--sd-stagger": "500ms" } });
  await c.goTo(0);
  const t0 = now();
  await c.goTo(1, { animate: true });
  assert.ok(now() - t0 < 400, `settled at once (${(now() - t0).toFixed(0)} ms; d's own delay would hold it 1000 ms)`);
  const enters = of("enterBox");
  assert.deepEqual(enters.map((e) => e.id), ["a", "b", "c", "d"], "every entering box is still moved, at duration 0");
  for (const e of enters) assert.equal(e.opts.duration, 0, `${e.id} snaps`);
});

// ---------- abort ----------

test("abort releases held elements at once", async () => {
  const slide = { ...threeCards, steps: [{ id: "s0" }, { id: "s1" }, { id: "s2", set: { a: { v: 2 } } }] };
  const { c, calls, of } = harness(slide, { tokens: { "--sd-stagger": "500ms" } });
  await c.goTo(0);
  calls.length = 0;
  const t0 = now();
  const p1 = c.goTo(1, { animate: true });
  await sleep(20);
  const p2 = c.goTo(2);
  await Promise.all([p1, p2]);
  const shown = of("setVisible").filter((k) => k.visible);
  assert.deepEqual(shown.map((k) => k.id), ["a", "b", "c"]);
  for (const k of shown) assert.ok(k.at - t0 < 250, `${k.id} shown at ${(k.at - t0).toFixed(0)} ms (its slot was 500 or 1000 ms)`);
  for (const id of ["b", "c"]) {
    assert.equal(of("enterBox", id)[0].opts.signal.aborted, true, `${id}: the box motion gets the aborted signal`);
    assert.equal(of("update", id)[0].info.signal.aborted, true, `${id}: update runs with the aborted signal`);
  }
  assert.deepEqual(of("update", "a").at(-1).props, { v: 2 }, "then the latest target is applied");
  assert.equal(c.state.step, 2);
  assert.deepEqual(c.errors, []);
});

test("destroy during a hold leaves held elements untouched", async () => {
  const { c, calls, of } = harness(threeCards, { tokens: { "--sd-stagger": "500ms" } });
  await c.goTo(0);
  calls.length = 0;
  const p = c.goTo(1, { animate: true });
  await sleep(20);
  c.destroy();
  await p;
  assert.deepEqual(of("setVisible").map((k) => k.id), ["a"], "only the element whose slot had come");
  assert.deepEqual(of("update").map((k) => k.id), ["a"]);
});

// ---------- settling and the watchdog ----------

test("settled waits for box motion", async () => {
  const slide = { ...threeCards, elements: [threeCards.elements[0]] };
  const gate = deferred();
  const { c } = harness(slide, { enterBox: () => gate.promise });
  await c.goTo(0);
  const p = c.goTo(1, { animate: true });
  const first = await Promise.race([c.settled().then(() => "settled"), sleep(60).then(() => "pending")]);
  assert.equal(first, "pending");
  gate.resolve();
  await c.settled();
  await p;
  assert.equal(c.state.step, 1);
});

test("the watchdog covers each element's box motion and hold", { timeout: 5000 }, async () => {
  // A box motion that never settles fails its element alone.
  const slide = { ...threeCards, elements: threeCards.elements.slice(0, 2) };
  const stuck = harness(slide, { tokens: { "--sd-stagger": "1ms" }, enterBox: (id) => (id === "a" ? new Promise(() => {}) : undefined), settleTimeout: 50 });
  await stuck.c.goTo(0);
  await stuck.c.goTo(1, { animate: true });
  assert.deepEqual(stuck.c.errors, ["s/a: did not settle within 50ms"]);
  assert.equal(stuck.of("enterBox", "a")[0].opts.signal.aborted, true, "its box motion is told to stop");

  // A hold longer than the watchdog fails the element: it is shown (so its error shows) and not updated.
  const held = harness(slide, { tokens: { "--sd-stagger": "200ms" }, settleTimeout: 50 });
  await held.c.goTo(0);
  held.calls.length = 0;
  await held.c.goTo(1, { animate: true });
  assert.deepEqual(held.c.errors, ["s/b: did not settle within 50ms"]);
  assert.equal(held.of("setVisible", "b").at(-1).visible, true);
  assert.deepEqual(held.of("update", "b"), []);
  assert.deepEqual(held.of("enterBox", "b"), []);
});

// ---------- ctx.motion ----------

test("ctx.motion exists on mounted components and children", async () => {
  const childCtx = {};
  const kid = { mount: (el, props, ctx) => ((childCtx.ctx = ctx), { update() {} }) };
  const parent = {
    async mount(el, props, ctx) {
      await ctx.mount("kid", { id: "kid-el" }, {});
      return { update() {} };
    },
  };
  const slide = { id: "m", elements: [{ id: "p", type: "parent", props: {} }, { id: "r", type: "rec", props: {} }] };
  const { c, calls } = harness(slide, { tokens: { "--sd-stagger": "70ms" }, modules: { parent, kid } });
  await c.mount();
  for (const [label, ctx] of [["component", calls.ctx.r], ["child", childCtx.ctx]]) {
    const { motion } = ctx;
    assert.equal(typeof motion.in, "function", `${label}: in`);
    assert.equal(typeof motion.out, "function", `${label}: out`);
    assert.ok(motion.names.includes("rise"), `${label}: names`);
    assert.equal(motion.timing({ transition: null }).stagger, 70, `${label}: timing reads the theme`);
  }
  assert.deepEqual(c.errors, []);
});
