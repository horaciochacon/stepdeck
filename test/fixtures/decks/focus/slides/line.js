// Three series with bands; each highlight step lasts one step (`only`). alpha is the first series in the data.
export default {
  id: "line",
  layout: "full-bleed",
  title: "Focus on a series",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/series.csv", x: "week", y: "count", series: "group", interval: { lower: "low", upper: "high" }, axes: { x: "Week", y: "Count" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "all" },
    { id: "a", only: { chart: { highlight: "alpha" } } },
    { id: "b", only: { chart: { highlight: "beta" } } },
    { id: "end" },
  ],
};
