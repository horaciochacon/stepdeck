// Vertical bars with axis titles; one bar is highlighted for a step.
export default {
  id: "vertical",
  layout: "figure-notes",
  title: "Barras verticales",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/values.csv", x: "group", y: "value", orient: "vertical", format: { y: ",.1f" },
               axes: { x: "Grupo", y: "Valor" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
  steps: [
    { id: "all" },
    { id: "focus", only: { bars: { highlight: "c" } } },
    { id: "later", set: { bars: { y: "later" } } },
  ],
};
