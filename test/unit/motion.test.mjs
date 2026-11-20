import { test } from "node:test";
import assert from "node:assert/strict";
import { easeCubicInOut } from "#engine/core/animate.js";
import {
  MOTION_NAMES,
  makeMotion,
  motionIn,
  motionOut,
  parseEase,
  prepareIn,
  restoreInline,
  timing,
} from "#engine/core/motion.js";

const node = (style = {}) => ({ style });

test("each name ends at no inline motion styles after motionIn", async () => {
  for (const name of MOTION_NAMES) {
    const n = node();
    const before = { ...n.style };
    await motionIn(n, name, { duration: 30 });
    assert.deepEqual(n.style, before, name);
  }
});

test("motionIn restores pre-existing inline values", async () => {
  const n = node({ left: "10px", top: "20px", opacity: "" });
  await motionIn(n, "rise", { duration: 30 });
  assert.equal(n.style.left, "10px");
  assert.equal(n.style.top, "20px");
  assert.equal(n.style.opacity, "");
  const m = node({ opacity: "0.5", transform: "rotate(1deg)", clipPath: "inset(0)" });
  await motionIn(m, "pop", { duration: 30 });
  assert.deepEqual(m.style, { opacity: "0.5", transform: "rotate(1deg)", clipPath: "inset(0)" });
});

test("prepareIn writes the start state synchronously", () => {
  const fade = node();
  prepareIn(fade, "fade", {});
  assert.equal(fade.style.opacity, "0");
  const rise = node();
  prepareIn(rise, "rise", { distance: 24 });
  assert.equal(rise.style.opacity, "0");
  assert.ok(rise.style.transform.includes("translateY(24px)"));
  const wipe = node();
  prepareIn(wipe, "wipe", {});
  assert.ok(wipe.style.clipPath.startsWith("inset("));
  const pop = node();
  prepareIn(pop, "pop", {});
  assert.equal(pop.style.opacity, "0");
  assert.ok(pop.style.transform.includes("scale(0.92)"));
});

test("motionIn plays between the start and end states", async () => {
  const n = node();
  const snapshot = prepareIn(n, "rise", { distance: 24 });
  const seen = [];
  const p = motionIn(n, "rise", { duration: 400, distance: 24, snapshot });
  await new Promise((r) => setTimeout(r, 100));
  seen.push(Number(n.style.opacity));
  await p;
  assert.ok(seen[0] > 0 && seen[0] < 1, `mid opacity ${seen[0]}`);
  assert.deepEqual(n.style, {});
});

test("motionOut leaves the out end state and returns the snapshot", async () => {
  const n = node({ left: "1px", opacity: "0.8" });
  const snapshot = await motionOut(n, "fade", { duration: 30 });
  assert.equal(n.style.opacity, "0");
  assert.deepEqual(snapshot, { opacity: "0.8", transform: undefined, clipPath: undefined });
  restoreInline(n, snapshot);
  assert.deepEqual(n.style, { left: "1px", opacity: "0.8" });
  for (const name of ["rise", "wipe", "pop"]) {
    const m = node();
    await motionOut(m, name, { duration: 30, distance: 24 });
    assert.notDeepEqual(m.style, {}, name);
  }
});

test("restoreInline removes the style attribute only when it ends up empty", () => {
  const attrs = { style: "opacity: 0;" };
  const n = {
    style: { length: 0, opacity: "0" },
    getAttribute: (k) => attrs[k] ?? null,
    removeAttribute: (k) => delete attrs[k],
  };
  restoreInline(n, { opacity: "", transform: "", clipPath: "" });
  assert.equal(attrs.style, undefined);
  const kept = { style: { length: 1, left: "1px" }, getAttribute: () => "left: 1px;", removeAttribute: () => assert.fail("kept") };
  restoreInline(kept, { opacity: "", transform: "", clipPath: "" });
});

test("abort jumps to the end and resolves", async () => {
  const controller = new AbortController();
  controller.abort();
  const n = node({ opacity: "0.5" });
  await motionIn(n, "fade", { duration: 1000, signal: controller.signal });
  assert.deepEqual(n.style, { opacity: "0.5" });
  const m = node();
  await motionOut(m, "fade", { duration: 1000, signal: controller.signal });
  assert.equal(m.style.opacity, "0");
});

test("none touches nothing; draw enters as a wipe and leaves as a fade on a node", async () => {
  const n = node({ left: "5px" });
  assert.deepEqual(prepareIn(n, "none", {}), { opacity: undefined, transform: undefined, clipPath: undefined });
  await motionIn(n, "none", { duration: 30 });
  const out = await motionOut(n, "none", { duration: 30 });
  assert.deepEqual(n.style, { left: "5px" });
  assert.equal(out.opacity, undefined);
  const a = node();
  const b = node();
  prepareIn(a, "draw", {});
  prepareIn(b, "wipe", {});
  assert.deepEqual(a.style, b.style);
  const c = node();
  const f = node();
  await motionOut(c, "draw", { duration: 0 });
  await motionOut(f, "fade", { duration: 0 });
  assert.deepEqual(c.style, f.style);
  assert.deepEqual(c.style, { opacity: "0" }, "a draw exit fades: no clip-path");
});

