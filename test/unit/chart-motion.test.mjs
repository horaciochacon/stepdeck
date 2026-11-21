// core/chart-motion.js (morph, entrance, undraw), the frozen chartKit and ctx.chart in the controller.
import { test } from "node:test";
import assert from "node:assert/strict";
import { morph, entrance, undraw } from "#engine/core/chart-motion.js";
import { chartKit } from "#engine/core/chart.js";
import { makeMotion } from "#engine/core/motion.js";
import { SlideController } from "#engine/core/controller.js";
import { makeFormat } from "#engine/core/format.js";

const signal = new AbortController().signal;
const aborted = AbortSignal.abort();

/** A ctx stub: animate.tween records its arguments; tokens and motion.timing are the theme's. */
function stubCtx(tokens = { "--sd-duration": "500ms", "--sd-easing": "linear" }) {
  const calls = [];
  const ctx = {
    tokens,
    motion: makeMotion(tokens),
    animate: { tween: (...args) => (calls.push(args), Promise.resolve("tweened")) },
  };
  return { ctx, calls };
}

test("morph: theme timing, step signal, factor and duration override", async () => {
  const frame = () => {};
  const { ctx, calls } = stubCtx();
  assert.equal(await morph({ signal }, ctx, frame), "tweened");
  const [from, to, fn, opts] = calls[0];
  assert.deepEqual([from, to, fn], [0, 1, frame]);
  assert.equal(opts.duration, 1000, "factor 2 x --sd-duration");
  assert.equal(opts.signal, signal);
  assert.equal(opts.ease(0.25), 0.25, "the theme's --sd-easing (linear here)");

  await morph({ signal }, ctx, frame, { factor: 1 });
  assert.equal(calls[1][3].duration, 500, "factor");
  await morph({ signal }, ctx, frame, { duration: 123 });
  assert.equal(calls[2][3].duration, 123, "an explicit duration wins over the factor");
  await morph({ signal, transition: { duration: 90 } }, ctx, frame);
  assert.equal(calls[3][3].duration, 90, "the step's transition wins over the factor");
  await morph({ signal, transition: { duration: 90 } }, ctx, frame, { duration: 5 });
  assert.equal(calls[4][3].duration, 5, "an explicit duration wins over the transition");
  const { ctx: bare, calls: bareCalls } = stubCtx({});
  await morph({ signal }, bare, frame);
  assert.equal(bareCalls[0][3].duration, 800, "400 ms when the theme has no --sd-duration");
});

test("entrance: draw only for a draw entrance that is not aborted; duration from the entrance, else factor × --sd-duration", () => {
  const { ctx } = stubCtx();
  const draw = entrance({ signal, entrance: { motion: "draw", duration: 700 } }, ctx);
  assert.equal(draw.draw, true);
  assert.equal(draw.duration, 700);
  assert.equal(draw.signal, signal);
  assert.equal(draw.ease(0.5), 0.5);
  assert.deepEqual(Object.keys(draw).sort(), ["draw", "duration", "ease", "signal"]);

  assert.equal(entrance({ signal, entrance: { motion: "draw" } }, ctx).duration, 1000, "2 x --sd-duration by default");
  assert.equal(entrance({ signal, entrance: { motion: "draw" } }, ctx, { factor: 3 }).duration, 1500, "factor");
  assert.equal(entrance({ signal, entrance: { motion: "draw", duration: 0 } }, ctx).duration, 0, "a zero entrance duration is kept");
  assert.equal(entrance({ signal, transition: { duration: 90 }, entrance: { motion: "draw" } }, ctx).duration, 90, "the step's transition when the entrance has no duration");

  assert.equal(entrance({ signal, entrance: { motion: "none" } }, ctx).draw, false);
  assert.equal(entrance({ signal, entrance: null }, ctx).draw, false);
  assert.equal(entrance({ signal }, ctx).draw, false);
  assert.equal(entrance({ signal: aborted, entrance: { motion: "draw" } }, ctx).draw, false, "an aborted step does not draw");
  assert.equal(entrance({ entrance: { motion: "draw" } }, ctx).draw, true, "no signal: nothing aborted");
});

test("undraw hides a path along its length and leaves one without length alone", () => {
  const style = {};
  undraw({ getTotalLength: () => 120, style });
  assert.deepEqual(style, { strokeDasharray: "120 120", strokeDashoffset: "120" });
  const empty = {};
  undraw({ getTotalLength: () => 0, style: empty });
  assert.deepEqual(empty, {});
  const none = {};
  undraw({ style: none });
  assert.deepEqual(none, {});
});

test("chartKit: frozen, exactly the public names", () => {
  assert.ok(Object.isFrozen(chartKit));
  assert.deepEqual(Object.keys(chartKit).sort(), [
    "band", "canvasLayer", "dot", "drawOrder", "entrance", "extentOf", "fit", "focusPaint", "frame", "halo", "keyed",
    "loadTable", "morph", "paintLines", "rank", "rule", "settle", "splitAt", "spread", "swarm", "textColor",
    "tickFormat", "tweenColor", "undraw", "whisker", "wrapLabel",
  ]);
  assert.equal(Object.keys(chartKit).length, 26);
  for (const [name, value] of Object.entries(chartKit)) assert.equal(typeof value, "function", name);
});

test("controller gives every component and child ctx.chart === chartKit", async () => {
  const seen = [];
  const child = {
    mount(el, props, ctx) {
      seen.push(["child", ctx.chart]);
      return {};
    },
  };
  const parent = {
    async mount(el, props, ctx) {
      seen.push(["parent", ctx.chart]);
      await ctx.mount("child", { id: "inside" }, {});
      return {};
    },
  };
  const modules = { parent, child };
  const registry = {
    async get(name) {
      if (!(name in modules)) throw new Error(`unknown component '${name}'`);
      return modules[name];
    },
    async schema() { return {}; },
  };
  const ctxBase = { setVisible() {}, load: async () => ({}), format: makeFormat("en"), t: (k) => k, capture: false, tokens: {}, palette: () => null };
  const slide = { id: "s", elements: [{ id: "a", type: "parent", props: {} }, { id: "b", type: "child", props: {} }], steps: [{ id: "s0" }] };
  const c = new SlideController({ slide, registry, ctxBase, mountPoint: (id) => ({ id }) });
  await c.mount();
  assert.deepEqual(c.errors, []);
  assert.deepEqual(seen.map(([who]) => who).sort(), ["child", "child", "parent"], "the parent, its child and a top-level element");
  for (const [who, chart] of seen) assert.equal(chart, chartKit, `${who} ctx.chart`);
});
