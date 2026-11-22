// The painters of a map: the layers on a canvas (regions, a raster, points) and the furniture on an SVG (an inset frame
// with its leader lines, a scale bar). They are `ctx.map.paintAreas`, `paintRaster`, `paintPoints`, `insetFrame` and
// `scaleBar` (core/map.js re-exports them in `mapKit`).
//
// A painter is pure: plain data in, the layer cleared and painted again, a signature out. The canvas painters hash their
// whole scene with `signature()` (core/canvas.js) and return the 8 hex digits, so `check --played` can compare state
// and a test can compare pixels. A scene names its geometry by a `source` key and never holds a Path2D; the resources
// (`res`) turn an id into a path, and are not hashed. Colours are resolved strings: a painter never reads a token.
//
//   paintAreas(canvas, scene, res)     regions filled and stroked in one transform, hatched when the fill is null, dots for
//                                      the regions too small to see
//   paintRaster(canvas, scene, res)    the hatch on the land, then pictures of a raster built for one view, drawn at another
//   paintPoints(canvas, scene)         circles at screen size, positioned through the view
//   insetFrame(svg, { box, frame })    the box on the main map, the inset's frame, and two dashed leaders between them
//   scaleBar(svg, { ... })             a bar of a round length in km and its label
//
// Vector drawing runs under one `setTransform` that holds the backing-store ratio and the view, so a pan or a zoom is a
// redraw of cached paths: line widths are divided by the view's scale (they stay constant on screen), and a point or a dot
// is placed through the view but drawn at screen size.
import { d3 } from "./d3.js";
import { scratchCanvas, signature } from "./canvas.js";
import { niceLength } from "./map-rules.js";

/** The hatch of a region with no data: lines at 45 degrees, `HATCH_PERIOD` apart across, `HATCH_WIDTH` wide (the CSS twin is `.sd-legend-nodata`). */
const HATCH_PERIOD = 6;
const HATCH_WIDTH = 1.5;
/** A dot's radius, in screen px: a region that is under 6 px at the current view is drawn as one. */
const DOT_RADIUS = 5;
/** The outline of a point, in screen px. */
const POINT_OUTLINE = 1.5;
/** The mean radius of the Earth, in km. */
const EARTH_KM = 6371;
const SVG = "http://www.w3.org/2000/svg";

/** The backing-store ratio of a canvas: its pixels over its CSS width (1 when the layer has no CSS size). */
function ratioOf(canvas) {
  const css = parseFloat(canvas.style.width);
  return css > 0 ? canvas.width / css : 1;
}

/** Clears a canvas whatever its transform, and leaves the context ready for round strokes. */
function clear(g, canvas) {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.restore();
  g.lineJoin = "round";
}

/** A number as a view or a position is hashed: three decimals. */
const fixed = (v) => v.toFixed(3);

/**
 * The hatch as a canvas pattern for a context drawn at `ratio`: a square tile of one period along the axes (the stripes
 * are `HATCH_PERIOD` apart across, so the tile is that times the square root of two), built from the two colours of
 * the scene. `at(scale, tx, ty)` is the pattern for a user space that is `scale` times the CSS pixels, moved by
 * (`tx`, `ty`): the tile is pinned to the canvas, so stripes keep their size and place when the view changes. Each
 * pattern is built once per call of `hatchPattern` and reused by every fill that has the same transform.
 */
function hatchPattern(g, doc, { line, background }, ratio) {
  const side = HATCH_PERIOD * Math.SQRT2;
  const n = Math.max(1, Math.round(side * ratio));
  const tile = doc.createElement("canvas");
  tile.width = tile.height = n;
  const t = tile.getContext("2d");
  t.fillStyle = background;
  t.fillRect(0, 0, n, n);
  t.strokeStyle = line;
  t.lineWidth = (HATCH_WIDTH * n) / side;
  t.beginPath();
  for (const c of [-n, 0, n]) {
    t.moveTo(c - n, -n);
    t.lineTo(c + 2 * n, 2 * n);
  }
  t.stroke();
  const made = new Map();
  return (scale, tx, ty) => {
    const key = `${scale}|${tx}|${ty}`;
    if (!made.has(key)) {
      const pattern = g.createPattern(tile, "repeat");
      // pattern space -> user space: one tile pixel is `side / n` CSS pixels, and the origin is the canvas's own.
      pattern.setTransform(new DOMMatrix([side / (n * scale), 0, 0, side / (n * scale), -tx / scale, -ty / scale]));
      made.set(key, pattern);
    }
    return made.get(key);
  };
}

