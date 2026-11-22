// core/chart-motion.js (morph, entrance, undraw), the frozen chartKit and ctx.chart in the controller; and the signature
// paintLines (core/chart-marks.js) returns, which needs no canvas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { morph, entrance, undraw } from "#engine/core/chart-motion.js";
import { chartKit, paintLines } from "#engine/core/chart.js";
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
    "axis", "band", "canvasLayer", "classIndex", "classLabels", "colorScale", "dot", "drawOrder", "entrance", "extentOf",
    "fit", "focusPaint", "frame", "halo", "keyed", "legendRow", "lerp", "loadTable", "morph", "paintLines", "rank", "rule",
    "settle", "signature", "splitAt", "spread", "swarm", "textColor", "tickFormat", "tweenColor", "undraw", "whisker",
    "wrapLabel",
  ]);
  assert.equal(Object.keys(chartKit).length, 33);
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

// paintLines' signature, hashed as it goes: the same value as hashing the whole signature text, which it used to build.

/** The signature as paintLines first computed it: the text of every painted line, then FNV-1a of its UTF-16 units. */
function signatureText(lines, { width = 1, alpha = 1 } = {}) {
  const tenth = (v) => Math.round(v * 10) / 10;
  let text = "";
  for (const line of lines) {
    const runs = [];
    let run = [];
    for (const point of Array.isArray(line.points) ? line.points : []) {
      const [x, y] = Array.isArray(point) ? point : [];
      if (Number.isFinite(x) && Number.isFinite(y)) run.push([x, y]);
      else {
        if (run.length) runs.push(run);
        run = [];
      }
    }
    if (run.length) runs.push(run);
    const drawn = runs.filter((r) => r.length >= 2);
    if (!drawn.length) continue;
    const w = tenth(line.width ?? width);
    const a = Math.round((line.alpha ?? alpha) * 1000) / 1000;
    text += `${line.color}|${w}|${a}|${drawn.map((r) => r.map(([x, y]) => `${tenth(x)},${tenth(y)}`).join(";")).join("/")}\n`;
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}

const SIGNATURES = {
  empty: [[], undefined, "811c9dc5"],
  basic: [[{ points: [[0, 0], [10.04, 20.05], [30.15, -4.96]], color: "#1f77b4" }], undefined, "6a84cbfc"],
  negZero: [[{ points: [[-0.04, -0.049], [-0.05, 1], [-0.06, -12.34], [-1234567.891, 0.95]], color: "rgb(10, 20, 30)", alpha: 0.12345, width: 2.25 }], { width: 3, alpha: 0.5 }, "7fe0a19e"],
  gaps: [[
    { points: [[0, 1], [1, null], [2, 3], [3, 4], [4, NaN], [5, 6], [6, Infinity], [7, 8], [8, 9]], color: "red" },
    { points: [[0, 1]], color: "blue" },
    { points: [], color: "green" },
    { points: [[0, null], [1, null]], color: "x" },
    { points: [[1, 2], [3, 4]], color: "hsl(200 50% 40% / 0.5)", alpha: 0.0005, width: 0.04 },
    { points: [[1, 2], [3, 4], [5, 6]], color: "ink ✓ é", alpha: 0.9995, width: 1.05 },
  ], { width: 0.75, alpha: 0.3 }, "b1002e57"],
  big: [[{ points: [[1e15, 2], [123456789012.35, 3], [-9.95, 1e-7], [0.05, -0.05], [99.95, 0.15]], color: "c" }], undefined, "600dc17d"],
};

test("paintLines: the signature is the one the whole text hashes to (values captured before it was hashed as it goes)", () => {
  const canvas = { getContext: () => null };
  for (const [name, [lines, defaults, expected]] of Object.entries(SIGNATURES)) {
    assert.equal(signatureText(lines, defaults), expected, `${name}: the reference`);
    assert.equal(paintLines(canvas, lines, defaults), expected, name);
  }
  // Random lines: rounding edges (x.x5), -0, gaps, huge and tiny values, any colour text.
  let seed = 7;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const pick = () => {
    const r = rnd();
    if (r < 0.05) return r < 0.03 ? null : NaN;
    if (r < 0.1) return -0.04 * rnd();
    if (r < 0.2) return Math.round(rnd() * 2000) * 0.05 - 50;
    if (r < 0.25) return (rnd() - 0.5) * 1e16;
    return (rnd() - 0.5) * 4000;
  };
  for (let k = 0; k < 300; k++) {
    const lines = Array.from({ length: 1 + Math.floor(rnd() * 3) }, (_, j) => ({
      points: Array.from({ length: Math.floor(rnd() * 10) }, () => [pick(), pick()]),
      color: ["red", "rgb(1, 2, 3)", "é✓", ""][j % 4],
      ...(rnd() < 0.5 ? { width: rnd() * 5, alpha: rnd() } : {}),
    }));
    assert.equal(paintLines(canvas, lines), signatureText(lines), `random case ${k}`);
  }
});
