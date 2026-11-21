// The draw fan: 300 synthetic draws per series around the trend (data/draws.csv). `shown` rises 0 -> 1 -> 20 -> 200,
// then falls back to 20. The draws reach above the trend's own range, so the y axis makes room for them from the first step.
const data = { data: "data/trend.csv", x: "year", y: "rate", series: "series", format: { x: "d" }, axes: { x: "Year", y: "Rate" } };
export default {
  id: "fan",
  layout: "full-bleed",
  title: "Uncertainty draws",
  elements: [
    { id: "chart", region: "main", type: "chart.line", props: { ...data, draws: { data: "data/draws.csv", id: "draw", shown: 0 } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "none" },
    { id: "one", set: { chart: { draws: { shown: 1 } } } },
    { id: "few", set: { chart: { draws: { shown: 20 } } } },
    { id: "many", set: { chart: { draws: { shown: 200 } } } },
    { id: "fewer", set: { chart: { draws: { shown: 20 } } } },
  ],
};