/**
 * Paints regions: clears `canvas`, then draws `scene.items` in order under `setTransform(ratio * k, 0, 0, ratio * k,
 * ratio * x, ratio * y)` for the view `{ k, x, y }`, with line widths divided by `k`. `res.path(id)` is a Path2D in
 * base-projected px and `res.centroid(id)` a `[x, y]` in the same px. An item with a null `fill` is hatched
 * (`scene.hatch`: `{ line, background }`, resolved colours). A `dot` item is not its path: it is a circle of 5 px at its
 * centroid seen through the view, at screen size, with `width` of outline in `stroke`. `scene.alpha` applies to all.
 * Without a 2D context (a canvas that cannot paint), only the signature is computed.
 * @param {HTMLCanvasElement} canvas  a layer from `canvasLayer`
 * @param {{ source: string, view: { k: number, x: number, y: number }, alpha: number, hatch: { line: string, background: string }, items: { id: string, fill: string | null, stroke: string, width: number, dot: boolean }[] }} scene
 * @param {{ path(id: string): Path2D, centroid(id: string): [number, number] }} res
 * @returns {string}  the signature of the scene: 8 hex digits
 */
export function paintAreas(canvas, scene, res) {
  const { source, view: v, alpha, hatch, items } = scene;
  const sig = signature();
  sig.text(`${source}|${fixed(v.k)}|${fixed(v.x)}|${fixed(v.y)}|${Math.round(alpha * 1000) / 1000}|${hatch.line}|${hatch.background}\n`);
  for (const item of items) sig.text(`${item.id}|${item.fill}|${item.stroke}|${item.width}|${item.dot ? 1 : 0}\n`);
  const g = canvas.getContext("2d");
  if (!g) return sig.hex();

  clear(g, canvas);
  const ratio = ratioOf(canvas);
  g.globalAlpha = alpha;
  const hatchAt = items.some((item) => item.fill === null) ? hatchPattern(g, canvas.ownerDocument, hatch, ratio) : null;
  g.imageSmoothingEnabled = false;
  for (const item of items) {
    if (item.dot) {
      const [cx, cy] = res.centroid(item.id);
      if (!Number.isFinite(cx + cy)) continue;
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.beginPath();
      g.arc(v.k * cx + v.x, v.k * cy + v.y, DOT_RADIUS, 0, 2 * Math.PI);
      g.fillStyle = item.fill === null ? hatchAt(1, 0, 0) : item.fill;
      g.fill();
      if (item.width > 0) {
        g.strokeStyle = item.stroke;
        g.lineWidth = item.width;
        g.stroke();
      }
      continue;
    }
    g.setTransform(ratio * v.k, 0, 0, ratio * v.k, ratio * v.x, ratio * v.y);
    const path = res.path(item.id);
    g.fillStyle = item.fill === null ? hatchAt(v.k, v.x, v.y) : item.fill;
    g.fill(path);
    if (item.width > 0) {
      g.strokeStyle = item.stroke;
      g.lineWidth = item.width / v.k;
      g.stroke(path);
    }
  }
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.globalAlpha = 1;
  return sig.hex();
}

/** The pixels of `grid` seen through `table` (a cell index per canvas pixel, -1 for none) coloured by `lutData`, as a scratch canvas. */
function rasterImage([w, h], table, grid, lutData) {
  if (table.length !== w * h) throw new Error(`paintRaster: the lookup table has ${table.length} cells, not ${w}×${h}`);
  const pixels = new ImageData(w, h);
  const out = new Uint32Array(pixels.data.buffer);
  // one 32-bit word per level, copied byte for byte into the image, so the byte order never matters
  const colours = new Uint32Array(new Uint8ClampedArray(lutData).buffer);
  for (let p = 0; p < table.length; p++) {
    const cell = table[p];
    if (cell >= 0 && grid.data[cell]) out[p] = colours[grid.levels[cell]];
  }
  const image = scratchCanvas(w, h);
  image.getContext("2d").putImageData(pixels, 0, 0);
  return image;
}

