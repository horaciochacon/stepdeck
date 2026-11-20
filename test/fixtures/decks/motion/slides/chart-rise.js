// A line chart with `enter: "rise"`: its box rises in and the line is drawn from the first frame.
export default {
  id: "chart-rise",
  layout: "full-bleed",
  title: "A rising chart",
  elements: [
    { id: "chart", region: "main", type: "chart.line", from: "go", enter: "rise",
      props: { data: "data/trend.csv", x: "week", y: "count", axes: { x: "Week", y: "Count" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [{ id: "start" }, { id: "go" }],
};
