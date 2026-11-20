// Abort-aware animation helpers (spec §6.3, `ctx.animate`).
//
// Every helper takes `{ duration, signal }` and returns a promise that always settles. Abort and
// `duration <= 0` never reject: the helper jumps to its end state and resolves. The only rejection is
// an error thrown by the caller's own code (a tween onValue, a stagger fn, a broken element): the
// animation stops and the error propagates, so the controller records it as that element's error. They work on DOM nodes and on plain objects with a `style` object, and
// use requestAnimationFrame when present, else a ~60 fps timer (so they run in Node).

const DEFAULT_DURATION = 400;
const DEFAULT_STAGGER = 60;

export const easeCubicInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const now = () => globalThis.performance?.now() ?? Date.now();

function frame(cb) {
  if (typeof globalThis.requestAnimationFrame === "function") {
    const id = globalThis.requestAnimationFrame(cb);
    return () => globalThis.cancelAnimationFrame?.(id);
  }
  const id = setTimeout(() => cb(now()), 16);
  return () => clearTimeout(id);
}

const durationOf = (opts) => (opts?.duration === undefined ? DEFAULT_DURATION : Number(opts.duration) || 0);

/** Resolves after `ms`, or at once when ms <= 0 or the signal aborts. */
export function wait(ms, signal) {
  if (!(ms > 0) || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(id);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const id = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

/**
 * tween(from, to, onValue, { duration, signal, ease }) -> Promise<void>
 * Numbers only. onValue is called once per frame with the eased value and always last with `to`.
 * Always settles: if onValue throws (on any call), the tween stops at once and the promise rejects
 * with that error, so a component's update fails visibly instead of hanging.
 */
export async function tween(from, to, onValue, opts = {}) {
  const duration = durationOf(opts);
  const { signal } = opts;
  const ease = opts.ease ?? easeCubicInOut;
  if (!(duration > 0) || signal?.aborted) {
    onValue(to);
    return;
  }
  return new Promise((resolve, reject) => {
    let cancel = null;
    let finished = false;
    const stop = () => {
      finished = true;
      cancel?.();
      signal?.removeEventListener("abort", finish);
    };
    const fail = (error) => {
      stop();
      reject(error);
    };
    function finish() {
      if (finished) return;
      stop();
      try {
        onValue(to);
        resolve();
      } catch (error) {
        reject(error);
      }
    }
    const start = now();
    const tick = () => {
      if (finished) return;
      const t = (now() - start) / duration;
      if (t >= 1) return finish();
      try {
        onValue(from + (to - from) * ease(Math.max(0, t)));
      } catch (error) {
        return fail(error);
      }
      cancel = frame(tick);
    };
    try {
      onValue(from);
    } catch (error) {
      return fail(error);
    }
    signal?.addEventListener("abort", finish, { once: true });
    cancel = frame(tick);
  });
}

const styleOf = (el) => (el.style ??= {});

/** Fades opacity from 0 to 1. End state: opacity "1". */
export async function fadeIn(el, opts = {}) {
  const style = styleOf(el);
  return tween(0, 1, (v) => (style.opacity = String(v)), opts);
}

/** Wipes the element in from the left with clip-path. End state: no clip-path. */
export async function reveal(el, opts = {}) {
  const style = styleOf(el);
  return tween(100, 0, (v) => (style.clipPath = v <= 0 ? "" : `inset(0 ${v}% 0 0)`), opts);
}

/** Draws an SVG path along its length with stroke-dashoffset. End state: no dash styles. */
export async function drawPath(path, opts = {}) {
  const style = styleOf(path);
  const length = typeof path.getTotalLength === "function" ? Number(path.getTotalLength()) || 0 : 0;
  const clear = () => {
    style.strokeDasharray = "";
    style.strokeDashoffset = "";
  };
  if (!(length > 0)) {
    clear();
    return Promise.resolve();
  }
  style.strokeDasharray = `${length} ${length}`;
  return tween(length, 0, (v) => {
    if (v <= 0) clear();
    else style.strokeDashoffset = String(v);
  }, opts);
}

/**
 * stagger(items, fn, { duration, signal, stagger }) -> Promise<void>
 * Starts fn(item, i, { duration, signal }) for item i after i * stagger ms (default 60 ms;
 * 0 when duration is 0). On abort every pending item starts at once with the aborted signal,
 * so helpers inside fn snap to their end state. Waits for every item; if any fn throws, it then
 * rejects with the first error.
 */
export async function stagger(items, fn, opts = {}) {
  const duration = durationOf(opts);
  const step = duration > 0 ? (opts.stagger ?? DEFAULT_STAGGER) : 0;
  const { signal } = opts;
  const results = await Promise.allSettled(
    Array.from(items, (item, i) => wait(i * step, signal).then(() => fn(item, i, { duration, signal }))),
  );
  const failed = results.find((r) => r.status === "rejected");
  if (failed) throw failed.reason;
}

/**
 * clearInlineStyle(...nodes): removes every inline style and the `style` attribute itself, so a node's
 * markup after a played step equals its markup after a jump. Null nodes are skipped; plain objects with
 * a `style` object (Node tests) just get an empty style.
 * Chrome syncs the `style` attribute lazily after a CSSOM write, and removing a stale attribute leaves an
 * empty style="" behind once the sync lands; reading the attribute first forces the sync.
 */
export function clearInlineStyle(...nodes) {
  for (const node of nodes) {
    if (!node?.style) continue;
    node.style.cssText = "";
    if (typeof node.getAttribute !== "function") continue;
    if (node.getAttribute("style") !== null) node.removeAttribute("style");
  }
}

// Shared component motions. Not part of ctx.animate: they take the component's `animate` (ctx.animate),
// so a test that stubs ctx.animate stubs them too.

/** Rises `node` into place while fading it in. End state: opacity "1", no transform. */
export const rise = (animate, node, opts) =>
  animate.tween(0, 1, (t) => {
    node.style.opacity = String(t);
    node.style.transform = t >= 1 ? "" : `translateY(calc(var(--sd-space) * ${1 - t}))`;
  }, opts);

export const TYPE_MS_PER_CHAR = 28; // typing speed, capped at TYPE_MAX_MS
export const TYPE_MAX_MS = 1400;
/** How long typing `chars` characters takes. */
export const typingMs = (chars) => Math.min(TYPE_MAX_MS, chars * TYPE_MS_PER_CHAR);

/** Types `total` characters: onCount(n) with a whole count n, at a constant speed. */
export const typeCount = (animate, total, onCount, opts) =>
  animate.tween(0, total, (v) => onCount(Math.round(v)), { ...opts, ease: (t) => t });

export const animate = { fadeIn, reveal, drawPath, tween, stagger };
export default animate;
