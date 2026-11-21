// The draw fan of chart.line, its pure part: the opacity and width of a draw for the number of draws shown, and the model
// of a draws file (every draw's points, by series and draw id) with its limits. Pure apart from `loadDraws`, which reads
// the file through ctx.data; the painting and the motion are the component's (./index.js).
import { loadTable } from "../../core/chart.js";
import { cellValue } from "../../core/chart-layout.js";

/** At most this many draws in a draws file (unique ids over every series), and this many x values per series. */
export const FAN_MAX_DRAWS = 2000;
export const FAN_MAX_X = 500;

const NO_SERIES = "all"; // series key when props.series is absent, as in ./index.js

/** The opacity of each painted draw when `n` are shown: 1.9 / √n, kept between 0.06 and 0.85. */
export const fanAlpha = (n) => Math.min(0.85, Math.max(0.06, 1.9 / Math.sqrt(n)));

// The width of a draw, as a multiple of the summary line's stroke width, for n <= 20, n <= 200 and more draws shown.
// The steps between the tiers are small, so a draw that stays shown keeps most of the pixels it covered.
const WIDTH_TIERS = [[20, 0.5], [200, 0.4], [Infinity, 0.3]];

/** The stroke width of each painted draw when `n` are shown, for a summary line `lineWidth` wide. */
export const fanWidth = (n, lineWidth) => lineWidth * WIDTH_TIERS.find(([most]) => n <= most)[1];

/**
 * The rows of `props.draws.data`, with the checks of `loadTable`: the file must have the chart's `x`, its `y`, its
 * `series` column when the chart has series, and the `draws.id` column. `props.types` applies to it as to `data`.
 * Throws `column 'c' not found in <draws.data> (columns: …)`.
 */
export function loadDraws(props, ctx) {
  const draws = props.draws ?? {};
  return loadTable({ data: draws.data, types: props.types }, ctx, "chart.line", [
    ["x", props.x], ["y", props.y], ["series", props.series, true], ["draws.id", draws.id],
  ]);
}

/**
 * The draws of `rows` (a draws file) for `props.draws` read with the columns `{ x, y, series }`:
 * `{ ids, bySeries, count }`. `ids` are the draw ids (as strings) in order of first appearance and `count` how many
 * there are, over every series. `bySeries` maps each series (by name; 'all' without a series column) to its draws, a
 * Map from id to `[[x, y], …]` sorted by x. A row with no x is left out (it has no place on the line); a missing or
 * non-numeric y stays as a null point, so the draw's line breaks there instead of dropping to 0. A series with fewer
 * draws than another has just those. Throws, in this order:
 * `<data> has <m> draws (at most 2000)`, `<data> has <k> x values for series '<s>' (at most 500)` and
 * `` `draws.shown` is <n> but <data> has only <m> draws ``.
 * @param {Array<Record<string, unknown>>} rows
 * @param {{ draws: { data: string, id: string, shown: number } }} props
 * @param {{ x: string, y: string, series?: string }} columns
 * @returns {{ ids: string[], bySeries: Map<string, Map<string, Array<[number, number | null]>>>, count: number }}
 */
export function fanModel(rows, props, { x, y, series }) {
  const { data, id, shown } = props.draws;
  const ids = [];
  const known = new Set();
  const bySeries = new Map();
  for (const row of rows) {
    const draw = String(row[id]);
    if (!known.has(draw)) {
      known.add(draw);
      ids.push(draw);
    }
    const xv = cellValue(row, x);
    if (xv === null) continue;
    const yv = cellValue(row, y);
    const name = series ? String(row[series]) : NO_SERIES;
    if (!bySeries.has(name)) bySeries.set(name, new Map());
    const own = bySeries.get(name);
    if (!own.has(draw)) own.set(draw, []);
    own.get(draw).push([xv, yv]);
  }
  if (ids.length > FAN_MAX_DRAWS) throw new Error(`${data} has ${ids.length} draws (at most ${FAN_MAX_DRAWS})`);
  for (const [name, draws] of bySeries) {
    const xs = new Set();
    for (const points of draws.values()) for (const [xv] of points) xs.add(xv);
    if (xs.size > FAN_MAX_X) throw new Error(`${data} has ${xs.size} x values for series '${name}' (at most ${FAN_MAX_X})`);
    for (const points of draws.values()) points.sort((a, b) => a[0] - b[0]);
  }
  if (shown > ids.length) throw new Error(`\`draws.shown\` is ${shown} but ${data} has only ${ids.length} draws`);
  return { ids, bySeries, count: ids.length };
}
