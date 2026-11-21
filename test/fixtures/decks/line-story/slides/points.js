// Markers while series appear and y changes; the forecast starts at a data x.
export default {
  id: "points",
  layout: "full-bleed",
  title: "Markers",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/trend.csv", x: "year", y: "rate", series: "series", series_shown: ["north"], points: true, forecast: { from: 2030 }, format: { x: "d" }, axes: { x: "Year", y: "Rate" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "one" },
    { id: "both", set: { chart: { series_shown: ["north", "south"] } } },
    { id: "alt", set: { chart: { y: "alt" } } },
    { id: "focus", only: { chart: { highlight: "south" } } },
  ],
};
