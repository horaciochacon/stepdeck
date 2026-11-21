// The DOM half of the chart building blocks: the plot frame, keyed joins, the end-state cleanup, the
// marks (dots, whiskers, rules, halos, interval bands) and the canvas layer. chart.line and chart.bar
// are built on it, and so can a custom component be: it reaches them as `ctx.chart` (core/chart.js).
//
// Everything takes d3 selections (or plain values) and writes attributes only; colours and sizes come
// from the caller, which takes them from theme tokens and `ctx.palette()`. The generic mark classes
// (`sd-dot`, `sd-whisker-*`, `sd-rule`, `sd-halo`, `sd-halo-under`, `sd-canvas-layer`) are styled by
// theme tokens in core/stepdeck.css. Nothing here reads `window` or `document` at load time.
import { d3 } from "./d3.js";
import { num, measureWidth, measureHeight } from "./kit.js";

/** A value, or an accessor `(d, i, nodes) => value` called with `this` set to the node, as d3 does. */
const read = (value, node, d, i, nodes) => (typeof value === "function" ? value.call(node, d, i, nodes) : value);

/**
 * The plot frame of an element: its size, the label font and the margins around the plot.
 * `font` is `--sd-font-size-label` (28 when the theme has none) and `charW` is 0.6 x font, a width for
 * sizing margins from character counts, so layout never depends on font timing. `margin` is
 * `{ left, right, top, bottom }` or a function of `{ font, charW, w, h }` that returns it; each side is
 * rounded. `pw` and `ph` are the plot's size in canvas pixels, at least 1.
 * @param {HTMLElement} el
 * @param {object} ctx
 * @param {{ left: number, right: number, top: number, bottom: number } | ((m: { font: number, charW: number, w: number, h: number }) => { left: number, right: number, top: number, bottom: number })} margin
 * @returns {{ w: number, h: number, font: number, charW: number, margin: { left: number, right: number, top: number, bottom: number }, pw: number, ph: number }}
 */
export function frame(el, ctx, margin) {
  const font = num(ctx.tokens?.["--sd-font-size-label"], 28);
  const charW = font * 0.6;
  const w = measureWidth(el, ctx);
  const h = measureHeight(el, ctx);
  const m = typeof margin === "function" ? margin({ font, charW, w, h }) : margin;
  const rounded = { left: Math.round(m.left), right: Math.round(m.right), top: Math.round(m.top), bottom: Math.round(m.bottom) };
  return { w, h, font, charW, margin: rounded, pw: Math.max(1, w - rounded.left - rounded.right), ph: Math.max(1, h - rounded.top - rounded.bottom) };
}

/**
 * A keyed join whose update and exit only toggle `.sd-exiting`: an update clears it, an exit sets it, and
 * nothing is removed (leavers stay until `settle`, so a morph can fade them out). `enter` takes the enter
 * selection and returns the new nodes, as in `selection.join`.
 * @param {import("d3").Selection<any, any, any, any>} selection
 * @param {any[]} data
 * @param {(d: any, i: number, nodes: any) => string | number} key
 * @param {(enter: import("d3").Selection<any, any, any, any>) => import("d3").Selection<any, any, any, any>} enter
 */
export function keyed(selection, data, key, enter) {
  return selection.data(data, key).join(enter, (update) => update.classed("sd-exiting", false), (exit) => exit.classed("sd-exiting", true));
}

/**
 * The start of an end-state write: removes the `.sd-exiting` nodes under `root` (and the `halo` copies of
 * them), drops every `style` and `opacity` attribute under it (what animation leaves behind), and marks every
 * node that remains as seen (`node.__sdSeen = true`: a later morph treats it as already on screen, not
 * entering). `root` is a node or a d3 selection of one. Apply it to the SVG root, never to the element box: the
 * canvas layer keeps its inline size and position. Order of an update: the `keyed` joins first (they mark the
 * leavers), then `settle`, then every attribute; a `settle` before the joins leaves the leavers on screen.
 * @param {Element | import("d3").Selection<any, any, any, any>} root
 */
export function settle(root) {
  const svg = d3.select(typeof root?.node === "function" ? root.node() : root);
  svg.selectAll(".sd-exiting").each(function () {
    this.__sdHaloUnder?.remove();
  }).remove();
  svg.selectAll("[style]").attr("style", null);
  svg.selectAll("[opacity]").attr("opacity", null);
  svg.selectAll("*").each(function () {
    this.__sdSeen = true;
  });
}

