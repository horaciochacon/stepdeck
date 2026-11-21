// `forecast.from` = 1990, before the first year: the whole line is forecast.
export default {
  id: "forecast-early",
  layout: "full-bleed",
  title: "Forecast from outside the data (early)",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/trend.csv", x: "year", y: "rate", series: "series", points: true, forecast: { from: 1990 }, format: { x: "d" }, axes: { x: "Year", y: "Rate" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [{ id: "all" }],
};
