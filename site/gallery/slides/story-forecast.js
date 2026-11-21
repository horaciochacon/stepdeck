// Data story: a forecast and a sweep. The lines sweep along the years behind a ticker; the forecast starts at 2024, so
// the sweep crosses into a shaded region where the lines turn dotted and the interval widens. Data: data/story-forecast.csv.
export default {
  id: "story-forecast",
  layout: "full-bleed",
  title: "North keeps climbing while South turns down",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/story-forecast.csv", x: "year", y: "demand", series: "series",
               interval: { lower: "low", upper: "high" }, forecast: { from: 2024 }, until: 2012, ticker: true,
               format: { x: "d" }, axes: { x: "Year", y: "Demand index" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "start" },
    { id: "observed", set: { chart: { until: 2024 } } },
    { id: "forecast", set: { chart: { until: 2040 } } },
    { id: "focus", only: { chart: { highlight: "North" } } },
  ],
  notes: "Forecast and sweep: forecast.from on the element, until on the steps, ticker for the year counter. Reference: docs/reference/components/chart-line.md",
};
