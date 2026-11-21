// `draws.shown` asks for more draws than data/draws.csv has (3): the chart fails naming both numbers; its sibling carries on.
export default {
  id: "fan-errors",
  layout: "full-bleed",
  title: "Too many draws asked for",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/trend.csv", x: "year", y: "rate", series: "series", draws: { data: "data/draws.csv", id: "draw", shown: 5 },
               format: { x: "d" }, axes: { x: "Year", y: "Rate" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
};
