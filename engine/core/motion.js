// Named motions: the one vocabulary for how things enter and leave (fade, rise, wipe, pop, draw, none).
//
// The helpers write only `opacity`, `transform` and `clip-path` on a node's inline style and put those back
// exactly when an entrance ends, so a node's markup after a played step equals its markup after a jump.
// They work on DOM nodes and on plain objects with a `style` object, and are built on `tween` from
// ./animate.js: abort and a zero duration jump to the end state and resolve, they never reject.

import { easeCubicInOut, tween } from "./animate.js";

export const MOTION_NAMES = Object.freeze(["fade", "rise", "wipe", "pop", "draw", "none"]);

const DEFAULT_DURATION = 400;
const DEFAULT_DURATION_FAST = 200;
const DEFAULT_STAGGER = 60;
const DEFAULT_DISTANCE = 24;
const POP_SCALE = 0.92; // a pop enters from this scale
const POP_OUT_SCALE = 0.96; // and leaves shrinking to this one
const POP_OVERSHOOT = 1.2;
const PROPS = ["opacity", "transform", "clipPath"];

/** A number from a token such as "400ms", "0.4s" or "24px"; `fallback` when it does not parse. */
function tokenNumber(value, unit, fallback) {
  const m = /^(-?\d*\.?\d+)\s*(ms|s|px)?$/.exec(String(value ?? "").trim());
  if (!m) return fallback;
  const n = Number(m[1]);
  if (unit === "ms") return m[2] === "s" ? n * 1000 : n;
  return n;
}

// Easing

function cubicBezier(x1, y1, x2, y2) {
  const coord = (a, b, t) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t * t + t ** 3;
  const slope = (a, b, t) => 3 * a * (1 - t) ** 2 + 6 * (b - a) * (1 - t) * t + 3 * (1 - b) * t * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = coord(x1, x2, t) - x;
      if (Math.abs(err) < 1e-6) return coord(y1, y2, t);
      const d = slope(x1, x2, t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const err = coord(x1, x2, t) - x;
      if (Math.abs(err) < 1e-6) break;
      if (err > 0) hi = t;
      else lo = t;
      t = (lo + hi) / 2;
    }
    return coord(y1, y2, t);
  };
}

/** An easing function from a CSS timing value: `cubic-bezier(x1, y1, x2, y2)`, `linear`, else cubic in-out. */
export function parseEase(value) {
  const text = String(value ?? "").trim();
  if (text === "linear") return (t) => t;
  const m = /^cubic-bezier\(\s*([^,]+),([^,]+),([^,]+),([^,)]+)\)$/.exec(text);
  if (m) {
    const [x1, y1, x2, y2] = m.slice(1).map(Number);
    if ([x1, y1, x2, y2].every(Number.isFinite) && x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1) {
      return cubicBezier(x1, y1, x2, y2);
    }
  }
  return easeCubicInOut;
}

// Timing

/**
 * timing(tokens, info, { factor = 1, fast = false }) -> { duration, ease, stagger, signal }
 * A step's own `transition` wins over the theme tokens; a zero duration also zeroes the stagger.
 */
export function timing(tokens, info, { factor = 1, fast = false } = {}) {
  const t = tokens ?? {};
  const transition = info?.transition;
  const base = fast
    ? tokenNumber(t["--sd-duration-fast"], "ms", DEFAULT_DURATION_FAST)
    : tokenNumber(t["--sd-duration"], "ms", DEFAULT_DURATION);
  const duration = transition?.duration ?? factor * base;
  const stagger = duration > 0 ? (transition?.stagger ?? tokenNumber(t["--sd-stagger"], "ms", DEFAULT_STAGGER)) : 0;
  return { duration, ease: parseEase(t["--sd-easing"]), stagger, signal: info?.signal };
}

// Motions. `start` is the state an entrance begins in. `enter` and `leave` take p in [0, 1]: for `enter`,
// p = 1 is the shown state; for `leave`, p = 1 is the hidden state. `d` is the travel distance in px.
// A rise enters moving up from d below and leaves moving up by d; a pop enters from 0.92 (with a slight
// overshoot) and leaves shrinking to 0.96; a wipe reveals left to right and leaves clipped from the right.

const clamp01 = (n) => Math.min(1, Math.max(0, n));
// Ease-out with a slight overshoot; 0 at p = 0 and exactly 1 at p = 1.
const back = (p) => {
  const q = p - 1;
  return 1 + (POP_OVERSHOOT + 1) * q ** 3 + POP_OVERSHOOT * q * q;
};

