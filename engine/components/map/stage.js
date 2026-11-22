// One view of a map element: its canvas layers, stacked in paint order, and an SVG over them for the labels. The order
// is the land (`base`), each layer (by kind, then in the order the slide first declares it), then the borders
// (`paintBorders`, which fills nothing), on top so they stay crisp over any layer, then the layers of a kind that sets
// `above: "borders"` on its module (points), then the labels. A canvas is named `<stage>:<part>`: `main:base`,
// `main:areas:rate`, `main:raster:density`, `main:borders`, `main:points:sites`. Every canvas exists from the start, so
// a step never adds or moves one; a layer that is not shown is cleared. A kind whose painter is costly per pixel (a raster)
// sets `maxRatio: 1` on its module, and its canvas is made with that backing-store ratio.
//
// `paint(state, layerStates, { moving })` draws one moment from plain data and writes on every canvas what it shows, as
// `dump` and `check --played` read it: `data-view` (k,x,y with 3 decimals), `data-shown` (the layers painted, in paint
// order), `data-highlight` (the highlighted regions), `data-frame` (empty without a time-lapse) and `data-sig`, the
// signature of what was painted (empty for a cleared layer); `data-layer` is the canvas's name. Every scene's `source`
// starts with `geo.key` (the boundaries, the projection and the size), so a signature changes when the geometry does.
// Every vector is drawn through the view of the moment, so a flight redraws cached paths; a raster draws pictures made at
// other views through it (raster.js). A paint at rest paints every canvas and makes the labels afresh, so the markup is
// the same however a step was reached. A frame of a motion (`moving`) leaves a canvas whose scene has the signature it
// shows already, and moves the labels in place when they name the same regions as before.
import { canvasLayer } from "../../core/canvas.js";
import { applyView } from "../../core/map.js";
import { DOT_OUTLINE, paintAreas, paintBorders } from "../../core/map-paint.js";
import { SVG_NS } from "../../core/kit.js";

/** The line between two regions, in px. */
const BORDER = 1;
/** The ink outline of a highlighted region, in px (a highlighted dot's ring is its own outline, in ink). */
const RING = 3;

/** A canvas that cannot paint: a painter given it only signs its scene (each returns the signature when there is no 2D context). */
const SIGN_ONLY = { getContext: () => null };

const fixed = (v) => v.toFixed(3);
const viewText = (v) => `${fixed(v.k)},${fixed(v.x)},${fixed(v.y)}`;
const tenth = (v) => Math.round(v * 10) / 10;

/** Clears a layer that is not shown, whatever its transform. */
function clear(canvas) {
  const g = canvas.getContext("2d");
  if (!g) return;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.restore();
}

/**
 * The canvases and labels of one view of a map, inside `el`.
 * @param {HTMLElement} el
 * @param {{ name: string, size: [number, number], geo: object, layers: { kind: string, id: string, module: object }[] }} options
 *   `geo` is the element's geography (index.js), `layers` the layer slots in paint order
 * @returns {{ paint(state: object, layerStates: object[]): void, svg: SVGSVGElement, destroy(): void }}
 */
