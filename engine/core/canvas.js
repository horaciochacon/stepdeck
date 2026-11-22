// Canvas layers and the signature hasher, shared by the chart code (core/chart-marks.js) and the components that
// stack canvases of their own: `canvasLayer` places a canvas under an element's SVG (several, by name), and
// `signature` hashes what was painted into 8 hex digits, so a dump can stand in for the pixels.

/**
 * The canvas layers of an element: `canvas.sd-canvas-layer` children, each placed absolutely at `left`/`top` (the
 * plot's origin, in the element's pixels) with a CSS size of `pw` x `ph`. Its backing store is that size times
 * min(`maxRatio`, devicePixelRatio), and its 2D context is scaled to match, so callers draw in plot pixels.
 * Without `name` it is the element's one unnamed layer, and ignores the named ones. With `name`, the layer is
 * `canvas.sd-canvas-layer[data-layer=<name>]`: one per name. A new layer goes right after the element's last
 * canvas layer (as its first child when there is none), so the order of creation is the order of stacking. The
 * SVG sibling painted over them needs no z-index: `.sd-canvas-layer ~ svg` is positioned (core/stepdeck.css).
 * Idempotent: the same call changes nothing; a call that changes the size clears the canvas, so paint again
 * after it (`paintLines`). A raster that costs more per pixel than a vector draw passes `maxRatio: 1`.
 * @param {HTMLElement} el
 * @param {{ left: number, top: number, pw: number, ph: number, name?: string, maxRatio?: number }} plot
 * @returns {HTMLCanvasElement}
 */
export function canvasLayer(el, { left, top, pw, ph, name, maxRatio = 3 }) {
  const layers = [...el.children].filter((c) => c.localName === "canvas" && c.classList.contains("sd-canvas-layer"));
  let canvas = layers.find((c) => (c.getAttribute("data-layer") ?? undefined) === name);
  if (!canvas) {
    canvas = el.ownerDocument.createElement("canvas");
    canvas.setAttribute("class", "sd-canvas-layer");
    if (name !== undefined) canvas.setAttribute("data-layer", name);
    const last = layers.at(-1);
    el.insertBefore(canvas, last ? last.nextSibling : el.firstChild);
  }
  const ratio = Math.min(maxRatio, el.ownerDocument.defaultView?.devicePixelRatio || 1);
  const [bw, bh] = [Math.round(pw * ratio), Math.round(ph * ratio)];
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  canvas.style.left = `${left}px`;
  canvas.style.top = `${top}px`;
  canvas.style.width = `${pw}px`;
  canvas.style.height = `${ph}px`;
  canvas.getContext("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);
  return canvas;
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const DIGITS = new Uint8Array(16);

/**
 * A 32-bit FNV-1a hasher over UTF-16 code units, fed piece by piece so the text it stands for is never built:
 * `text(s)` hashes the code units of `s`, `char(code)` one code unit, `tenth(v)` the characters of
 * `${Math.round(v * 10) / 10}` (a value rounded to 0.1, "-0" being "0"), and `hex()` gives the hash so far as 8 hex
 * digits (it does not reset). The same feeds in the same order always give the same hash.
 * @returns {{ text(s: string): void, tenth(v: number): void, char(code: number): void, hex(): string }}
 */
export function signature() {
  let h = FNV_OFFSET;
  const text = (s) => {
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), FNV_PRIME);
  };
  const char = (code) => {
    h = Math.imul(h ^ code, FNV_PRIME);
  };
  const tenth = (v) => {
    const k = Math.round(v * 10);
    // A tenth is written as its integer digits, then "." and one digit unless it is zero; "-" first when negative
    // (-0 is written "0", as String does). Beyond 1e15 tenths, String's own spelling.
    if (!(Math.abs(k) < 1e15)) return text(String(k / 10));
    if (k < 0) char(45); // "-"
    const n = Math.abs(k);
    const frac = n % 10;
    let whole = (n - frac) / 10;
    let count = 0;
    do {
      const d = whole % 10;
      DIGITS[count++] = d;
      whole = (whole - d) / 10;
    } while (whole > 0);
    while (count > 0) char(48 + DIGITS[--count]);
    if (frac) {
      char(46); // "."
      char(48 + frac);
    }
  };
  return { text, tenth, char, hex: () => (h >>> 0).toString(16).padStart(8, "0") };
}
