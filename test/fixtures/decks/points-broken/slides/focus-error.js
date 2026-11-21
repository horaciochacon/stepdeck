// A `focus` id the data does not have: the chart fails naming it and the file; the source line still renders.
export default {
  id: "focus-error",
  layout: "figure-notes",
  title: "Un punto que no existe",
  elements: [
    { id: "points", region: "main", type: "chart.points",
      props: { data: "data/strips.csv", x: "region", y: "score", id: "id", focus: "p99" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
};