/**
 * Dots: adds class `sd-dot` (and `sd-dot-hollow` when hollow) and sets `r`. A filled dot takes `fill` = color
 * (the CSS outlines it in the background colour); a hollow one takes `stroke` = color (the CSS fills it with
 * the background colour). The paint attribute of the other kind is cleared, so a dot that changes kind leaves
 * nothing behind. Positions are the caller's. Every option may be a value or an accessor.
 * @param {import("d3").Selection<any, any, any, any>} selection
 * @param {{ r: number | Function, color: string | Function, hollow?: boolean | Function }} options
 */
export function dot(selection, { r, color, hollow = false }) {
  selection.each(function (d, i, nodes) {
    const isHollow = Boolean(read(hollow, this, d, i, nodes));
    const paint = read(color, this, d, i, nodes);
    const node = d3.select(this).classed("sd-dot", true).classed("sd-dot-hollow", isHollow).attr("r", read(r, this, d, i, nodes));
    node.attr("fill", isHollow ? null : paint).attr("stroke", isHollow ? paint : null);
  });
  return selection;
}

/**
 * Interval whiskers: on each `g`, adds class `sd-whisker` and ensures, in this order, `line.sd-whisker-line`,
 * `line.sd-whisker-cap.sd-whisker-cap-lower` and `line.sd-whisker-cap.sd-whisker-cap-upper`, then sets their
 * coordinates. `at` is the position across the whisker, `lo`..`hi` its span along it, `cap` the length of the
 * end caps. `orient` is the direction of the span: "horizontal" (x from `lo` to `hi`, y = `at`) or "vertical".
 * Every option may be a value or an accessor.
 * @param {import("d3").Selection<any, any, any, any>} selection
 * @param {{ at: number | Function, lo: number | Function, hi: number | Function, cap: number | Function, orient?: "horizontal" | "vertical" }} options
 */
export function whisker(selection, { at, lo, hi, cap, orient = "horizontal" }) {
  const parts = [
    [".sd-whisker-line", "sd-whisker-line"],
    [".sd-whisker-cap-lower", "sd-whisker-cap sd-whisker-cap-lower"],
    [".sd-whisker-cap-upper", "sd-whisker-cap sd-whisker-cap-upper"],
  ];
  selection.each(function (d, i, nodes) {
    const g = d3.select(this).classed("sd-whisker", true);
    for (const [css, cls] of parts) if (g.select(css).empty()) g.append("line").attr("class", cls);
    const [center, from, to, length] = [at, lo, hi, cap].map((v) => read(v, this, d, i, nodes));
    const half = length / 2;
    const put = (css, x1, y1, x2, y2) => g.select(css).attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
    if (orient === "vertical") {
      put(".sd-whisker-line", center, from, center, to);
      put(".sd-whisker-cap-lower", center - half, from, center + half, from);
      put(".sd-whisker-cap-upper", center - half, to, center + half, to);
    } else {
      put(".sd-whisker-line", from, center, to, center);
      put(".sd-whisker-cap-lower", from, center - half, from, center + half);
      put(".sd-whisker-cap-upper", to, center - half, to, center + half);
    }
  });
  return selection;
}

const bandD = d3.area().defined((p) => p.lo !== null && p.hi !== null).x((p) => p.px).y0((p) => p.lo).y1((p) => p.hi);

/**
 * The `d` of an interval band over `{ px, lo, hi }` points (pixels), defined where `lo` and `hi` are both
 * not null. What d3 returns: `null` when no point is defined, which `attr("d", null)` drops.
 * @param {Array<{ px: number, lo: number | null, hi: number | null }>} points
 * @returns {string | null}
 */
export const band = (points) => bandD(points);

/**
 * Reference rules: on each `g`, a `line.sd-rule` from (x1, y1) to (x2, y2), and a `text.sd-rule-label` only
 * while `label` is not empty (a rule that loses its label loses the text). The label sits at the start,
 * middle or end of the rule (`anchor`, also its `text-anchor`), just above it and clear of its end.
 * Every option may be a value or an accessor. Returns the selection.
 * @param {import("d3").Selection<any, any, any, any>} selection
 * @param {{ x1: number | Function, y1: number | Function, x2: number | Function, y2: number | Function, label?: string | Function, anchor?: "start" | "middle" | "end" | Function }} options
 */
