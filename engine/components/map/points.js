// The `points` layer kind of `map`: places from the longitude and latitude columns of a CSV, drawn as circles at screen
// size (`paintPoints`, core/map-paint.js) over the borders. A circle has a radius of 6 px, or, with `size`, an area
// true to its value: radius 18 × √(value / largest value) px, so the largest is 18 px and a quarter of the area is
// half the radius. The legend then shows a size key of two circles: the largest value rounded down to two
// significant figures, and a quarter of it. `color` is a column (a colour from the categorical palette for each
// distinct value, in order of first appearance, with a legend swatch each) when the CSV has a column of that name,
// else a theme colour role (default `accent`). A circle is ringed in the background colour so overlapping points stay
// apart; outside a highlight it takes the theme's dim colour, and a highlighted point is ringed in ink.
//
// The interface is that of every layer kind (see ./areas.js), with `above: "borders"` (the stage paints the layer over
// the borders) and `ids(prepared)`, the ids a `highlight` may name besides the regions'. While a layer's data changes
// (`state.from`, `state.change`) a point present before and after moves, resizes and changes colour from one to the
// other, one that is new grows from nothing and one that has gone shrinks away.
import { loadTable } from "../../core/chart.js";
import { numberOf } from "../../core/chart-layout.js";
import { colorScale } from "../../core/chart-scale.js";
import { signature } from "../../core/canvas.js";
import { lerp } from "../../core/kit.js";
import { paintPoints } from "../../core/map-paint.js";
import { DEFAULT_ROLE, blend, roleColor, roleNames } from "./colors.js";

/** The radius of a point with no `size`, in px. */
const RADIUS = 6;
/** The radius of the point with the largest `size`, in px. */
const LARGEST = 18;

/** The largest 1 or 2 digit number (times a power of ten) that is at most `v`: 142 -> 140, 0.29 -> 0.29, 5 -> 5. */
function floorTo2(v) {
  const unit = 10 ** (Math.floor(Math.log10(v)) - 1);
  return Number((Math.floor(Number((v / unit).toPrecision(12))) * unit).toPrecision(12));
}

/** The size key for sizes up to `max`: the circles of `floorTo2(max)` and a quarter of it, with their labels; null when no size is positive. */
function sizeKey(max, format) {
  if (!(max > 0)) return null;
  const top = floorTo2(max);
  return { items: [top, top / 4].map((value) => ({ r: LARGEST * Math.sqrt(value / max), label: format(value) })) };
}

/** A point as it is `change` of the way from `was` (before) to `item` (now); a point with no `was` grows from nothing. */
const moved = (was, item, change) =>
  was
    ? { ...item, x: lerp(was.x, item.x, change), y: lerp(was.y, item.y, change), r: lerp(was.r, item.r, change), fill: blend(was.fill, item.fill, change) }
    : { ...item, r: lerp(0, item.r, change) };

export default {
  kind: "points",
  above: "borders",

  /**
   * Reads `layer.points` (a CSV) and places a point at each row's `layer.lon` and `layer.lat`. Throws
   * `column 'lng' not found in data/sites.csv (columns: id, lon, lat)`, `data/sites.csv: row 4 has no lon` (rows count
   * from 1, not counting the header; also `lat`, and `size` for a size that is not a number), a `color` that is neither
   * a column nor a theme colour role, and the palette's errors.
   */
  async prepare(layer, props, ctx, geo) {
    const file = layer.points;
    const rows = await loadTable({ data: file, types: layer.types }, ctx, "map", [["lon", layer.lon], ["lat", layer.lat], ["id", layer.id, true], ["size", layer.size, true]]);
    const columns = rows.length ? Object.keys(rows[0]) : [];
    const byColumn = layer.color !== undefined && columns.includes(layer.color);

    const places = rows.map((row, i) => {
      const lon = numberOf(row[layer.lon]);
      if (lon === null) throw new Error(`${file}: row ${i + 1} has no lon`);
      const lat = numberOf(row[layer.lat]);
      if (lat === null) throw new Error(`${file}: row ${i + 1} has no lat`);
      let size = null;
      if (layer.size !== undefined) {
        size = numberOf(row[layer.size]);
        if (size === null) throw new Error(`${file}: row ${i + 1} has no size`);
        if (size < 0) throw new Error(`${file}: row ${i + 1} has a negative size`);
      }
      const id = layer.id === undefined ? "" : String(row[layer.id] ?? "").trim();
      return { key: id === "" ? `#${i + 1}` : id, id, at: geo.base([lon, lat]), size, group: byColumn ? String(row[layer.color] ?? "").trim() : "" };
    });

    const max = Math.max(...places.map((place) => place.size ?? 0));
    const format = ctx.format(",");
    let scale = null;
    let fill = () => null;
    if (byColumn) {
      const categories = [...new Set(places.map((place) => place.group).filter((group) => group !== ""))];
      scale = colorScale({ categories }, { categorical: ctx.palette?.("categorical") }, { format });
      const none = roleColor("muted", ctx) ?? geo.colors.dim; // a row with no value in the colour column
      fill = (place) => (place.group === "" ? none : scale.color(place.group));
    } else {
      const role = layer.color ?? DEFAULT_ROLE;
      const color = roleColor(role, ctx);
      if (!color) throw new Error(`${file}: color '${role}' is not a column (${columns.join(", ")}) or a theme colour (${roleNames(ctx).join(", ")})`);
      fill = () => color;
    }

    // the largest first, so a small point is never hidden under a large one
    const items = places
      .filter((place) => place.at)
      .map((place) => ({ key: place.key, x: place.at[0], y: place.at[1], r: place.size === null ? RADIUS : max > 0 ? LARGEST * Math.sqrt(place.size / max) : 0, fill: fill(place) }))
      .sort((a, b) => b.r - a.r);
    return {
      source: file,
      title: layer.label,
      ids: [...new Set(places.map((place) => place.id).filter((id) => id !== ""))],
      items,
      legend: scale && scale.legend.items.length ? scale.legend : null,
      size: layer.size === undefined ? null : sizeKey(max, format),
      geo,
    };
  },

  /** The ids of the points a `highlight` may name. */
  ids(prepared) {
    return prepared.ids;
  },

  scene(prepared, { view, alpha, highlight, from, change }) {
    const { geo } = prepared;
    const { background, ink, dim } = geo.colors;
    const crossfade = from && change < 1;
    const was = new Map(crossfade ? from.items.map((item) => [item.key, item]) : []);
    const now = new Set(prepared.items.map((item) => item.key));
    const shown = [
      ...prepared.items.map((item) => (crossfade ? moved(was.get(item.key), item, change) : item)),
      ...(crossfade ? from.items.filter((item) => !now.has(item.key)).map((item) => ({ ...item, r: lerp(item.r, 0, change) })) : []),
    ];
    const items = shown
      .filter((item) => item.r > 0)
      .map(({ key, x, y, r, fill }) => ({ id: key, x, y, r, fill: blend(fill, dim, highlight.dim(key)), stroke: blend(background, ink, highlight.ring(key)) }));
    return { source: `${geo.key}|${prepared.source}`, view, alpha, items };
  },

  paint(canvas, scene) {
    const hash = signature();
    hash.text(`${scene.source}|${paintPoints(canvas, scene)}`);
    return hash.hex();
  },

  legend(prepared) {
    const { title, legend, size } = prepared;
    return legend || size ? { title, legend, noData: false, size } : null;
  },
};
