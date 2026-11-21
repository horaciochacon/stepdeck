// Data, then forecast: the forecast starts in 2023, a year with no data (the boundary point is made). The sweep
// stops at 2010, then on 2023 itself (the whole line observed, no region yet), then carries the line into its
// dotted forecast and reveals the shaded region as it passes.
const data = { data: "data/trend.csv", x: "year", y: "rate", series: "series", interval: { lower: "lo", upper: "hi" }, points: true, forecast: { from: 2023 }, format: { x: "d" }, axes: { x: "Year", y: "Rate" } };
export default {
  id: "story",
  layout: "full-bleed",
  title: "Data, then forecast",
  elements: [
    { id: "chart", region: "main", type: "chart.line", props: { ...data, until: 2010, ticker: true } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "start" },
    { id: "observed", set: { chart: { until: 2023 } } },
    { id: "forecast", set: { chart: { until: 2050 } } },
  ],
};
