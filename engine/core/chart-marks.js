// The DOM half of the chart building blocks: the plot frame, keyed joins, the end-state cleanup, the
// marks (dots, whiskers, rules, halos, interval bands) and `paintLines` on a canvas layer (`canvasLayer`, from
// core/canvas.js, is re-exported here). chart.line and chart.bar are built on it, and so can a custom component
// be: it reaches them as `ctx.chart` (core/chart.js).
//
// Everything takes d3 selections (or plain values) and writes attributes only; colours and sizes come
// from the caller, which takes them from theme tokens and `ctx.palette()`. The generic mark classes
// (`sd-dot`, `sd-whisker-*`, `sd-rule`, `sd-halo`, `sd-halo-under`, `sd-canvas-layer`) are styled by
// theme tokens in core/stepdeck.css. Nothing here reads `window` or `document` at load time.
import { d3 } from "./d3.js";
import { num, measureWidth, measureHeight } from "./kit.js";
import { canvasLayer, signature } from "./canvas.js";

export { canvasLayer };

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

/**
 * A value axis for a continuous `scale`: under the `g` selection, one `g.sd-axis-tick` per tick value, keyed by
 * value, each holding a `line.sd-axis-grid` across the plot and a `text.sd-axis-label`. It joins its ticks itself, so
 * call it where the attributes are written, on every frame of a played change and for the end state. `orient` "y" (the default): a tick at y = scale(v), its grid line from x 0
 * to `length`, its label left of x 0. "x": a tick at x = scale(v), its grid line from y 0 to `length`, its label
 * below `length`. `ticks` defaults to `scale.ticks(5)`; `format` to `String` (pass `tickFormat(ctx, spec, ticks)`
 * for labels in the deck's locale). Every tick is placed by `scale`, a leaving one too, so a played change that
 * passes the scale of each frame moves them all. `fade` (0 to 1, for those frames): a new tick's opacity is
 * `fade`, and a tick that left stays, with opacity `1 - fade`. Without `fade` (the end state) the ticks that left
 * are removed, no tick has an opacity, and the rest count as on screen for the next played change. Every other
 * attribute is written on every call, never dropped, so a played step ends with the markup of a jump.
 * The theme draws the grid in `--sd-color-grid` and the labels in `--sd-color-muted`. Returns every tick.
 * @param {import("d3").Selection<any, any, any, any>} g
 * @param {{ scale: any, orient?: "y" | "x", length?: number, ticks?: number[], format?: (v: number) => string, fade?: number }} options
 */
export function axis(g, { scale, orient = "y", length = 0, ticks, format = String, fade }) {
  keyed(g.selectAll(":scope > g.sd-axis-tick"), ticks ?? scale.ticks(5), (v) => String(v), (enter) => {
    const tick = enter.append("g").attr("class", "sd-axis-tick");
    tick.append("line").attr("class", "sd-axis-grid");
    tick.append("text").attr("class", "sd-axis-label");
    return tick;
  });
  if (fade === undefined) {
    g.selectAll(":scope > g.sd-axis-tick.sd-exiting").remove();
    g.selectAll(":scope > g.sd-axis-tick").each(function () { this.__sdSeen = true; }); // as `settle` marks what it keeps
  }
  const across = orient !== "x"; // a "y" axis: ticks down the plot, grid lines across it
  const all = g.selectAll(":scope > g.sd-axis-tick")
    .attr("transform", (v) => (across ? `translate(0,${scale(v)})` : `translate(${scale(v)},0)`))
    .attr("opacity", fade === undefined ? null : function () {
      return this.classList.contains("sd-exiting") ? 1 - fade : this.__sdSeen ? null : fade;
    });
  all.select("line.sd-axis-grid").attr("x1", 0).attr("y1", 0).attr("x2", across ? length : 0).attr("y2", across ? 0 : length);
  all.select("text.sd-axis-label").attr("x", 0).attr("y", across ? 0 : length)
    .attr("dx", across ? "-0.4em" : "0em").attr("dy", across ? "0.35em" : "1.2em")
    .attr("text-anchor", across ? "end" : "middle").text((v) => format(v));
  return all;
}

const HALO_GEOMETRY = ["d", "x1", "y1", "x2", "y2", "cx", "cy", "r", "points", "transform"];

