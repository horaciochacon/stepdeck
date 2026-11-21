// What `validate` reports about the chart components' props, beyond their schemas. Pure and free of imports,
// so the CLI loads it in plain Node.
//
// chartProblems(type, props) -> [{ rule, severity: "warning" | "error", message, limit, fix }]
//   `props` are the element's resolved props at one step, already valid against the component's schema.
//   `validate` maps each item to a Problem (measured = message; severity "warning" is reported, not failed).
//   A type this file does not know gives [].
//
// Rules:
//   chart-prop-unused (warning)   chart.line: `ticker` without `until` counts nothing.
//                                 chart.bar: `invert` (true) and `total` (true or a label) without
//                                 `mode: "waterfall"` change nothing on plain bars.

const unused = (prop, needs) => ({
  rule: "chart-prop-unused",
  severity: "warning",
  message: `\`${prop}\` does nothing without \`${needs}\``,
  limit: `\`${prop}\` together with \`${needs}\``,
  fix: `set \`${needs}\`, or remove \`${prop}\``,
});

/**
 * @param {string} type the element's component type, e.g. "chart.line"
 * @param {Record<string, unknown> | null | undefined} props
 * @returns {Array<{ rule: string, severity: "warning" | "error", message: string, limit: string, fix: string }>}
 */
export function chartProblems(type, props) {
  if (props === null || typeof props !== "object") return [];
  const found = [];
  if (type === "chart.line") {
    if (props.ticker === true && (props.until === undefined || props.until === null)) found.push(unused("ticker", "until"));
  }
  if (type === "chart.bar" && props.mode !== "waterfall") {
    if (props.invert === true) found.push(unused("invert", 'mode: "waterfall"'));
    if (props.total === true || (typeof props.total === "string" && props.total !== "")) found.push(unused("total", 'mode: "waterfall"'));
  }
  return found;
}
