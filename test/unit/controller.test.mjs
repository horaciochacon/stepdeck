import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry } from "#engine/core/registry.js";
import { animate } from "#engine/core/animate.js";
import { SlideController, SETTLE_TIMEOUT_MS } from "#engine/core/controller.js";
import { makeFormat } from "#engine/core/format.js";

// ---------- fakes ----------

/** A fake component module that records every mount/update call into `log`. */
function recorder(log, { onUpdate } = {}) {
  return {
    mount(el, props, ctx) {
      const rec = { el, mountProps: props, ctx, updates: [] };
      log.push(rec);
      return {
        async update(p, info) {
          rec.updates.push({ props: p, info });
          if (onUpdate) await onUpdate(p, info);
        },
        pause() { rec.paused = true; },
        destroy() { rec.destroyed = true; },
      };
    },
  };
}

function fakeRegistry(modules) {
  return {
    async get(name) {
      if (!(name in modules)) throw new Error(`unknown component '${name}'`);
      return modules[name];
    },
    async schema() { return {}; },
  };
}

const docs = { "data/s.json": { n: 1234.5 } };
const load = async (path) => {
  if (!(path in docs)) throw new Error(`data file not found: ${path}`);
  return docs[path];
};

function makeController(slide, modules, options = {}) {
  const visibility = [];
  const ctxBase = {
    setVisible: (id, visible, collapse) => visibility.push({ id, visible, collapse }),
    load,
    format: makeFormat("en"),
    t: (key) => key,
    capture: false,
    tokens: { accent: "#123" },
    palette: (kind) => [kind],
  };
  const mountPoint = (id) => ({ id });
  const c = new SlideController({ slide, registry: fakeRegistry(modules), ctxBase, mountPoint, ...options });
  return { c, visibility };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

const twoElements = {
  id: "s",
  elements: [
    { id: "a", type: "rec", props: { v: 0 } },
    { id: "b", type: "rec", props: { label: "fixed" } },
  ],
  steps: [
    { id: "s0" },
    { id: "s1", set: { a: { v: 1 } } },
    { id: "s2", set: { a: { v: 2 } } },
    { id: "s3", set: { a: { v: 3 } } },
  ],
};

// ---------- controller ----------

test("mount mounts every element (hidden ones too) with step-0 resolved props and a full ctx", async () => {
  const log = [];
  const slide = {
    id: "m",
    elements: [
      { id: "a", type: "rec", props: { value: "{{data/s.json#/n | ,.1f}}" } },
      { id: "h", type: "rec", from: "s1", props: { x: 1 } },
    ],
    steps: [{ id: "s0" }, { id: "s1" }],
  };
  const { c } = makeController(slide, { rec: recorder(log) });
  await c.mount();
  assert.equal(log.length, 2);
  assert.deepEqual(log[0].mountProps, { value: "1,234.5" });
  await c.goTo(0);
  assert.deepEqual(c.state.elements.a.props, { value: "1,234.5" }, "state holds resolved props");
  assert.deepEqual(log[0].el, { id: "a" });
  const ctx = log[0].ctx;
  for (const key of ["d3", "data", "format", "t", "capture", "animate", "tokens", "palette", "size", "mount"]) {
    assert.ok(key in ctx, `ctx.${key}`);
  }
  assert.deepEqual(ctx.size, { w: 0, h: 0 });
  assert.equal(ctx.tokens.accent, "#123");
  assert.equal(typeof ctx.d3.select, "function");
  assert.equal(typeof ctx.mount, "function");
  assert.deepEqual(c.errors, []);
});

test("first goTo after mount updates and sets visibility for every element, without animation", async () => {
  const log = [];
  const slide = {
    id: "f",
    elements: [
      { id: "a", type: "rec", props: { v: 0 } },
      { id: "h", type: "rec", from: "s1", collapse: true, props: {} },
    ],
    steps: [{ id: "s0" }, { id: "s1" }],
  };
  const { c, visibility } = makeController(slide, { rec: recorder(log) });
  await c.mount();
  await c.goTo(0, { animate: true });
  assert.deepEqual(visibility, [
    { id: "a", visible: true, collapse: false },
    { id: "h", visible: false, collapse: true },
  ]);
  const a = log[0].updates[0].info;
  assert.equal(a.animate, false);
  assert.equal(a.prev, null);
  assert.equal(a.entered, true);
  assert.equal(a.step, "s0");
  assert.equal(a.prevStep, null);
  assert.deepEqual(a.changed, ["v"]);
  assert.equal(log[1].updates[0].info.entered, false);

  // h becomes visible: setVisible + update even though its props did not change
  await c.goTo("s1");
  assert.deepEqual(visibility.at(-1), { id: "h", visible: true, collapse: true });
  assert.equal(log[1].updates.length, 2);
  assert.equal(log[1].updates[1].info.entered, true);
  assert.deepEqual(log[1].updates[1].info.changed, []);
  assert.equal(c.state.step, 1);
  assert.equal(c.state.stepId, "s1");
});

test("update skipped when nothing changed", async () => {
  const log = [];
  const { c } = makeController(twoElements, { rec: recorder(log) });
  await c.mount();
  await c.goTo(0);
  await c.goTo(1);
  const [a, b] = log;
  assert.equal(a.updates.length, 2);
  assert.equal(b.updates.length, 1);
  assert.deepEqual(a.updates[1].info.changed, ["v"]);
  assert.deepEqual(a.updates[1].info.prev, { v: 0 });
  // re-applying the same step is a no-op for everyone
  await c.goTo(1);
  assert.equal(a.updates.length, 2);
  assert.equal(b.updates.length, 1);
});

test("animate only on forward by one", async () => {
  const log = [];
  const { c } = makeController(twoElements, { rec: recorder(log) });
  await c.mount();
  await c.goTo(0);
  const last = () => log[0].updates.at(-1).info;
  await c.goTo(1, { animate: true });
  assert.equal(last().animate, true);
  assert.equal(last().step, "s1");
  assert.equal(last().prevStep, "s0");
  await c.goTo(3, { animate: true });
  assert.equal(last().animate, false);
  await c.goTo(2, { animate: true });
  assert.equal(last().animate, false, "backward");
  await c.goTo(3);
  assert.equal(last().animate, false, "forward by one but not requested");
});

test("abort on supersede: in-flight update sees its signal aborted, latest step wins", async () => {
  const log = [];
  const entered = deferred();
  const onUpdate = (p, info) => {
    if (p.v !== 1) return;
    entered.resolve();
    return new Promise((r) => info.signal.addEventListener("abort", r, { once: true }));
  };
  const { c } = makeController(twoElements, { rec: recorder(log, { onUpdate }) });
  await c.mount();
  await c.goTo(0);
  const p1 = c.goTo(1, { animate: true });
  await entered.promise;
  const p2 = c.goTo(2, { animate: true });
  await Promise.all([p1, p2]);
  const ups = log[0].updates;
  const step1 = ups.find((u) => u.props.v === 1);
  assert.equal(step1.info.signal.aborted, true);
  assert.deepEqual(ups.at(-1).props, { v: 2 });
  assert.equal(ups.at(-1).info.animate, true, "1 was applied, so 1 -> 2 is forward by one");
  assert.equal(c.state.step, 2);
});

test("rapid navigation drops intermediate targets and never overlaps updates", async () => {
  const log = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const onUpdate = async () => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
  };
  const slide = { id: "r", elements: [{ id: "a", type: "rec", props: { v: 0 } }], steps: twoElements.steps };
  const { c } = makeController(slide, { rec: recorder(log, { onUpdate }) });
  await c.mount();
  await c.goTo(0);
  c.goTo(1);
  c.goTo(2);
  const p3 = c.goTo(3, { animate: true });
  await p3;
  await c.settled();
  const values = log[0].updates.map((u) => u.props.v);
  assert.deepEqual(values, [0, 3]);
  assert.equal(log[0].updates.at(-1).info.animate, false, "0 -> 3 is not forward by one");
  assert.equal(maxInFlight, 1);
  assert.equal(c.state.step, 3);
});