/**
 * Keeps marks readable over what is behind them. By default it adds class `sd-halo` (a background-colour
 * stroke painted under the fill) and returns the selection: for text. A dot already has its background
 * outline, so a halo on a dot changes nothing (the CSS skips `.sd-dot`). With `under: true` it
 * ensures, just before each node, a sibling `.sd-halo-under` copy of its geometry (`d`, `x1` to `y2`, `cx`,
 * `cy`, `r`, `points`, `transform`), styled as a wider background-colour stroke, and returns those copies. Call it
 * again after the node's geometry changes or after the node moved in the DOM (`raise`, `order`): the copy
 * is the same one, updated and put back before the node. A copy has the node's tag (a `path` for a `path`), so in a
 * parent that holds copies select the marks by their class (`path.sd-line`), never by tag alone.
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
 * Strokes one line of `paintLines` straight from its points, with the calls the stretches of `runsOf` give (a stretch
 * starts at its second point: one point alone draws nothing, and a line without a stretch is not stroked), but
 * without building them.
 */
function strokeLine(g, line, width, alpha) {
  let [px, py, pen, begun] = [0, 0, 0, false]; // pen: 0 up, 1 one point seen, 2 drawing
  for (const point of Array.isArray(line.points) ? line.points : []) {
    const x = Array.isArray(point) ? point[0] : undefined;
    const y = Array.isArray(point) ? point[1] : undefined;
    if (!Number.isFinite(x) || !Number.isFinite(y)) pen = 0;
    else if (pen === 0) [px, py, pen] = [x, y, 1];
    else {
      if (pen === 1) {
        if (!begun) g.beginPath();
        begun = true;
        g.moveTo(px, py);
        pen = 2;
      }
      g.lineTo(x, y);
    }
  }
  if (!begun) return;
  g.strokeStyle = line.color;
  g.lineWidth = line.width ?? width;
  g.globalAlpha = line.alpha ?? alpha;
  g.stroke();
}

/**
 * Clears the canvas, then strokes each `{ points: [[x, y], ...], color, alpha?, width? }` with round joins
 * and caps, in plot pixels (see `canvasLayer`). `width` and `alpha` are the defaults for a line without its
 * own. A point whose x or y is not a finite number (a missing value) breaks the line there, so a gap is a gap
 * and never a line to zero; a stretch of fewer than 2 points draws nothing, so a line without such a stretch
 * is skipped. Returns a signature of what was painted, the FNV-1a hex of every painted line's color, width,
 * alpha and stretches, rounded to 0.1 px and 0.001 alpha: two paintings with the same signature are the same
 * picture, so it can stand in for the pixels in a dump. With `sign: false` (a frame of a motion, whose signature
 * nobody reads) it paints the same picture without computing one, and returns "".
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{ points: Array<[number | null, number | null]>, color: string, alpha?: number, width?: number }>} lines
 * @param {{ width?: number, alpha?: number, sign?: boolean }} [defaults]
 * @returns {string}
 */
export function paintLines(canvas, lines, { width = 1, alpha = 1, sign = true } = {}) {
  const g = canvas.getContext("2d");
  if (g) {
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.restore();
    g.lineJoin = "round";
    g.lineCap = "round";
  }
  if (!sign) {
    if (!g) return "";
    for (const line of lines) strokeLine(g, line, width, alpha);
    g.globalAlpha = 1;
    return "";
  }
  // The signature hashes, line by line, `${color}|${width}|${alpha}|` and the stretches (each point `${x},${y}`, points
  // joined by ";", stretches by "/"), then "\n", without building that text.
  const sig = signature();
  for (const line of lines) {
    const runs = runsOf(line.points);
    if (!runs.length) continue;
    const w = Math.round((line.width ?? width) * 10) / 10;
    const a = Math.round((line.alpha ?? alpha) * 1000) / 1000;
    sig.text(`${line.color}|${w}|${a}|`);
    runs.forEach((run, r) => {
      if (r) sig.char(47); // "/"
      run.forEach(([x, y], i) => {
        if (i) sig.char(59); // ";"
        sig.tenth(x);
        sig.char(44); // ","
        sig.tenth(y);
      });
    });
    sig.char(10); // "\n"
    if (!g) continue;
    g.beginPath();
    for (const run of runs) run.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.strokeStyle = line.color;
    g.lineWidth = line.width ?? width;
    g.globalAlpha = line.alpha ?? alpha;
    g.stroke();
  }
  if (g) g.globalAlpha = 1;
  return sig.hex();
}
