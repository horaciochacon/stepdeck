// A `sort` column the data does not have: the chart fails naming it and the columns; the source line still renders.
export default {
  id: "sort-error",
  layout: "full-bleed",
  title: "Sorting by a missing column",
  elements: [
    { id: "bars", region: "main", type: "chart.bar", props: { data: "data/values.csv", x: "group", y: "score", sort: { by: "pace" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
};
