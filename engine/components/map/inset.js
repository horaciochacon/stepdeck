// The inset of a map: a second, zoomed view of the same layers in a corner of the element. It is a second stage
// (./stage.js) inside the element, not a component of its own: it shows the prepared layers, the colours, the highlight and
// the labels of the map, and only its `view` and its size differ. Its canvases are in a `div.sd-map-inset-stage` that sits
// over the map's canvases and under the map's SVG, so the box on the map, the two leaders and the inset's border
// (`insetFrame`, core/map-paint.js, drawn on that SVG) stay crisp on top of it. The stage's own SVG holds the inset's
// names and, with `scale`, the scale bar (`scaleBar`). The div is on the theme's background, so the inset's sea hides the
// map beneath it, and the div, the box and the leaders fade with the inset.
//
// A locator inset (`locator: true`) is the other way round: it shows `inset.view` (typically the whole map) and the box
// is drawn inside it, marking what the map shows at its current view (`locatorBox`), so there are no leaders and the
// main SVG holds the inset's frame alone. The box is a `rect.sd-map-inset-box` on the inset's own SVG, cut to the inset's
// rectangle: its edges are clamped to it, and a view of the map that shows nothing of what the inset shows has no box. It
// is recomputed with every frame of a flight of either view, as the box on the map is.
//
// The inset exists only while the inset is on (or fading): at rest the markup is a function of the props alone, so a
// played step and a jump to it are the same.
//
// Layout: 36% of the element's width, with the element's aspect, in the corner `at`, 3% of the element's width in from
// each of its two edges. A frame that overlaps the box (the inset covers what it shows) has no leaders.
import { applyView } from "../../core/map.js";
import { insetFrame, scaleBar } from "../../core/map-paint.js";
import { SVG_NS } from "../../core/kit.js";
import { createStage, through } from "./stage.js";

/** The corners `at` names, the default first. */
export const CORNERS = ["top-right", "top-left", "bottom-right", "bottom-left"];
/** The inset's width as a share of the element's, and its margin as a share of the same width. */
const WIDTH = 0.36;
const MARGIN = 0.03;
/** The scale bar's start in from the inset's left and up from its bottom, in px, and the widest it may be as a share of the inset's width. */
const BAR_INSET = 16;
const BAR_SHARE = 0.4;

/**
 * Where the inset of an element of `size` sits at corner `at`: its size in whole px, the ratio of that to the element's
 * (`scale`: the view's scale, see stage.js `through`) and its rectangle `[x0, y0, x1, y1]` in the element's px.
 * @param {[number, number]} size
 * @param {string} at one of `CORNERS`
 * @returns {{ size: [number, number], scale: number, rect: [number, number, number, number] }}
 */
export function insetLayout([w, h], at) {
  const iw = Math.round(w * WIDTH);
  const scale = iw / w;
  const ih = Math.round(h * scale);
  const margin = Math.round(w * MARGIN);
  const left = at.endsWith("left") ? margin : Math.round(w) - margin - iw;
  const top = at.startsWith("top") ? margin : Math.round(h) - margin - ih;
  return { size: [iw, ih], scale, rect: [left, top, left + iw, top + ih] };
}

/**
 * The part of the map the inset shows, as a rectangle in the px of the element seen through `main`, the map's own view:
 * the inset's two corners taken back through its view to base-projected px, then through the map's. Both views are the
 * element's (`through` scales the inset's).
 * @param {{ k: number, x: number, y: number }} main
 * @param {{ k: number, x: number, y: number }} seen the inset's view, scaled to its size (`through`)
 * @param {[number, number]} size the inset's size
 * @returns {[number, number, number, number]}
 */
export function boxOf(main, seen, [w, h]) {
  const back = ([x, y]) => applyView(main, [(x - seen.x) / seen.k, (y - seen.y) / seen.k]);
  const [x0, y0] = back([0, 0]);
  const [x1, y1] = back([w, h]);
  return [x0, y0, x1, y1];
}

/**
 * What the map shows, as a rectangle in the px of the inset: the element's two corners taken back through the map's view
 * `main` to base-projected px, then through the inset's view `seen` (scaled to its size, `through`). Not clipped: a map
 * that shows more than the inset gives a rectangle larger than it (`clipTo`).
 * @param {{ k: number, x: number, y: number }} main
 * @param {{ k: number, x: number, y: number }} seen the inset's view, scaled to its size (`through`)
 * @param {[number, number]} size the element's size
 * @returns {[number, number, number, number]}
 */
