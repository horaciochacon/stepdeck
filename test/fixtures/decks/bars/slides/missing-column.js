// `y` names a column that data/values.csv does not have; the chart fails naming it, the rest still renders.
export default {
  id: "missing-column",
  layout: "full-bleed",
  title: "Columna ausente",
  elements: [
    { id: "bars", region: "main", type: "chart.bar", props: { data: "data/values.csv", x: "group", y: "valeu" } },
    { id: "ok", region: "main", type: "text", props: { text: "Los demás elementos se muestran." } },
  ],
};