/**
 * Paints a raster: clears `canvas`, draws the hatch on the land (when `scene.hatch` is set and `res.land` is not null),
 * then each of `scene.draws` in order, at its alpha. A raster canvas is made with `maxRatio: 1`, so everything here is
 * in its own pixels: `view`, every `at` and the lookup tables are for a canvas of `canvas.width` x `canvas.height`.
 *
 * A draw is a picture of one frame as seen through the view `at`: each canvas pixel takes the colour of the raster
 * cell `res.lookupFor(at)` gives it (`res.lutData` colours the cell's level; a cell with no data, or a pixel outside the
 * raster, stays clear). The picture is drawn under the transform that carries `at` to `scene.view`, so a flight
 * is a move of one picture, not a repaint. The land is hatched at `view` itself, so the hatch stays under the data
 * wherever it is.
 *
 * `res` is `{ raster, lutData, lookupFor, land, cache }`: `raster.decoded(frame)` is the frame's grid, which the caller
 * has awaited with `raster.grid(frame)` (a frame that is not decoded and not yet drawn throws `paintRaster: frame 3 is
 * not decoded`); `lutData` is the 256-colour table of `lut()`; `lookupFor(at)` is the table of `lookup()` for a view;
 * `land` a Path2D of the regions in base-projected px; `cache` a Map the caller owns, where pictures are kept under
 * `source|frame|at|lut|size` (the caller empties it when the lut or the data behind a `source` changes). `res` is never hashed.
 * `scene.source` names the raster file and `scene.lut` the colour table (any string that differs when the table does);
 * the signature covers both, the view, the hatch colours and every draw.
 * Without a 2D context (a canvas that cannot paint), only the signature is computed.
 * @param {HTMLCanvasElement} canvas  a layer from `canvasLayer`, made with `maxRatio: 1`
 * @param {{ source: string, lut: string, view: { k: number, x: number, y: number }, hatch: { line: string, background: string } | null, draws: { frame: number, at: { k: number, x: number, y: number }, alpha: number }[] }} scene
 * @param {{ raster: { decoded(frame: number): { levels: Uint8Array, data: Uint8Array } | undefined }, lutData: Uint8ClampedArray, lookupFor(at: { k: number, x: number, y: number }): Int32Array, land: Path2D | null, cache: Map<string, any> }} res
 * @returns {string}  the signature of the scene: 8 hex digits
 */
export function paintRaster(canvas, scene, res) {
  const { source, lut, view: v, hatch, draws } = scene;
  const sig = signature();
  sig.text(`${source}|${lut}|${fixed(v.k)}|${fixed(v.x)}|${fixed(v.y)}|${hatch ? `${hatch.line}|${hatch.background}` : "none"}\n`);
  for (const { frame, at, alpha } of draws) sig.text(`${frame}|${fixed(at.k)}|${fixed(at.x)}|${fixed(at.y)}|${Math.round(alpha * 1000) / 1000}\n`);
  const g = canvas.getContext("2d");
  if (!g) return sig.hex();

  clear(g, canvas);
  g.globalAlpha = 1;
  const size = [canvas.width, canvas.height];
  if (hatch && res.land) {
    g.imageSmoothingEnabled = false; // the pattern's pixels stay crisp, as in paintAreas
    g.setTransform(v.k, 0, 0, v.k, v.x, v.y);
    g.fillStyle = hatchPattern(g, canvas.ownerDocument, hatch, 1)(v.k, v.x, v.y);
    g.fill(res.land);
  }
  g.imageSmoothingEnabled = true; // a picture drawn at another view is resampled
  for (const { frame, at, alpha } of draws) {
    const key = `${source}|${frame}|${fixed(at.k)}|${fixed(at.x)}|${fixed(at.y)}|${lut}|${size[0]}×${size[1]}`;
    if (!res.cache.has(key)) {
      const grid = res.raster.decoded(frame);
      if (!grid) throw new Error(`paintRaster: frame ${frame} is not decoded`);
      res.cache.set(key, rasterImage(size, res.lookupFor(at), grid, res.lutData));
    }
    const s = v.k / at.k;
    g.setTransform(s, 0, 0, s, v.x - s * at.x, v.y - s * at.y);
    g.globalAlpha = alpha;
    g.drawImage(res.cache.get(key), 0, 0);
  }
  g.setTransform(ratioOf(canvas), 0, 0, ratioOf(canvas), 0, 0);
  g.globalAlpha = 1;
  return sig.hex();
}

