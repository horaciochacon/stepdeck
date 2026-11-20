// A deliberately long category name wraps inside the band axis instead of overflowing.
export default {
  id: "long",
  layout: "figure-notes",
  title: "Categoría larga",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/long.csv", x: "category", y: "value", axes: { y: "Valor" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
};
