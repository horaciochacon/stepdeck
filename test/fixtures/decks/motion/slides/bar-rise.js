// A bar chart with `enter: "rise"`: its box rises in and the bars are at full length from the first frame.
export default {
  id: "bar-rise",
  layout: "full-bleed",
  title: "Rising bars",
  elements: [
    { id: "bars", region: "main", type: "chart.bar", from: "go", enter: "rise",
      props: { data: "data/groups.csv", x: "group", y: "value", interval: { lower: "low", upper: "high" }, axes: { y: "Count" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [{ id: "start" }, { id: "go" }],
};