/**
 * Paints points: clears `canvas`, then draws a circle per item at its base-projected position seen through the view,
 * of radius `r` in screen px, filled with `fill` and outlined with `stroke` (none when it is null).
 * @param {HTMLCanvasElement} canvas  a layer from `canvasLayer`
 * @param {{ view: { k: number, x: number, y: number }, alpha: number, items: { id: string, x: number, y: number, r: number, fill: string, stroke: string | null }[] }} scene
 * @returns {string}  the signature of the scene: 8 hex digits
 */
export function paintPoints(canvas, scene) {
  const { view: v, alpha, items } = scene;
  const sig = signature();
  sig.text(`${fixed(v.k)}|${fixed(v.x)}|${fixed(v.y)}|${Math.round(alpha * 1000) / 1000}\n`);
  for (const item of items) sig.text(`${item.id}|${fixed(item.x)}|${fixed(item.y)}|${item.r}|${item.fill}|${item.stroke}\n`);
  const g = canvas.getContext("2d");
  if (!g) return sig.hex();

  clear(g, canvas);
  const ratio = ratioOf(canvas);
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.globalAlpha = alpha;
  g.lineWidth = POINT_OUTLINE;
  for (const item of items) {
    const [x, y] = [v.k * item.x + v.x, v.k * item.y + v.y];
    if (!Number.isFinite(x + y)) continue;
    g.beginPath();
    g.arc(x, y, item.r, 0, 2 * Math.PI);
    g.fillStyle = item.fill;
    g.fill();
    if (item.stroke) {
      g.strokeStyle = item.stroke;
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  return sig.hex();
}

/** The one `g` of a class inside an SVG, created on first use; its children are the caller's to write. */
function group(svg, name) {
  let g = [...svg.children].find((c) => c.localName === "g" && c.classList.contains(name));
  if (!g) {
    g = svg.ownerDocument.createElementNS(SVG, "g");
    g.setAttribute("class", name);
    svg.append(g);
  }
  return g;
}

/** The child of `g` at `index`, created as an element `tag` of class `name` if there is none, so a repeat call writes in place. */
function part(g, index, tag, name) {
  let node = g.children[index];
  if (!node) {
    node = g.ownerDocument.createElementNS(SVG, tag);
    node.setAttribute("class", name);
    g.append(node);
  }
  return node;
}

const setAll = (node, attributes) => {
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
};

/**
 * The corner pairs the leaders join, as [box corner, frame corner]. The frame sits beside the box (their x ranges apart
 * and their y ranges overlapping), above or below it, or across a diagonal. Beside, the box's two corners on the side
 * that faces the frame go to the frame's two corners on its facing side, top to top and bottom to bottom; above or
 * below, left to left and right to right; across a diagonal, the two corners off the diagonal, to the same corners of
 * the frame. A frame that overlaps the box in both directions gets no leaders.
 */
function leaders([bx0, by0, bx1, by1], [fx0, fy0, fx1, fy1]) {
  const sx = fx0 >= bx1 ? 1 : fx1 <= bx0 ? -1 : 0;
  const sy = fy0 >= by1 ? 1 : fy1 <= by0 ? -1 : 0;
  if (sx && sy) {
    // "\" when the frame is down-right or up-left of the box, "/" otherwise
    return sx * sy > 0
      ? [[[bx1, by0], [fx1, fy0]], [[bx0, by1], [fx0, fy1]]]
      : [[[bx0, by0], [fx0, fy0]], [[bx1, by1], [fx1, fy1]]];
  }
  if (sx) {
    const [bx, fx] = sx > 0 ? [bx1, fx0] : [bx0, fx1];
    return [[[bx, by0], [fx, fy0]], [[bx, by1], [fx, fy1]]];
  }
  if (sy) {
    const [by, fy] = sy > 0 ? [by1, fy0] : [by0, fy1];
    return [[[bx0, by], [fx0, fy]], [[bx1, by], [fx1, fy]]];
  }
  return [];
}

/**
 * Draws an inset's frame on an SVG: one `g.sd-map-inset` holding two dashed (`6 4`) leader lines, the box on the main
 * map (`rect.sd-map-inset-box`) and the inset's frame (`rect.sd-map-inset-frame`), in that order. Both rectangles are
 * `[x0, y0, x1, y1]` in the element's px. Idempotent: the group is created once and rewritten in place, so a repeat call
 * changes nothing. Colours are in core/stepdeck.css (ink for the rectangles, muted for the leaders).
 * @param {SVGSVGElement} svg
 * @param {{ box: [number, number, number, number], frame: [number, number, number, number] }} where
 * @returns {SVGGElement}
 */
export function insetFrame(svg, { box, frame }) {
  const g = group(svg, "sd-map-inset");
  const joins = leaders(box, frame);
  for (let i = 0; i < 2; i++) {
    const line = part(g, i, "line", "sd-map-inset-leader");
    if (!joins[i]) {
      line.setAttribute("display", "none");
      continue;
    }
    const [[x1, y1], [x2, y2]] = joins[i];
    line.removeAttribute("display");
    setAll(line, { x1, y1, x2, y2, "stroke-dasharray": "6 4" });
  }
  const rect = (index, name, [x0, y0, x1, y1]) => setAll(part(g, index, "rect", name), { x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
  rect(2, "sd-map-inset-box", box);
  rect(3, "sd-map-inset-frame", frame);
  return g;
}

/**
 * Draws a scale bar on an SVG: one `g.sd-map-scale` with a horizontal bar (`line.sd-map-scale-bar`) starting at `at`
 * with an end cap at each end (`path.sd-map-scale-caps`), and its label above (`text`). The length is the largest 1, 2
 * or 5 x 10^n km that fits in `maxWidth`, measured at `at` as the great-circle distance (`d3.geoDistance`, on a sphere of
 * 6,371 km) of one px along the row, through the view; the label is `${format(n)} km`. Where the projection cannot be
 * inverted at `at`, or no length fits, the group is empty. Idempotent.
 * @param {SVGSVGElement} svg
 * @param {{ base: any, view: { k: number, x: number, y: number }, at: [number, number], maxWidth: number, format: (n: number) => string }} where
 * @returns {SVGGElement}
 */
export function scaleBar(svg, { base, view: v, at, maxWidth, format }) {
  const g = group(svg, "sd-map-scale");
  g.replaceChildren();
  const lonLat = ([x, y]) => base.invert([(x - v.x) / v.k, (y - v.y) / v.k]);
  const [here, next] = [lonLat(at), lonLat([at[0] + 1, at[1]])];
  if (!here || !next) return g;
  const kmPerPx = EARTH_KM * d3.geoDistance(here, next);
  const length = niceLength(kmPerPx * maxWidth);
  if (!length || !(kmPerPx > 0)) return g;

  const [x, y] = at;
  const x2 = x + length / kmPerPx;
  const doc = svg.ownerDocument;
  const cap = 8;
  const bar = doc.createElementNS(SVG, "line");
  setAll(bar, { class: "sd-map-scale-bar", x1: x, y1: y, x2, y2: y });
  const caps = doc.createElementNS(SVG, "path");
  setAll(caps, { class: "sd-map-scale-caps", d: `M${x},${y - cap}V${y}M${x2},${y - cap}V${y}`, fill: "none" });
  const label = doc.createElementNS(SVG, "text");
  setAll(label, { x, y: y - cap - 4 });
  label.textContent = `${format(length)} km`;
  g.append(bar, caps, label);
  return g;
}
