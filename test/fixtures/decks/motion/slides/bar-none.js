// A bar chart with `enter: "none"`: it appears at full length, with no motion of its box or its bars.
export default {
  id: "bar-none",
  layout: "full-bleed",
  title: "No entrance",
  elements: [
    { id: "bars", region: "main", type: "chart.bar", from: "go", enter: "none",
      props: { data: "data/groups.csv", x: "group", y: "value", interval: { lower: "low", upper: "high" }, axes: { y: "Count" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [{ id: "start" }, { id: "go" }],
};