test("goTo with an unknown step rejects only that call", async () => {
  const log = [];
  const { c } = makeController(twoElements, { rec: recorder(log) });
  await c.mount();
  await assert.rejects(c.goTo("nope"), /unknown step 'nope'/);
  await c.goTo(1);
  assert.equal(c.state.step, 1);
});

test("throwing component is contained", async () => {
  const log = [];
  const thrower = {
    mount() {
      return {
        update(p) {
          if (p.v >= 1) throw new Error("boom");
        },
      };
    },
  };
  const slide = {
    id: "t",
    elements: [
      { id: "bad", type: "thrower", props: { v: 0 } },
      { id: "good", type: "rec", props: { v: 0 } },
    ],
    steps: [
      { id: "s0" },
      { id: "s1", set: { bad: { v: 1 }, good: { v: 1 } } },
      { id: "s2", set: { bad: { v: 2 }, good: { v: 2 } } },
    ],
  };
  const { c } = makeController(slide, { rec: recorder(log), thrower });
  await c.mount();
  await c.goTo(0);
  await c.goTo(1);
  await c.goTo(2);
  assert.deepEqual(c.errors, ["t/bad: boom"]);
  assert.deepEqual(log[0].updates.map((u) => u.props.v), [0, 1, 2]);
});

test("mount errors, unknown components and missing data are contained per element", async () => {
  const log = [];
  const badMount = { mount() { throw new Error("cannot mount"); } };
  const slide = {
    id: "e",
    elements: [
      { id: "x", type: "nope", props: {} },
      { id: "y", type: "badMount", props: {} },
      { id: "z", type: "rec", props: { v: "{{data/missing.json#/n}}" } },
      { id: "ok", type: "rec", props: { v: 1 } },
    ],
    steps: [{ id: "s0" }, { id: "s1", set: { ok: { v: 2 } } }],
  };
  const { c } = makeController(slide, { rec: recorder(log), badMount });
  await c.mount();
  await c.goTo(0);
  await c.goTo(1);
  assert.equal(c.errors.length, 3);
  assert.match(c.errors[0], /^e\/x: unknown component 'nope'/);
  assert.equal(c.errors[1], "e/y: cannot mount");
  assert.match(c.errors[2], /^e\/z: data file not found: data\/missing\.json/);
  assert.equal(log.length, 1, "only 'ok' mounted");
  assert.deepEqual(log[0].updates.map((u) => u.props.v), [1, 2]);
});

