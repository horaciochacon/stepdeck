// The fan with a sweep into a forecast and a highlight. The draws appear on the second step (the y axis has room for
// them from the first, which has none), the sweep carries the lines and the draws on to 2050, past the forecast start,
// and a one-step highlight dims the draws of the other series.
const data = { data: "data/trend.csv", x: "year", y: "rate", series: "series", forecast: { from: 2030 }, format: { x: "d" }, axes: { x: "Year", y: "Rate" } };
export default {
  id: "fan-sweep",
  layout: "full-bleed",
  title: "Draws over time",
  elements: [
    { id: "chart", region: "main", type: "chart.line", props: { ...data, until: 2020, ticker: true } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "start" },
    { id: "fan", set: { chart: { draws: { data: "data/draws.csv", id: "draw", shown: 20 } } } },
    { id: "swept", set: { chart: { until: 2050 } } },
    { id: "focus", only: { chart: { highlight: "south" } } },
  ],
};
