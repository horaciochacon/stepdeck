// Bars whose waterfall reaches well past the largest bar (80 + 30): the axis grows on the waterfall step, and the
// frame (margins, plot size, band labels) still stays the same at every step.
export default {
  id: "mode-switch-swing",
  layout: "full-bleed",
  title: "A waterfall taller than its bars",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/swing.csv", x: "item", y: "change", format: { y: ",.0f" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "bars" },
    { id: "waterfall", set: { bars: { mode: "waterfall", total: true } } },
    { id: "again", set: { bars: { mode: "bars", total: null } } },
  ],
};