test("binding that starts failing at a later step marks the element failed", async () => {
  const log = [];
  const slide = {
    id: "b",
    elements: [{ id: "a", type: "rec", props: { v: 1 } }],
    steps: [{ id: "s0" }, { id: "s1", set: { a: { v: "{{data/s.json#/missing}}" } } }, { id: "s2", set: { a: { v: 3 } } }],
  };
  const { c } = makeController(slide, { rec: recorder(log) });
  await c.mount();
  await c.goTo(0);
  await c.goTo(1);
  await c.goTo(2);
  assert.equal(c.errors.length, 1);
  assert.match(c.errors[0], /^b\/a: data pointer not found/);
  assert.equal(log[0].updates.length, 1);
});

test("transition is passed to updates; pause and destroy reach instances", async () => {
  const log = [];
  const slide = {
    id: "p",
    elements: [{ id: "a", type: "rec", props: { v: 0 } }],
    steps: [{ id: "s0" }, { id: "s1", set: { a: { v: 1 } }, transition: { stagger: 40, duration: 300 } }],
  };
  const { c } = makeController(slide, { rec: recorder(log) });
  await c.mount();
  await c.goTo(0);
  await c.goTo(1);
  assert.deepEqual(log[0].updates[1].info.transition, { stagger: 40, duration: 300 });
  c.pause();
  assert.equal(log[0].paused, true);
  c.destroy();
  assert.equal(log[0].destroyed, true);
});

// ---------- registry ----------

function fakeImporter(modules) {
  const calls = [];
  const importer = async (url) => {
    calls.push(url);
    if (!(url in modules)) throw new Error(`Cannot find module ${url}`);
    return modules[url];
  };
  return { importer, calls };
}

test("registry resolves deck components first, then built-ins, with default export unwrapping", async () => {
  const deckMod = { default: { mount() {} } };
  const textMod = { default: { mount() {} } };
  const { importer, calls } = fakeImporter({
    "deck/components/my.x/index.js": deckMod,
    "engine/components/text/index.js": textMod,
  });
  const reg = createRegistry({
    builtinRoot: "engine/components",
    deckRoot: "deck/components",
    builtins: ["text", "chart.line"],
    deckComponents: ["my.x"],
    importer,
    readJSON: async (url) => ({ url }),
  });
  assert.equal(await reg.get("my.x"), deckMod.default);
  assert.equal(await reg.get("text"), textMod.default);
  assert.equal(await reg.get("text"), textMod.default);
  assert.deepEqual(calls, ["deck/components/my.x/index.js", "engine/components/text/index.js"]);
  assert.deepEqual(await reg.schema("chart.line"), { url: "engine/components/chart.line/schema.json" });
  assert.deepEqual(await reg.schema("my.x"), { url: "deck/components/my.x/schema.json" });
});

test("registry with an empty root keeps paths relative", async () => {
  const { importer, calls } = fakeImporter({ "my.x/index.js": { mount() {} } });
  const reg = createRegistry({ builtinRoot: "b", deckRoot: "", deckComponents: ["my.x"], importer, readJSON: async () => ({}) });
  await reg.get("my.x");
  assert.deepEqual(calls, ["my.x/index.js"]);
});

test("registry collision throws", async () => {
  const { importer } = fakeImporter({});
  const reg = createRegistry({
    builtinRoot: "b",
    deckRoot: "d",
    builtins: ["text", "chart.line"],
    deckComponents: ["text", "chart.line"],
    importer,
    readJSON: async () => ({}),
  });
  await assert.rejects(reg.get("text"), { message: "component 'text' collides with built-in; use a namespace like 'my.text'" });
  await assert.rejects(reg.get("chart.line"), /component 'chart\.line' collides with built-in/);
  await assert.rejects(reg.schema("text"), /collides with built-in/);
});

test("registry did-you-mean", async () => {
  const reg = createRegistry({
    builtinRoot: "b",
    deckRoot: "d",
    builtins: ["text", "chart.line", "chart.bar"],
    deckComponents: ["demo.story"],
    importer: async () => ({}),
    readJSON: async () => ({}),
  });
  await assert.rejects(reg.get("chart.lne"), { message: "unknown component 'chart.lne'; did you mean 'chart.line'?" });
  await assert.rejects(reg.get("demo.stroy"), /did you mean 'demo\.story'\?/);
  await assert.rejects(reg.get("zzzzzzzz"), { message: "unknown component 'zzzzzzzz'" });
});

