// One line without `series`, so no label sits in the right margin: the margin still has to clear the last x tick label
// (2050), which is centred on the plot's right end and wider than the margin's minimum.
export default {
  id: "single",
  layout: "full-bleed",
  title: "One line without series",
  elements: [
    { id: "chart", region: "main", type: "chart.line", props: { data: "data/single.csv", x: "year", y: "rate", format: { x: "d" }, axes: { x: "Year", y: "Rate" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [{ id: "start" }],
};
