// Values that are all negative over three whole years: the y axis ends at zero (never above it), and the x axis has
// one tick per year, none in between.
export default {
  id: "below",
  layout: "full-bleed",
  title: "All below zero",
  elements: [
    { id: "chart", region: "main", type: "chart.line", props: { data: "data/below.csv", x: "year", y: "rate", format: { x: "d" }, axes: { x: "Year", y: "Change" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [{ id: "start" }],
};