test("registry accepts listing functions", async () => {
  const { importer } = fakeImporter({ "b/text/index.js": { mount() {} } });
  const reg = createRegistry({
    builtinRoot: "b",
    deckRoot: "d",
    builtins: async () => ["text"],
    deckComponents: () => [],
    importer,
    readJSON: async () => ({}),
  });
  assert.equal(typeof (await reg.get("text")).mount, "function");
});

// ---------- animate ----------

test("tween with aborted signal ends at target", async () => {
  const ac = new AbortController();
  ac.abort();
  const values = [];
  await animate.tween(0, 10, (v) => values.push(v), { duration: 500, signal: ac.signal });
  assert.deepEqual(values, [10]);
});

test("tween with duration 0 jumps to the end", async () => {
  const values = [];
  await animate.tween(3, 7, (v) => values.push(v), { duration: 0 });
  assert.deepEqual(values, [7]);
});

test("tween aborted mid-flight snaps to the end and resolves promptly", async () => {
  const ac = new AbortController();
  const values = [];
  const started = Date.now();
  const p = animate.tween(0, 100, (v) => values.push(v), { duration: 10_000, signal: ac.signal });
  await new Promise((r) => setTimeout(r, 40));
  ac.abort();
  await p;
  assert.ok(Date.now() - started < 1000);
  assert.equal(values.at(-1), 100);
  assert.ok(values.length >= 2, "intermediate frames ran");
  assert.ok(values.slice(0, -1).every((v) => v >= 0 && v < 100));
});

test("tween runs to completion with intermediate values", async () => {
  const values = [];
  await animate.tween(0, 1, (v) => values.push(v), { duration: 50 });
  assert.equal(values.at(-1), 1);
  assert.ok(values.length >= 2);
});

test("fadeIn, reveal and drawPath end in their final state on plain objects", async () => {
  const ac = new AbortController();
  ac.abort();
  const el = { style: { opacity: "0" } };
  await animate.fadeIn(el, { duration: 300, signal: ac.signal });
  assert.equal(el.style.opacity, "1");
  const r = { style: {} };
  await animate.reveal(r, { duration: 0 });
  assert.equal(r.style.clipPath, "");
  const path = { style: {}, getTotalLength: () => 120 };
  await animate.drawPath(path, { duration: 0 });
  assert.equal(path.style.strokeDashoffset, "");
  assert.equal(path.style.strokeDasharray, "");
  const noLength = { style: {} };
  await animate.drawPath(noLength, { duration: 20 });
  assert.equal(noLength.style.strokeDashoffset, "");
});

test("stagger calls fn for every item and snaps on abort", async () => {
  const ac = new AbortController();
  const seen = [];
  const p = animate.stagger([1, 2, 3], async (item, i, opts) => {
    seen.push([item, i]);
    await animate.tween(0, 1, () => {}, opts);
  }, { duration: 5_000, stagger: 1_000, signal: ac.signal });
  setTimeout(() => ac.abort(), 20);
  const t0 = Date.now();
  await p;
  assert.ok(Date.now() - t0 < 1000);
  assert.deepEqual(seen.map((s) => s[0]), [1, 2, 3]);
});

// ---------- callbacks that throw (review fix) ----------

