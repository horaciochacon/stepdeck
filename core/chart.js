// Helpers the built-in charts (chart.line, chart.bar) share.
import { d3 } from "./d3.js";

/**
 * Loads the rows of `props.data` and checks every column the props name. `columns` is
 * [[prop, column, optional]]: an optional column may be undefined. Throws the first problem:
 * "<name> needs a `data` path", "<data> is not a table", "<name> needs `<prop>` (a column name)",
 * "column 'c' not found in <data> (columns: …)".
 */
export async function loadTable(props, ctx, name, columns) {
  if (typeof props.data !== "string" || props.data === "") throw new Error(`${name} needs a \`data\` path`);
  const rows = await ctx.data(props.data, props.types ? { types: props.types } : undefined);
  if (!Array.isArray(rows)) throw new Error(`${props.data} is not a table (use a .csv file)`);
  const have = rows.length ? Object.keys(rows[0]) : [];
  for (const [prop, column, optional] of columns) {
    if (column === undefined && optional) continue;
    if (typeof column !== "string" || column === "") throw new Error(`${name} needs \`${prop}\` (a column name)`);
    if (!have.includes(column)) throw new Error(`column '${column}' not found in ${props.data} (columns: ${have.join(", ")})`);
  }
  return rows;
}

/** Tick label format: the prop's d3-format spec, else a fixed precision from the tick step (localized). */
export function tickFormat(ctx, spec, ticks) {
  if (spec) return ctx.format(spec);
  const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1;
  return ctx.format(`.${d3.precisionFixed(step || 1)}f`);
}

/** An `opacity` attribute value for a datum: none at full opacity. */
export const opacityAttr = (d) => (d.opacity === 1 ? null : d.opacity);