const MOTIONS = {
  fade: {
    start: (style) => {
      style.opacity = "0";
    },
    enter: (style, p) => {
      style.opacity = String(p);
    },
    leave: (style, p) => {
      style.opacity = String(1 - p);
    },
  },
  rise: {
    start: (style, d) => {
      style.opacity = "0";
      style.transform = `translateY(${d}px)`;
    },
    enter: (style, p, d) => {
      style.opacity = String(p);
      style.transform = `translateY(${d * (1 - p)}px)`;
    },
    leave: (style, p, d) => {
      style.opacity = String(1 - p);
      style.transform = `translateY(${-d * p}px)`;
    },
  },
  wipe: {
    start: (style) => {
      style.clipPath = "inset(0 100% 0 0)";
    },
    enter: (style, p) => {
      style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`;
    },
    leave: (style, p) => {
      style.clipPath = `inset(0 ${p * 100}% 0 0)`;
    },
  },
  pop: {
    start: (style) => {
      style.opacity = "0";
      style.transform = `scale(${POP_SCALE})`;
    },
    enter: (style, p) => {
      style.opacity = String(clamp01(p));
      style.transform = `scale(${POP_SCALE + (1 - POP_SCALE) * back(p)})`;
    },
    leave: (style, p) => {
      style.opacity = String(1 - clamp01(p));
      style.transform = `scale(${1 - (1 - POP_OUT_SCALE) * p})`;
    },
  },
  none: null,
};

/**
 * The motion for `name`, entering or leaving (`out`). On a node `draw` enters as a `wipe` and leaves as a
 * `fade` (a component's own build has no reverse). Throws for an unknown name.
 */
function motionFor(name, out = false) {
  if (!MOTION_NAMES.includes(name)) {
    throw new Error(`unknown motion '${name}' (motions: ${MOTION_NAMES.join(", ")})`);
  }
  if (name === "draw") return MOTIONS[out ? "fade" : "wipe"];
  return MOTIONS[name];
}

const distanceOf = (opts) => {
  const d = opts?.distance === undefined ? NaN : Number(opts.distance);
  return Number.isFinite(d) ? d : DEFAULT_DISTANCE;
};

const styleOf = (node) => (node.style ??= {});

function snapshotOf(node) {
  const style = styleOf(node);
  return Object.fromEntries(PROPS.map((prop) => [prop, style[prop]]));
}

/**
 * Writes back exactly the saved opacity, transform and clip-path (an empty string removes one) and removes
 * the `style` attribute only if it ends up empty.
 */
export function restoreInline(node, snapshot) {
  const style = styleOf(node);
  for (const prop of PROPS) {
    if (snapshot[prop] === undefined) delete style[prop];
    else style[prop] = snapshot[prop];
  }
  // Reading the attribute first makes Chrome sync a stale `style` attribute before it is removed.
  if (style.length === 0 && typeof node.getAttribute === "function" && node.getAttribute("style") !== null) {
    node.removeAttribute("style");
  }
}

/** Saves the node's inline opacity, transform and clip-path and writes the motion's start state at once. */
export function prepareIn(node, name, opts = {}) {
  const motion = motionFor(name);
  const snapshot = snapshotOf(node);
  motion?.start(styleOf(node), distanceOf(opts));
  return snapshot;
}

/** Plays `name` to the shown state, then restores the snapshot (made here when none is given). */
export async function motionIn(node, name, opts = {}) {
  const motion = motionFor(name);
  const snapshot = opts.snapshot ?? prepareIn(node, name, opts);
  if (!motion) return;
  const style = styleOf(node);
  const d = distanceOf(opts);
  try {
    await tween(0, 1, (p) => motion.enter(style, p, d), opts);
  } finally {
    restoreInline(node, snapshot);
  }
}

/** Plays `name` to the hidden state and leaves it there. Resolves with the pre-motion snapshot for `restoreInline`. */
export async function motionOut(node, name, opts = {}) {
  const motion = motionFor(name, true);
  const snapshot = snapshotOf(node);
  if (!motion) return snapshot;
  const style = styleOf(node);
  const d = distanceOf(opts);
  await tween(0, 1, (p) => motion.leave(style, p, d), opts);
  return snapshot;
}

/** The `ctx.motion` a theme's tokens give a component: the motions with the theme's defaults filled in. */
export function makeMotion(tokens) {
  const t = tokens ?? {};
  // An option passed as undefined (say, an element without its own duration) keeps the theme's value.
  const withDefaults = (opts) => {
    const given = Object.fromEntries(Object.entries(opts ?? {}).filter(([, v]) => v !== undefined));
    return {
      duration: tokenNumber(t["--sd-duration"], "ms", DEFAULT_DURATION),
      ease: parseEase(t["--sd-easing"]),
      ...given,
      distance: given.distance ?? tokenNumber(t["--sd-motion-distance"], "px", DEFAULT_DISTANCE),
    };
  };
  return {
    in: (node, name, opts) => motionIn(node, name, withDefaults(opts)),
    out: (node, name, opts) => motionOut(node, name, withDefaults(opts)),
    timing: (info, o) => timing(t, info, o),
    names: MOTION_NAMES,
  };
}