const within = (p, ms, label) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} did not settle in ${ms} ms`)), ms))]);

test("tween whose onValue throws mid-flight settles by rejecting with that error", async () => {
  let calls = 0;
  const p = animate.tween(0, 1, () => {
    if (++calls === 3) throw new Error("bad frame");
  }, { duration: 200 });
  await assert.rejects(within(p, 1000, "tween"), /bad frame/);
  const before = calls;
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(calls, before, "no frames after the throw");
});

test("tween whose onValue throws on the first or final call rejects instead of hanging or throwing", async () => {
  const boom = () => { throw new Error("boom"); };
  const instant = animate.tween(0, 1, boom, { duration: 0 });
  assert.ok(instant instanceof Promise, "no synchronous throw");
  await assert.rejects(instant, /boom/);
  await assert.rejects(animate.tween(0, 1, boom, { duration: 200 }), /boom/);
  const ac = new AbortController();
  const p = animate.tween(0, 1, (v) => { if (v === 1) throw new Error("end"); }, { duration: 5_000, signal: ac.signal });
  setTimeout(() => ac.abort(), 20);
  await assert.rejects(within(p, 1000, "tween"), /end/);
});

test("fadeIn, drawPath and stagger surface errors instead of hanging", async () => {
  await assert.rejects(animate.fadeIn(null, { duration: 0 }));
  await assert.rejects(animate.drawPath({ style: {}, getTotalLength() { throw new Error("no svg"); } }), /no svg/);
  const done = [];
  const p = animate.stagger([1, 2, 3], async (item) => {
    if (item === 1) throw new Error("item 1");
    await new Promise((r) => setTimeout(r, 10));
    done.push(item);
  }, { duration: 100, stagger: 5 });
  await assert.rejects(within(p, 1000, "stagger"), /item 1/);
  assert.deepEqual(done, [2, 3], "stagger waits for the other items before rejecting");
});

test("component whose tween callback throws is contained; later goTo and settled() complete", { timeout: 5000 }, async () => {
  const log = [];
  const animated = {
    mount(el, props, ctx) {
      return {
        async update(p, { signal }) {
          if (p.v < 1) return;
          let frames = 0;
          await ctx.animate.tween(0, p.v, () => {
            if (++frames === 2) throw new Error("render failed");
          }, { duration: 200, signal });
        },
      };
    },
  };
  // element a uses the animated component, b the recorder
  const slide = { ...twoElements, elements: [{ ...twoElements.elements[0], type: "animated" }, twoElements.elements[1]] };
  const ctl = makeController(slide, { rec: recorder(log), animated }).c;
  await ctl.mount();
  await ctl.goTo(0);
  await within(ctl.goTo(1, { animate: true }), 2000, "goTo(1)");
  assert.deepEqual(ctl.errors, ["s/a: render failed"]);
  await within(ctl.goTo(2), 2000, "goTo(2)");
  await within(ctl.settled(), 2000, "settled()");
  assert.equal(ctl.state.step, 2);
  assert.deepEqual(ctl.errors, ["s/a: render failed"], "recorded once");
  assert.equal(log[0].updates.length, 1, "b updated once and kept working");
});

// ---------- Task 4: canvas-pixel size and the onError hook ----------
test("ctx.size uses unscaled offsetWidth/offsetHeight (canvas pixels) when the element has them", async () => {
  const log = [];
  const slide = { id: "z", elements: [{ id: "a", type: "rec", props: {} }] };
  const el = {
    offsetWidth: 100,
    offsetHeight: 40,
    getBoundingClientRect: () => ({ width: 50, height: 20 }), // scaled by a CSS transform
  };
  const c = new SlideController({
    slide,
    registry: fakeRegistry({ rec: recorder(log) }),
    ctxBase: { setVisible() {}, load, format: makeFormat("en") },
    mountPoint: () => el,
  });
  await c.mount();
  assert.deepEqual(log[0].ctx.size, { w: 100, h: 40 });
});

test("ctxBase.onError is called once per failed element with its id and error", async () => {
  const calls = [];
  const slide = {
    id: "o",
    elements: [
      { id: "x", type: "nope", props: {} },
      { id: "ok", type: "rec", props: {} },
    ],
  };
  const c = new SlideController({
    slide,
    registry: fakeRegistry({ rec: recorder([]) }),
    ctxBase: { setVisible() {}, load, format: makeFormat("en"), onError: (id, error) => calls.push([id, error.message]) },
    mountPoint: (id) => ({ id }),
  });
  await c.mount();
  await c.goTo(0);
  assert.deepEqual(calls, [["x", "unknown component 'nope'"]]);
  assert.equal(c.errors.length, 1);
});

// ---------- ctx.mount (Task 7) ----------

/** A parent that mounts one child of type `kid` into a plain-object element and exposes the handle. */
function parentMounting(kidProps, out, { onUpdate } = {}) {
  return {
    async mount(el, props, ctx) {
      const target = { id: "child-el", offsetWidth: 300, offsetHeight: 100 };
      out.handle = await ctx.mount("kid", target, kidProps);
      return {
        async update(p, info) {
          out.parentInfo = info;
          if (onUpdate) await onUpdate(out.handle, p, info);
        },
        pause() { out.parentPaused = true; },
        destroy() { out.parentDestroyed = true; },
      };
    },
  };
}

const oneParent = { id: "p", elements: [{ id: "par", type: "parent", props: { n: 0 } }], steps: [{ id: "a" }, { id: "b", set: { par: { n: 1 } } }] };

test("ctx.mount resolves the type through the registry, resolves bindings and builds a child ctx", async () => {
  const kidLog = [];
  const out = {};
  const { c } = makeController(oneParent, { kid: recorder(kidLog), parent: parentMounting({ value: "{{data/s.json#/n | ,.1f}}", fixed: 2 }, out) });
  await c.mount();
  assert.deepEqual(c.errors, []);
  assert.equal(kidLog.length, 1);
  assert.deepEqual(kidLog[0].mountProps, { value: "1,234.5", fixed: 2 });
  assert.deepEqual(kidLog[0].el, { id: "child-el", offsetWidth: 300, offsetHeight: 100 });
  const ctx = kidLog[0].ctx;
  assert.deepEqual(ctx.size, { w: 300, h: 100 }, "size comes from the child element");
  assert.equal(ctx.tokens.accent, "#123");
  assert.equal(typeof ctx.mount, "function", "children can mount children");
  assert.equal(typeof out.handle.update, "function");
});

test("ctx.mount rejects with the registry error for an unknown type, and the parent fails alone", async () => {
  const log = [];
  const slide = { id: "p", elements: [
    { id: "par", type: "parent", props: {} },
    { id: "ok", type: "rec", props: {} },
  ] };
  const parent = { async mount(el, props, ctx) { await ctx.mount("nope", {}, {}); } };
  const { c } = makeController(slide, { parent, rec: recorder(log) });
  await c.mount();
  assert.deepEqual(c.errors, ["p/par: unknown component 'nope'"]);
  assert.equal(log.length, 1, "the sibling still mounted");
});

test("handle.update passes the parent's info through and computes the child's own prev and changed", async () => {
  const kidLog = [];
  const out = {};
  const { c } = makeController(oneParent, {
    kid: recorder(kidLog),
    parent: parentMounting({ text: "zero", role: "body" }, out, {
      onUpdate: (h, p, info) => h.update({ text: p.n === 0 ? "zero" : "one", role: "body" }, info),
    }),
  });
  await c.goTo(0);
  await c.goTo(1, { animate: true });
  const [first, second] = kidLog[0].updates;
  assert.deepEqual(first.props, { text: "zero", role: "body" });
  assert.equal(first.info.prev, null);
  assert.deepEqual(first.info.changed.sort(), ["role", "text"]);
  assert.equal(second.info.prev.text, "zero");
  assert.deepEqual(second.info.changed, ["text"], "child keys, not the parent's `n`");
  assert.equal(second.info.animate, true, "animate comes from the parent");
  assert.equal(second.info.signal, out.parentInfo.signal, "the parent's signal propagates");
  assert.equal(second.info.step, "b");
});

test("handle.update resolves bindings in the child's props", async () => {
  const kidLog = [];
  const out = {};
  const { c } = makeController(oneParent, {
    kid: recorder(kidLog),
    parent: parentMounting({ v: 0 }, out, { onUpdate: (h, p, info) => h.update({ v: "{{data/s.json#/n | ,.0f}}" }, info) }),
  });
  await c.goTo(0);
  assert.deepEqual(kidLog[0].updates[0].props, { v: "1,235" });
});

test("children are paused and destroyed with their parent, nested ones too", async () => {
  const kidLog = [];
  const grandLog = [];
  const kid = {
    async mount(el, props, ctx) {
      const inner = recorder(kidLog).mount(el, props, ctx);
      await ctx.mount("grand", { id: "g" }, {});
      return inner;
    },
  };
  const out = {};
  const { c } = makeController(oneParent, { parent: parentMounting({}, out), kid, grand: recorder(grandLog) });
  await c.goTo(0);
  c.pause();
  assert.equal(out.parentPaused, true);
  assert.equal(kidLog[0].paused, true, "child paused");
  assert.equal(grandLog[0].paused, true, "grandchild paused");
  c.destroy();
  assert.equal(out.parentDestroyed, true);
  assert.equal(kidLog[0].destroyed, true, "child destroyed");
  assert.equal(grandLog[0].destroyed, true, "grandchild destroyed");
  assert.deepEqual(c.errors, []);
});

test("a child that throws in mount or in update surfaces as the parent element's error", async () => {
  const slide = { id: "p", elements: [
    { id: "badmount", type: "parentA", props: {} },
    { id: "badupdate", type: "parentB", props: {} },
    { id: "fine", type: "rec", props: {} },
  ] };
  const log = [];
  const kidThrowsInMount = { mount() { throw new Error("child mount failed"); } };
  const kidThrowsInUpdate = { mount() { return { update() { throw new Error("child update failed"); } }; } };
  const parentA = { async mount(el, props, ctx) { await ctx.mount("kidA", {}, {}); return {}; } };
  const parentB = {
    async mount(el, props, ctx) {
      const h = await ctx.mount("kidB", {}, {});
      return { update: (p, info) => h.update({}, info) };
    },
  };
  const { c } = makeController(slide, { parentA, parentB, kidA: kidThrowsInMount, kidB: kidThrowsInUpdate, rec: recorder(log) });
  await c.goTo(0);
  assert.deepEqual(c.errors, ["p/badmount: child mount failed", "p/badupdate: child update failed"]);
  assert.equal(log[0].updates.length, 1, "the slide keeps working");
});

test("a child that finishes mounting after the parent was destroyed is destroyed at once", async () => {
  const gate = deferred();
  const started = deferred();
  const kidLog = [];
  const parent = { async mount(el, props, ctx) { started.resolve(); await gate.promise; await ctx.mount("kid", {}, {}); return {}; } };
  const { c } = makeController(oneParent, { parent, kid: recorder(kidLog) });
  const mounting = c.mount();
  await started.promise;
  c.destroy();
  gate.resolve();
  await mounting;
  assert.equal(kidLog.length, 1);
  assert.equal(kidLog[0].destroyed, true);
});

test("children mounted by a parent whose own mount then throws are destroyed", async () => {
  const kidLog = [];
  const parent = { async mount(el, props, ctx) { await ctx.mount("kid", {}, {}); throw new Error("parent failed"); } };
  const { c } = makeController(oneParent, { parent, kid: recorder(kidLog) });
  await c.mount();
  assert.deepEqual(c.errors, ["p/par: parent failed"]);
  assert.equal(kidLog[0].destroyed, true);
});

test("a child destroyed explicitly leaves its parent's list: swapped children are destroyed once", async () => {
  const calls = { k1: [], k2: [] };
  const counting = {
    mount: (el) => ({
      destroy: () => calls[el.id].push("destroy"),
      pause: () => calls[el.id].push("pause"),
    }),
  };
  const out = {};
  const parent = {
    async mount(el, props, ctx) {
      out.first = await ctx.mount("count", { id: "k1" }, {});
      out.first.destroy();
      out.first.destroy(); // idempotent
      out.second = await ctx.mount("count", { id: "k2" }, {}); // the swap
      return { update() {} };
    },
  };
  const { c } = makeController(oneParent, { parent, count: counting });
  await c.goTo(0);
  c.pause();
  assert.deepEqual(calls, { k1: ["destroy"], k2: ["pause"] }, "a destroyed child is no longer paused with the parent");
  c.destroy();
  assert.deepEqual(calls, { k1: ["destroy"], k2: ["pause", "destroy"] }, "each child is destroyed exactly once");
  out.first.pause(); // no-op after destroy
  await assert.rejects(() => out.first.update({}, {}), /destroyed child/);
  assert.deepEqual(calls.k1, ["destroy"]);
  assert.deepEqual(c.errors, []);
});

// ---------- watchdog ----------

test("watchdog: the default is 10 s", () => {
  assert.equal(SETTLE_TIMEOUT_MS, 10_000);
});

test("watchdog: an update that never settles fails its element, aborts its signal and lets the drain go on", { timeout: 5000 }, async () => {
  const log = [];
  let hungInfo = null;
  const hang = {
    mount() {
      return {
        update(p, info) {
          hungInfo = info;
          return new Promise(() => {});
        },
      };
    },
  };
  const slide = {
    id: "w",
    elements: [
      { id: "stuck", type: "hang", props: { v: 0 } },
      { id: "ok", type: "rec", props: { v: 0 } },
    ],
    steps: [{ id: "s0" }, { id: "s1", set: { stuck: { v: 1 }, ok: { v: 1 } } }],
  };
  const { c } = makeController(slide, { rec: recorder(log), hang }, { settleTimeout: 50 });
  await c.goTo(0);
  assert.deepEqual(c.errors, ["w/stuck: did not settle within 50ms"]);
  assert.equal(hungInfo.signal.aborted, true, "the hung element's signal is aborted");
  assert.equal(log[0].updates[0].info.signal.aborted, false, "a sibling's signal is not aborted by the watchdog");
  await c.goTo(1);
  await c.settled();
  assert.equal(c.state.step, 1);
  assert.deepEqual(log[0].updates.map((u) => u.props.v), [0, 1]);
  assert.equal(c.errors.length, 1, "a failed element gets no further calls and is recorded once");
});

test("watchdog: a mount that never settles fails its element; the rest of the slide mounts", { timeout: 5000 }, async () => {
  const log = [];
  let late = null;
  const destroyed = [];
  const hangMount = {
    mount() {
      return new Promise((r) => (late = r));
    },
  };
  const slide = {
    id: "m",
    elements: [
      { id: "stuck", type: "hangMount", props: {} },
      { id: "ok", type: "rec", props: { v: 0 } },
    ],
  };
  const { c } = makeController(slide, { rec: recorder(log), hangMount }, { settleTimeout: 50 });
  await c.goTo(0);
  assert.deepEqual(c.errors, ["m/stuck: did not settle within 50ms"]);
  assert.equal(log.length, 1, "'ok' mounted after the stuck one");
  assert.deepEqual(log[0].updates.map((u) => u.props.v), [0]);
  // A mount that settles after its watchdog fired is destroyed at once, never used.
  late({ update() { throw new Error("must not be called"); }, destroy: () => destroyed.push("stuck") });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(destroyed, ["stuck"]);
  assert.equal(c.errors.length, 1);
});

// ---------- ctx.assetUrl ----------

test("ctx.assetUrl is the data loader's url(): a deck-relative path resolved against the deck root", async () => {
  const log = [];
  const withUrl = Object.assign(async () => ({}), { url: (p) => `https://host/deck/${p}` });
  const slide = { id: "u", elements: [{ id: "a", type: "rec", props: {} }] };
  const c = new SlideController({
    slide,
    registry: fakeRegistry({ rec: recorder(log) }),
    ctxBase: { setVisible() {}, load: withUrl, format: makeFormat("en") },
    mountPoint: (id) => ({ id }),
  });
  await c.mount();
  assert.equal(log[0].ctx.assetUrl("assets/a.svg"), "https://host/deck/assets/a.svg");
});