test("exits follow the design: rise leaves upwards, pop shrinks to 0.96", async () => {
  const rise = node();
  await motionOut(rise, "rise", { duration: 0, distance: 24 });
  assert.deepEqual(rise.style, { opacity: "0", transform: "translateY(-24px)" });
  const pop = node();
  await motionOut(pop, "pop", { duration: 0 });
  assert.deepEqual(pop.style, { opacity: "0", transform: "scale(0.96)" });
  // Early in a long linear rise exit the box is already above its place and not yet at the end. The exit lasts
  // 1000 ms and is sampled at about 150 ms, so even a late timer samples it well before the end.
  const early = node();
  const seen = [];
  const linear = (t) => t;
  const p = motionOut(early, "rise", { duration: 1000, distance: 24, ease: linear });
  await new Promise((r) => setTimeout(r, 150));
  seen.push(early.style.transform);
  await p;
  const y = Number(/translateY\((-?[\d.]+)px\)/.exec(seen[0])[1]);
  assert.ok(y < 0 && y > -24, `mid-exit the rise box is above its place, on its way up (${seen[0]})`);
  // The entrances are unchanged: rise comes up from below, pop grows from 0.92.
  const inRise = node();
  prepareIn(inRise, "rise", { distance: 24 });
  assert.equal(inRise.style.transform, "translateY(24px)");
  const inPop = node();
  prepareIn(inPop, "pop", {});
  assert.equal(inPop.style.transform, "scale(0.92)");
});

test("unknown name throws the listed message", async () => {
  const message = "unknown motion 'zoom' (motions: fade, rise, wipe, pop, draw, none)";
  assert.throws(() => prepareIn(node(), "zoom", {}), { message });
  await assert.rejects(motionIn(node(), "zoom", {}), { message });
  await assert.rejects(motionOut(node(), "zoom", {}), { message });
});

test("parseEase reads cubic-bezier, linear, and falls back to cubic in-out", () => {
  const f = parseEase("cubic-bezier(0.65, 0, 0.35, 1)");
  assert.equal(f(0), 0);
  assert.equal(f(1), 1);
  assert.ok(Math.abs(f(0.5) - 0.5) < 0.01);
  let prev = -1;
  for (let i = 0; i <= 10; i++) {
    const v = f(i / 10);
    assert.ok(v >= prev, `monotone at ${i}`);
    prev = v;
  }
  assert.equal(parseEase("linear")(0.3), 0.3);
  assert.equal(parseEase("nonsense")(0.25), easeCubicInOut(0.25));
  assert.equal(parseEase()(0.25), easeCubicInOut(0.25));
  assert.equal(parseEase("")(0.25), easeCubicInOut(0.25));
});

test("timing reads tokens and the step's transition", () => {
  const tokens = { "--sd-duration": "400ms", "--sd-stagger": "80ms", "--sd-duration-fast": "200ms", "--sd-easing": "linear" };
  const signal = new AbortController().signal;
  const base = timing(tokens, { transition: null, signal });
  assert.equal(base.duration, 400);
  assert.equal(base.stagger, 80);
  assert.equal(base.signal, signal);
  assert.equal(base.ease(0.3), 0.3);
  assert.equal(timing(tokens, { transition: null }, { factor: 2 }).duration, 800);
  assert.equal(timing(tokens, { transition: null }, { fast: true }).duration, 200);
  const zero = timing(tokens, { transition: { duration: 0 } });
  assert.equal(zero.duration, 0);
  assert.equal(zero.stagger, 0);
  assert.equal(timing(tokens, { transition: { stagger: 30 } }).stagger, 30);
  const bare = timing({}, {});
  assert.equal(bare.duration, 400);
  assert.equal(bare.stagger, 60);
  assert.equal(timing({}, {}, { fast: true }).duration, 200);
});

test("makeMotion fills the theme's distance and exposes names and timing", async () => {
  const motion = makeMotion({ "--sd-motion-distance": "16px", "--sd-stagger": "80ms" });
  assert.deepEqual(motion.names, MOTION_NAMES);
  assert.equal(motion.timing({ transition: null }).stagger, 80);
  const n = node();
  const p = motion.in(n, "rise", { duration: 60 });
  await p;
  assert.deepEqual(n.style, {});
  const m = node();
  await motion.out(m, "rise", { duration: 0 });
  assert.equal(m.style.transform, "translateY(-16px)");
  const d = node();
  await makeMotion({}).out(d, "rise", { duration: 0 });
  assert.equal(d.style.transform, "translateY(-24px)");
});

test("makeMotion ignores undefined options, so the theme's duration, ease and distance apply", async () => {
  const motion = makeMotion({ "--sd-duration": "0ms", "--sd-motion-distance": "16px" });
  const n = node();
  const p = motion.out(n, "rise", { duration: undefined, ease: undefined, distance: undefined, signal: undefined });
  // A 0 ms theme duration snaps on the first call: the out end state is already written.
  assert.equal(n.style.opacity, "0", "the theme's 0 ms duration, not the 400 ms tween default");
  assert.equal(n.style.transform, "translateY(-16px)");
  await p;
  const m = node();
  await motion.in(m, "fade", { duration: undefined });
  assert.deepEqual(m.style, {});
});
