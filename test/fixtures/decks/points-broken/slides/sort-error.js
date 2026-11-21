// A `sort` column the data does not have: the chart fails naming it and the columns; the source line still renders.
export default {
  id: "sort-error",
  layout: "figure-notes",
  title: "Orden por una columna que no existe",
  elements: [
    { id: "points", region: "main", type: "chart.points",
      props: { data: "data/estimates.csv", x: "region", y: "rate", sort: { by: "ritmo" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
};