// ---------- ctx.stepProps ----------

/** Mounts `slide` with a recorder for `rec` and returns the recorded ctx of the first element. */
async function mountedCtx(slide, modules = {}) {
  const log = [];
  const { c } = makeController(slide, { rec: recorder(log), ...modules });
  await c.mount();
  return { c, log, ctx: log[0]?.ctx };
}

test("stepProps: one entry per step, with set and advance patches", async () => {
  const slide = {
    id: "sp",
    elements: [
      { id: "a", type: "rec", props: { v: 0, k: "x" } },
      { id: "b", type: "rec", props: { w: 0 }, advance: { prop: "w", start: 2, values: [9] } },
    ],
    steps: [{ id: "s0" }, { id: "s1", set: { a: { v: 1 } } }, { id: "s2" }],
  };
  const { c, log } = await mountedCtx(slide);
  assert.deepEqual(c.errors, []);
  assert.deepEqual(log[0].ctx.stepProps, [{ v: 0, k: "x" }, { v: 1, k: "x" }, { v: 1, k: "x" }]);
  assert.deepEqual(log[1].ctx.stepProps, [{ w: 0 }, { w: 0 }, { w: 9 }]);
});

test("stepProps: a step's only applies to that index alone", async () => {
  const slide = {
    id: "sp",
    elements: [{ id: "a", type: "rec", props: { v: 0 } }],
    steps: [{ id: "s0" }, { id: "s1", only: { a: { v: 5 } } }, { id: "s2" }],
  };
  const { ctx } = await mountedCtx(slide);
  assert.deepEqual(ctx.stepProps, [{ v: 0 }, { v: 5 }, { v: 0 }]);
});

