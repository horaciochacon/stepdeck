// A time sweep with a ticker over points and a band. `full` has no `until`; then `until` runs before the first
// year (1990), on the first (2000), between two (2007), on a data year (2020), between two (2042) and past the
// last (2060). The x domain is 2000 to 2050 throughout.
const data = { data: "data/trend.csv", x: "year", y: "rate", series: "series", interval: { lower: "lo", upper: "hi" }, points: true, format: { x: "d" }, axes: { x: "Year", y: "Rate" } };
export default {
  id: "sweep",
  layout: "full-bleed",
  title: "Time sweep",
  elements: [
    { id: "chart", region: "main", type: "chart.line", props: data },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "full" },
    { id: "before", set: { chart: { until: 1990, ticker: true } } },
    { id: "first", set: { chart: { until: 2000 } } },
    { id: "between", set: { chart: { until: 2007 } } },
    { id: "on", set: { chart: { until: 2020 } } },
    { id: "late", set: { chart: { until: 2042 } } },
    { id: "after", set: { chart: { until: 2060 } } },
  ],
};
