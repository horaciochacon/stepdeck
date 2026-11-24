// An x column of dates: chart.line has a linear x axis, so the chart fails saying the column has no numbers. Its sibling carries on.
export default {
  id: "dates",
  layout: "full-bleed",
  title: "Dates on x",
  elements: [
    { id: "chart", region: "main", type: "chart.line", props: { data: "data/dates.csv", x: "date", y: "rate", axes: { x: "When", y: "Rate" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
};