test("stepProps: a slide without steps has one entry", async () => {
  const slide = { id: "sp", elements: [{ id: "a", type: "rec", props: { v: 0 } }] };
  const { ctx } = await mountedCtx(slide);
  assert.deepEqual(ctx.stepProps, [{ v: 0 }]);
});

test("stepProps: bindings are resolved", async () => {
  const slide = {
    id: "sp",
    elements: [{ id: "a", type: "rec", props: { value: "{{data/s.json#/n | ,.1f}}" } }],
    steps: [{ id: "s0" }, { id: "s1", set: { a: { other: 1 } } }],
  };
  const { ctx } = await mountedCtx(slide);
  assert.deepEqual(ctx.stepProps, [{ value: "1,234.5" }, { value: "1,234.5", other: 1 }]);
});

test("stepProps: a step whose binding fails is null; the others resolve and the mount succeeds", async () => {
  const slide = {
    id: "sp",
    elements: [{ id: "a", type: "rec", props: { v: 1 } }],
    steps: [{ id: "s0" }, { id: "s1", set: { a: { v: "{{data/s.json#/missing}}" } } }, { id: "s2", set: { a: { v: 3 } } }],
  };
  const { c, log, ctx } = await mountedCtx(slide);
  assert.deepEqual(c.errors, []);
  assert.equal(log.length, 1, "the element mounted");
  assert.deepEqual(ctx.stepProps, [{ v: 1 }, null, { v: 3 }]);
});

