// `forecast.from` = 2060, after the last year: there is no forecast part and no region.
export default {
  id: "forecast-late",
  layout: "full-bleed",
  title: "Forecast from outside the data (late)",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/trend.csv", x: "year", y: "rate", series: "series", points: true, forecast: { from: 2060 }, format: { x: "d" }, axes: { x: "Year", y: "Rate" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [{ id: "all" }],
};
