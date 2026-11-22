// The `areas` layer kind of `map`: a choropleth. A values CSV is joined to the regions by key and coloured by a scale
// of the theme's palettes (`classes`, `midpoint`, `domain`; core/chart-scale.js), then painted with `paintAreas`
// (core/map-paint.js): a region without a value is hatched, one too small to see at the view is a dot, and outside a
// highlight a region takes the theme's dim colour.
//
// Every layer kind is a module with the same four members, which index.js and stage.js call:
//   kind                              the layer prop that names the kind ("areas")
//   prepare(layer, props, ctx, geo)   loads and checks the layer's data, builds its scale; throws the element's errors
//   scene(prepared, state)            what the layer shows at one moment, as plain data (the painter's scene)
//   paint(canvas, scene, prepared)    paints the scene on the layer's canvas; returns its signature
//   legend(prepared, state)           the layer's legend row, { title, legend, noData }, or null for none
// and, optionally, `maxRatio`, the canvas's backing-store ratio limit (a raster sets 1; the default is `canvasLayer`'s).
// `state` is { view, alpha, highlight, frame, frameMix, size, from, change }: the view { k, x, y }; the layer's
// opacity; `highlight` { ids, dim(id), ring(id) }, how far each region is dimmed and outlined (0..1); the frame and
// its mix (for rasters); the stage's [w, h]; and, while the layer's data or scale changes, `from` (what it showed
// before) and `change`, how far the change has gone. A scene at the end of a motion uses the exact colours a jump writes.
import { d3 } from "../../core/d3.js";
import { loadTable } from "../../core/chart.js";
import { colorScale } from "../../core/chart-scale.js";
import { joinValues } from "../../core/map-rules.js";
import { DOT_OUTLINE, paintAreas } from "../../core/map-paint.js";

const mixes = new Map();
/** `a` blended toward `b` by `t` in RGB (d3.interpolateRgb), with `a` and `b` themselves at the ends. */
function blend(a, b, t) {
  if (t >= 1 || a === b) return b;
  if (t <= 0) return a;
  const key = `${a}|${b}`;
  if (!mixes.has(key)) mixes.set(key, d3.interpolateRgb(a, b));
  return mixes.get(key)(t);
}

/**
 * The fill of region `id`: its colour (moving from `from` to the prepared one while the data changes), dimmed by how
 * far it is out of the highlight; null is the hatch, which never dims.
 */
function fillOf(prepared, { from, change, highlight }, id) {
  const now = prepared.fills.get(id);
  const was = from ? from.fills.get(id) : now;
  const fill = was === null || now === null ? now : blend(was, now, change);
  return fill === null ? null : blend(fill, prepared.geo.colors.dim, highlight.dim(id));
}

export default {
  kind: "areas",

  /**
   * Reads `layer.areas` (a CSV) and joins its `layer.value` column to the regions by its `layer.key` column (default:
   * the map's `id`), as text. Throws `column 'rat' not found in data/rates.csv (columns: code, rate)`,
   * `data/rates.csv: key '07' matches no region`, `data/rates.csv: key 'N1' appears twice`, and the scale's errors.
   */
  async prepare(layer, props, ctx, geo) {
    const key = layer.key ?? props.id;
    const rows = await loadTable({ data: layer.areas, types: layer.types }, ctx, "map", [["key", key], ["value", layer.value]]);
    const { values, unknown, duplicates } = joinValues(rows, key, layer.value, geo.ids);
    if (unknown.length) throw new Error(`${layer.areas}: key '${unknown[0]}' matches no region`);
    if (duplicates.length) throw new Error(`${layer.areas}: key '${duplicates[0]}' appears twice`);
    const palettes = { sequential: ctx.palette?.("sequential"), diverging: ctx.palette?.("diverging"), categorical: ctx.palette?.("categorical") };
    const spec = { classes: layer.classes, midpoint: layer.midpoint, domain: layer.domain, values: [...values.values()] };
    const scale = colorScale(spec, palettes, { format: ctx.format(",") });
    const fills = new Map(geo.ids.map((id) => [id, values.has(id) ? scale.color(values.get(id)) : null]));
    return { source: layer.areas, title: layer.label, legend: scale.legend, noData: [...fills.values()].includes(null), fills, geo };
  },

  scene(prepared, state) {
    const { geo } = prepared;
    const { view, alpha } = state;
    const { dim, surface, background } = geo.colors;
    const items = geo.ids.map((id) => {
      const dot = geo.isDot(id, view.k);
      // a dot is ringed in the background colour, so neighbouring dots and areas stay apart
      return { id, fill: fillOf(prepared, state, id), stroke: background, width: dot ? DOT_OUTLINE : 0, dot };
    });
    return { source: `${geo.key}|${prepared.source}`, view, alpha, hatch: { line: dim, background: surface }, items };
  },

  paint(canvas, scene, prepared) {
    return paintAreas(canvas, scene, prepared.geo.res);
  },

  legend(prepared) {
    return { title: prepared.title, legend: prepared.legend, noData: prepared.noData };
  },
};
