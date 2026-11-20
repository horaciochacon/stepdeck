// Spanish deck: 12.5 with ",.1f" reads 12,5 in the labels, and so do the ticks and the interval text.
// The notes region is filled, so the chart is seen at the width a real slide gives it.
export default {
  id: "decimal",
  layout: "figure-notes",
  title: "Coma decimal",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/values.csv", x: "group", y: "value", interval: { lower: "low", upper: "high" }, format: { y: ",.1f" } } },
    { id: "note", region: "notes", type: "text", props: { text: "La barra marca la estimación y el bigote su intervalo." } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
};
