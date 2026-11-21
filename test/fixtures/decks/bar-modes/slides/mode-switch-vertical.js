// Vertical bars switch to a waterfall and back. The frame (margins, plot size, band labels) is the same at every step.
export default {
  id: "mode-switch-vertical",
  layout: "full-bleed",
  title: "Vertical bars become a waterfall",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/flow.csv", x: "item", y: "change", orient: "vertical", format: { y: ",.0f" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "bars" },
    { id: "waterfall", set: { bars: { mode: "waterfall", total: true } } },
    { id: "again", set: { bars: { mode: "bars", total: null } } },
  ],
};