export function createStage(el, { name, size, geo, layers }) {
  const [w, h] = size;
  const doc = el.ownerDocument;
  const make = (part, maxRatio) => canvasLayer(el, { left: 0, top: 0, pw: w, ph: h, name: `${name}:${part}`, maxRatio });
  const land = make("base");
  // `canvases[i]` is the canvas of `layers[i]`; a canvas is stacked in the order it is made
  const canvases = [];
  const makeLayers = (above) => layers.forEach((slot, i) => {
    if ((slot.module.above === "borders") === above) canvases[i] = make(`${slot.kind}:${slot.id}`, slot.module.maxRatio); // a kind that is costly per pixel (a raster) sets `maxRatio`
  });
  makeLayers(false);
  const borders = make("borders");
  makeLayers(true);
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "sd-map-labels");
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  (canvases.filter((_, i) => layers[i].module.above === "borders").at(-1) ?? borders).after(svg); // over the last canvas

  const { colors } = geo;
  const mark = (canvas, sig, marks) => {
    for (const [key, value] of Object.entries(marks)) canvas.setAttribute(`data-${key}`, value);
    canvas.setAttribute("data-sig", sig);
  };

  /** The land: every region in the surface colour, a region too small to see as a dot ringed in the background. */
  const landScene = (v) => ({
    source: geo.key, view: v, alpha: 1, hatch: { line: colors.dim, background: colors.surface },
    items: geo.ids.map((id) => {
      const dot = geo.isDot(id, v.k);
      return { id, fill: colors.surface, stroke: colors.background, width: dot ? DOT_OUTLINE : 0, dot };
    }),
  });

  /** The borders in the rule colour, then the ink outline of each highlighted region (a dot's ring), at how far it is highlighted. */
  const bordersScene = (v, highlight) => ({
    source: geo.key, view: v,
    items: [
      ...geo.ids.filter((id) => !geo.isDot(id, v.k)).map((id) => ({ id, stroke: colors.rule, width: BORDER, alpha: 1, dot: false })),
      ...geo.ids.filter((id) => highlight.ring(id) > 0).map((id) => {
        const dot = geo.isDot(id, v.k);
        return { id, stroke: colors.ink, width: dot ? DOT_OUTLINE : RING, alpha: highlight.ring(id), dot };
      }),
    ],
  });

  /** The label of region `id`, placed by `placeLabels`. */
  function newLabel(id) {
    const text = doc.createElementNS(SVG_NS, "text");
    for (const [name, value] of [["class", "sd-map-label"], ["data-region", id], ["x", "0"], ["y", "0"], ["dy", "0.35em"], ["text-anchor", "middle"]]) text.setAttribute(name, value);
    text.textContent = geo.names.get(id);
    return text;
  }

  /**
   * The labels at their regions' anchors seen through `v`, those whose anchor is inside the stage (a view that zooms in
   * leaves the others out, as it does their regions): made afresh, or, while moving and naming the same regions, moved.
   */
  function placeLabels(labels, v, moving) {
    const placed = labels
      .map(({ id, opacity }) => ({ id, opacity, at: applyView(v, geo.anchor(id)) }))
      .filter(({ at: [x, y] }) => x >= 0 && x <= w && y >= 0 && y <= h);
    const here = [...svg.children];
    const keep = moving && here.length === placed.length && placed.every(({ id }, i) => here[i].getAttribute("data-region") === id);
    const texts = keep ? here : placed.map(({ id }) => newLabel(id));
    placed.forEach(({ opacity, at: [x, y] }, i) => {
      texts[i].setAttribute("x", String(tenth(x)));
      texts[i].setAttribute("y", String(tenth(y)));
      if (opacity < 1) texts[i].setAttribute("opacity", String(opacity));
      else texts[i].removeAttribute("opacity");
    });
    if (!keep) svg.replaceChildren(...texts);
  }

  return {
    svg,
    /**
     * Paints one moment. `state` is { view, flight, highlight: { ids, dim(id), ring(id) }, labels: [{ id, opacity }],
     * frame, frameMix }, `flight` the flight under way ({ from, to, t }, or null); `layerStates[i]` is { prepared,
     * alpha, from, change } for `layers[i]` (a layer at alpha 0 is cleared). `moving`: a frame of a motion, which
     * leaves a canvas that shows its scene already.
     */
    paint(state, layerStates, { moving = false } = {}) {
      const { view: v, flight = null, highlight } = state;
      const marks = {
        view: viewText(v),
        shown: layers.filter((_, i) => layerStates[i].alpha > 0).map((slot) => slot.id).join(","),
        highlight: highlight.ids.join(","),
        frame: state.frame ?? "",
      };
      /**
       * Paints `canvas` with `painter` (the canvas -> its signature) and marks it; while moving, unless it shows that
       * already. Every scene holds its view, so a canvas at another view (each frame of a flight) is not even signed first.
       */
      const put = (canvas, painter) => {
        const shows = canvas.getAttribute("data-sig");
        const same = moving && canvas.getAttribute("data-view") === marks.view && painter(SIGN_ONLY) === shows;
        mark(canvas, same ? shows : painter(canvas), marks);
      };
      const lands = landScene(v);
      put(land, (canvas) => paintAreas(canvas, lands, geo.res));
      layers.forEach((slot, i) => {
        const { prepared, alpha, from, change } = layerStates[i];
        const canvas = canvases[i];
        if (alpha > 0) {
          const scene = slot.module.scene(prepared, { view: v, flight, alpha, highlight, frame: state.frame, frameMix: state.frameMix, size, from, change });
          put(canvas, (target) => slot.module.paint(target, scene, prepared));
        } else {
          if (!moving || canvas.getAttribute("data-sig") !== "") clear(canvas);
          mark(canvas, "", marks);
        }
      });
      const lines = bordersScene(v, highlight);
      put(borders, (canvas) => paintBorders(canvas, lines, geo.res));
      placeLabels(state.labels, v, moving);
    },
    destroy() {
      for (const canvas of [land, ...canvases, borders]) canvas.remove();
      svg.remove();
    },
  };
}
