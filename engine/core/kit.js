// Small helpers shared by the engine and the built-in components. A leaf module: no imports, no d3, and
// no DOM access beyond the document a caller passes in.

/** An error's message, or the thrown value as a string. */
export const message = (e) => e?.message ?? String(e);

/** Escapes text for HTML content and attribute values. */
export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * map.get(key), else the promise make() returns, stored under key; a promise that rejects is evicted (if
 * still the one stored), so a later call retries. Concurrent calls share one promise.
 */
export function memoAsync(map, key, make) {
  if (!map.has(key)) {
    const p = make();
    map.set(key, p);
    p.catch(() => {
      if (map.get(key) === p) map.delete(key);
    });
  }
  return map.get(key);
}

export const SVG_NS = "http://www.w3.org/2000/svg";
export const XHTML_NS = "http://www.w3.org/1999/xhtml";

/** parseFloat(v) when it is a finite number, else `fallback` (theme token values such as "8px"). */
export const num = (v, fallback) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (t) => Math.min(1, Math.max(0, t));

/** An svg element with `attrs` (stringified), appended to `parent` when given. */
export function svgEl(doc, tag, attrs = {}, parent) {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

/** An html element with class `cls` (when given) and text (when given), appended to `parent` when given. */
export function el(doc, tag, cls, parent, text) {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  parent?.appendChild(node);
  return node;
}

/** An XHTML element for a foreignObject, with class `cls`, appended to `parent` when given. */
export function xhtmlEl(doc, tag, cls, parent) {
  const node = doc.createElementNS(XHTML_NS, tag);
  node.setAttribute("class", cls);
  parent?.appendChild(node);
  return node;
}

/** Sizes an svg to w x h canvas pixels, with a matching viewBox (no scaling). */
export function sizeSvg(svg, w, h) {
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
}

/** The element's size in canvas pixels, else the size the controller measured at mount, else 0. */
export const measureWidth = (node, ctx) => node.offsetWidth || ctx.size?.w || 0;
export const measureHeight = (node, ctx) => node.offsetHeight || ctx.size?.h || 0;

/** Whether an update plays motion: the engine asked for it and the step was not aborted yet. */
export const canAnimate = (info) => info.animate === true && !info.signal?.aborted;

/**
 * The { duration, ease, signal, ... } every ctx.animate helper takes. With a `ctx` (the component's own) it is
 * the theme's timing for this step (ctx.motion.timing(info, opts): `--sd-duration`, `--sd-easing`, ...,
 * overridden by info.transition). Without one it is { signal, duration: info.transition?.duration }, where an
 * undefined duration means the helper's default.
 */
export const motion = (info, ctx, opts) =>
  ctx?.motion?.timing ? ctx.motion.timing(info, opts) : { signal: info.signal, duration: info.transition?.duration };

/** The transition's duration, else `factor` x the theme's --sd-duration (400 ms when unknown). */
export const motionMs = (info, ctx, factor = 1) => info.transition?.duration ?? factor * num(ctx.tokens?.["--sd-duration"], 400);

/** Text color between the muted (p = 0) and the full ink (p = 1) theme color. */
export const inkMix = (p) => `color-mix(in srgb, var(--sd-color-ink) ${p * 100}%, var(--sd-color-muted))`;

/**
 * The color a mark has when it is not in focus: the theme's `--sd-color-dim` (resolved, from ctx.tokens) when
 * `dimmed`, else `color`. A theme without that token falls back to `--sd-color-rule`; without tokens the
 * color is kept. Marks dim by color, never by opacity, so a dimmed mark stays opaque.
 */
export function focusPaint(ctx, color, dimmed) {
  if (!dimmed) return color;
  const t = ctx?.tokens;
  return t?.["--sd-color-dim"]?.trim() || t?.["--sd-color-rule"]?.trim() || color;
}

/**
 * Tweens a color from `from` to `to` in RGB (ctx.d3), calling set(color) each frame and last with `to` exactly
 * as given, through ctx.animate.tween. `opts` is { duration, ease, signal }, as ctx.motion.timing returns.
 * Equal colors set once. A value that is not a color ("none") counts as the other end's color at zero opacity,
 * so a missing fill fades in and out. Two values that are not colors, zero duration and an abort set `to` at
 * once. Always settles; rejects only when `set` throws.
 */
export async function tweenColor(ctx, from, to, set, opts = {}) {
  if (from === to) return set(to);
  const { d3 } = ctx;
  const a = d3.color(from);
  const b = d3.color(to);
  if (!a && !b) return set(to);
  const clear = (c) => Object.assign(c.copy(), { opacity: 0 });
  const mix = d3.interpolateRgb(a ?? clear(b), b ?? clear(a));
  return ctx.animate.tween(0, 1, (t) => set(t >= 1 ? to : mix(t)), opts);
}
