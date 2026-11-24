// A CSV with a header and no rows: the chart fails saying so. Its sibling carries on.
export default {
  id: "empty",
  layout: "full-bleed",
  title: "No rows",
  elements: [
    { id: "chart", region: "main", type: "chart.line", props: { data: "data/empty.csv", x: "year", y: "rate", axes: { x: "When", y: "Rate" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
};