export function locatorBox(main, seen, [w, h]) {
  const to = ([x, y]) => applyView(seen, [(x - main.x) / main.k, (y - main.y) / main.k]);
  const [x0, y0] = to([0, 0]);
  const [x1, y1] = to([w, h]);
  return [x0, y0, x1, y1];
}

/**
 * `box` cut to the rectangle `[0, 0, w, h]` by clamping its edges, or null when nothing of it is inside.
 * @param {[number, number, number, number]} box
 * @param {[number, number]} size
 * @returns {[number, number, number, number] | null}
 */
export function clipTo([x0, y0, x1, y1], [w, h]) {
  const cut = [Math.max(x0, 0), Math.max(y0, 0), Math.min(x1, w), Math.min(y1, h)];
  return cut[0] < cut[2] && cut[1] < cut[3] ? cut : null;
}

/** A px length as the box writes it: three decimals, so the markup does not carry the noise of the arithmetic. */
const px = (v) => String(Math.round(v * 1000) / 1000);

/**
 * The inset of `main`, a stage of an element.
 * @param {HTMLElement} el
 * @param {{ main: { svg: SVGSVGElement }, geo: object, slots: object[], ctx: object }} options `main` the map's stage, `geo` and `slots` its geography and layers
 * @returns {{ paint(moment: object, layers: object[], options: { moving: boolean }): void, destroy(): void }}
 *   `paint` draws `moment` (a state of index.js: `view`, `highlight`, `labels`, and `inset`, `{ at, scale, locator, alpha, view, flight }`)
 */
export function createInset(el, { main, geo, slots, ctx }) {
  const holder = el.ownerDocument.createElement("div");
  holder.className = "sd-map-inset-stage";
  main.svg.before(holder);
  const { size, scale } = insetLayout(geo.size, CORNERS[0]);
  const stage = createStage(holder, { name: "inset", size, geo, layers: slots, scale });
  const format = ctx.format(",");
  let placed = null; // the rectangle the holder is placed at

  /** Draws the locator's box (`[x0, y0, x1, y1]` in the inset's px) on the inset's SVG, before the scale bar; none (null) takes it away. */
  function placeLocatorBox(box) {
    let node = stage.svg.querySelector(":scope > rect.sd-map-inset-box");
    if (!box) {
      node?.remove();
      return;
    }
    if (!node) {
      node = el.ownerDocument.createElementNS(SVG_NS, "rect");
      node.setAttribute("class", "sd-map-inset-box");
      const bar = stage.svg.querySelector(":scope > g.sd-map-scale");
      if (bar) bar.before(node);
      else stage.svg.append(node);
    }
    const [x0, y0, x1, y1] = box;
    for (const [name, value] of [["x", x0], ["y", y0], ["width", x1 - x0], ["height", y1 - y0]]) node.setAttribute(name, px(value));
  }

  return {
    paint(moment, layers, { moving = false } = {}) {
      const { inset } = moment;
      const { rect } = insetLayout(geo.size, inset.at);
      if (!placed || placed.some((v, i) => v !== rect[i])) {
        const [x0, y0, x1, y1] = rect;
        for (const [name, value] of [["left", x0], ["top", y0], ["width", x1 - x0], ["height", y1 - y0]]) holder.style.setProperty(name, `${value}px`);
        placed = rect;
      }
      if (inset.alpha < 1) holder.style.setProperty("opacity", String(inset.alpha));
      else holder.style.removeProperty("opacity");

      stage.paint({ ...moment, view: inset.view, flight: inset.flight, cover: null }, layers, { moving });
      const seen = through(inset.view, scale);
      const frame = insetFrame(main.svg, { box: inset.locator ? null : boxOf(moment.view, seen, size), frame: rect });
      if (inset.alpha < 1) frame.setAttribute("opacity", String(inset.alpha));
      else frame.removeAttribute("opacity");
      placeLocatorBox(inset.locator ? clipTo(locatorBox(moment.view, seen, geo.size), size) : null);
      const bar = stage.svg.querySelector(":scope > g.sd-map-scale");
      if (inset.scale) scaleBar(stage.svg, { base: geo.base, view: seen, at: [BAR_INSET, size[1] - BAR_INSET], maxWidth: size[0] * BAR_SHARE, format });
      else bar?.remove();
    },
    destroy() {
      stage.destroy();
      holder.remove();
      main.svg.querySelector(":scope > g.sd-map-inset")?.remove();
    },
  };
}