export function rule(selection, { x1, y1, x2, y2, label = "", anchor = "start" }) {
  selection.each(function (d, i, nodes) {
    const g = d3.select(this);
    const [ax, ay, bx, by] = [x1, y1, x2, y2].map((v) => read(v, this, d, i, nodes));
    const text = String(read(label, this, d, i, nodes) ?? "");
    const side = read(anchor, this, d, i, nodes);
    if (g.select("line.sd-rule").empty()) g.append("line").attr("class", "sd-rule");
    g.select("line.sd-rule").attr("x1", ax).attr("y1", ay).attr("x2", bx).attr("y2", by);
    if (text === "") {
      g.select("text.sd-rule-label").remove();
      return;
    }
    if (g.select("text.sd-rule-label").empty()) g.append("text").attr("class", "sd-rule-label");
    const at = side === "end" ? [bx, by] : side === "middle" ? [(ax + bx) / 2, (ay + by) / 2] : [ax, ay];
    g.select("text.sd-rule-label").attr("x", at[0]).attr("y", at[1])
      .attr("dx", side === "end" ? "-0.35em" : side === "middle" ? null : "0.35em").attr("dy", "-0.35em")
      .attr("text-anchor", side === "end" || side === "middle" ? side : "start").text(text);
  });
  return selection;
}

const HALO_GEOMETRY = ["d", "x1", "y1", "x2", "y2", "cx", "cy", "r", "points"];

/**
 * Keeps marks readable over what is behind them. By default it adds class `sd-halo` (a background-colour
 * stroke painted under the fill) and returns the selection: for text. A dot already has its background
 * outline, so a halo on a dot changes nothing (the CSS skips `.sd-dot`). With `under: true` it
 * ensures, just before each node, a sibling `.sd-halo-under` copy of its geometry (`d`, `x1` to `y2`, `cx`,
 * `cy`, `r`, `points`), styled as a wider background-colour stroke, and returns those copies. Call it
 * again after the node's geometry changes or after the node moved in the DOM (`raise`, `order`): the copy
 * is the same one, updated and put back before the node.
 * @param {import("d3").Selection<any, any, any, any>} selection
 * @param {{ under?: boolean }} [options]
 * @returns {import("d3").Selection<any, any, any, any>}
 */
export function halo(selection, { under = false } = {}) {
  if (!under) return selection.classed("sd-halo", true);
  const copies = [];
  selection.each(function () {
    const parent = this.parentNode;
    if (!parent) return;
    let copy = this.__sdHaloUnder;
    if (!copy || copy.localName !== this.localName) {
      copy = this.ownerDocument.createElementNS(this.namespaceURI, this.localName);
      copy.setAttribute("class", "sd-halo-under");
      this.__sdHaloUnder = copy;
    }
    for (const name of HALO_GEOMETRY) {
      if (this.hasAttribute(name)) copy.setAttribute(name, this.getAttribute(name));
      else copy.removeAttribute(name);
    }
    if (copy.__data__ !== this.__data__) copy.__data__ = this.__data__;
    if (copy.nextSibling !== this || copy.parentNode !== parent) parent.insertBefore(copy, this);
    copies.push(copy);
  });
  return d3.selectAll(copies);
}

const CANVAS_MAX_RATIO = 3;

/**
 * The canvas layer of an element: one `canvas.sd-canvas-layer` per `el`, inserted as its first child on the
 * first call, placed absolutely at `left`/`top` (the plot's origin, in the element's pixels) with a CSS size
 * of `pw` x `ph`. Its backing store is that size times min(3, devicePixelRatio), and its 2D context is
 * scaled to match, so callers draw in plot pixels. Idempotent: the same call changes nothing; a call that
 * changes the size clears the canvas, so paint again after it (`paintLines`). The SVG sibling painted over it
 * needs no z-index: `.sd-canvas-layer ~ svg` is positioned (core/stepdeck.css).
 * @param {HTMLElement} el
 * @param {{ left: number, top: number, pw: number, ph: number }} plot
 * @returns {HTMLCanvasElement}
 */