test("stepProps: a step that does not fold is null, and so is every step after it", async () => {
  const slide = {
    id: "sp",
    elements: [{ id: "a", type: "rec", props: { v: 1 } }],
    steps: [{ id: "s0" }, { id: "s1", set: { a: { v: 2 } } }, { id: "s2", set: { ghost: { v: 3 } } }, { id: "s3" }],
  };
  const { c, ctx } = await mountedCtx(slide);
  assert.deepEqual(c.errors, []);
  assert.deepEqual(ctx.stepProps, [{ v: 1 }, { v: 2 }, null, null]);
});

test("stepProps: children mounted with ctx.mount get null", async () => {
  const kidLog = [];
  const slide = { id: "sp", elements: [{ id: "par", type: "parent", props: {} }], steps: [{ id: "a" }, { id: "b" }] };
  const parentLog = [];
  const parent = {
    async mount(el, props, ctx) {
      parentLog.push(ctx);
      await ctx.mount("kid", { id: "child-el" }, {});
      return {};
    },
  };
  const { c } = makeController(slide, { kid: recorder(kidLog), parent });
  await c.mount();
  assert.deepEqual(c.errors, []);
  assert.equal(parentLog[0].stepProps.length, 2, "the parent has its entries");
  assert.equal(kidLog[0].ctx.stepProps, null);
});

test("stepProps: frozen, and equal across two mounts of the same slide", async () => {
  const slide = {
    id: "sp",
    elements: [{ id: "a", type: "rec", props: { v: 0 } }],
    steps: [{ id: "s0" }, { id: "s1", set: { a: { v: 1 } } }],
  };
  const one = await mountedCtx(slide);
  const two = await mountedCtx(slide);
  assert.equal(Object.isFrozen(one.ctx.stepProps), true);
  assert.deepEqual(one.ctx.stepProps, two.ctx.stepProps);
  assert.notEqual(one.ctx.stepProps, two.ctx.stepProps, "each mount computes its own");
});
