// From 2000 to 2050 every 5 years. `from: 2022` falls between two data points (a boundary point is made);
// `from: 2025` is a data x (no duplicated point).
const data = { data: "data/trend.csv", x: "year", y: "rate", series: "series", interval: { lower: "lo", upper: "hi" }, format: { x: "d" }, axes: { x: "Year", y: "Rate" } };
export default {
  id: "forecast",
  layout: "full-bleed",
  title: "Observed and forecast",
  elements: [
    { id: "chart", region: "main", type: "chart.line", props: data },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "none" },
    { id: "points", set: { chart: { points: true } } },
    { id: "forecast", set: { chart: { forecast: { from: 2022 } } } },
    { id: "label", set: { chart: { forecast: { from: 2022, label: "Projected" } } } },
    { id: "exact", set: { chart: { forecast: { from: 2025 } } } },
  ],
};