export function canvasLayer(el, { left, top, pw, ph }) {
  let canvas = [...el.children].find((c) => c.localName === "canvas" && c.classList.contains("sd-canvas-layer"));
  if (!canvas) {
    canvas = el.ownerDocument.createElement("canvas");
    canvas.setAttribute("class", "sd-canvas-layer");
    el.insertBefore(canvas, el.firstChild);
  }
  const ratio = Math.min(CANVAS_MAX_RATIO, el.ownerDocument.defaultView?.devicePixelRatio || 1);
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

// 32-bit FNV-1a over UTF-16 code units, fed piece by piece so the signature text is never built: `feed` hashes a
// string's code units into `h`, `feedTenth` the characters of `${Math.round(v * 10) / 10}`. `hex` gives 8 hex digits.
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const feed = (h, text) => {
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), FNV_PRIME);
  return h;
};
const DIGITS = new Uint8Array(16);
function feedTenth(h, v) {
  const k = Math.round(v * 10);
  // A tenth is written as its integer digits, then "." and one digit unless it is zero; "-" first when negative
  // (-0 is written "0", as String does). Beyond 1e15 tenths, String's own spelling.
  if (!(Math.abs(k) < 1e15)) return feed(h, String(k / 10));
  if (k < 0) h = Math.imul(h ^ 45, FNV_PRIME); // "-"
  const n = Math.abs(k);
  const tenth = n % 10;
  let whole = (n - tenth) / 10;
  let count = 0;
  do {
    const d = whole % 10;
    DIGITS[count++] = d;
    whole = (whole - d) / 10;
  } while (whole > 0);
  while (count > 0) h = Math.imul(h ^ (48 + DIGITS[--count]), FNV_PRIME);
  if (tenth) h = Math.imul(Math.imul(h ^ 46, FNV_PRIME) ^ (48 + tenth), FNV_PRIME); // "." and the digit
  return h;
}
const hex = (h) => (h >>> 0).toString(16).padStart(8, "0");

/** The runs of consecutive points whose coordinates are both finite numbers: a point that is not breaks the line. */
function runsOf(points) {
  const runs = [];
  let run = [];
  for (const point of Array.isArray(points) ? points : []) {
    const [x, y] = Array.isArray(point) ? point : [];
    if (Number.isFinite(x) && Number.isFinite(y)) run.push([x, y]);
    else {
      if (run.length) runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs.filter((r) => r.length >= 2);
}

/**
 * Clears the canvas, then strokes each `{ points: [[x, y], ...], color, alpha?, width? }` with round joins
 * and caps, in plot pixels (see `canvasLayer`). `width` and `alpha` are the defaults for a line without its
 * own. A point whose x or y is not a finite number (a missing value) breaks the line there, so a gap is a gap
 * and never a line to zero; a stretch of fewer than 2 points draws nothing, so a line without such a stretch
 * is skipped. Returns a signature of what was painted, the FNV-1a hex of every painted line's color, width,
 * alpha and stretches, rounded to 0.1 px and 0.001 alpha: two paintings with the same signature are the same
 * picture, so it can stand in for the pixels in a dump.
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{ points: Array<[number | null, number | null]>, color: string, alpha?: number, width?: number }>} lines
 * @param {{ width?: number, alpha?: number }} [defaults]
 * @returns {string}
 */
export function paintLines(canvas, lines, { width = 1, alpha = 1 } = {}) {
  const g = canvas.getContext("2d");
  if (g) {
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.restore();
    g.lineJoin = "round";
    g.lineCap = "round";
  }
  // The signature hashes, line by line, `${color}|${width}|${alpha}|` and the stretches (each point `${x},${y}`, points
  // joined by ";", stretches by "/"), then "\n", without building that text.
  let h = FNV_OFFSET;
  for (const line of lines) {
    const runs = runsOf(line.points);
    if (!runs.length) continue;
    const w = Math.round((line.width ?? width) * 10) / 10;
    const a = Math.round((line.alpha ?? alpha) * 1000) / 1000;
    h = feed(h, `${line.color}|${w}|${a}|`);
    runs.forEach((run, r) => {
      if (r) h = Math.imul(h ^ 47, FNV_PRIME); // "/"
      run.forEach(([x, y], i) => {
        if (i) h = Math.imul(h ^ 59, FNV_PRIME); // ";"
        h = feedTenth(Math.imul(feedTenth(h, x) ^ 44, FNV_PRIME), y); // x "," y
      });
    });
    h = Math.imul(h ^ 10, FNV_PRIME); // "\n"
    if (!g) continue;
    g.beginPath();
    for (const run of runs) run.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.strokeStyle = line.color;
    g.lineWidth = line.width ?? width;
    g.globalAlpha = line.alpha ?? alpha;
    g.stroke();
  }
  if (g) g.globalAlpha = 1;
  return hex(h);
}
