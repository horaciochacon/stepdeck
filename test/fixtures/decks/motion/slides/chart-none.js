// A line chart with `enter: "none"`: it appears drawn, with no motion of its box or its line.
export default {
  id: "chart-none",
  layout: "full-bleed",
  title: "No entrance",
  elements: [
    { id: "chart", region: "main", type: "chart.line", from: "go", enter: "none",
      props: { data: "data/trend.csv", x: "week", y: "count", axes: { x: "Week", y: "Count" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [{ id: "start" }, { id: "go" }],
};
