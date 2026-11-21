// Empty cells: Oeste has no estimate at `first` and Sur none at `later`. Each shows its label and "sin datos",
// never a dot at zero.
export default {
  id: "missing",
  layout: "figure-notes",
  title: "Sin datos",
  elements: [
    { id: "points", region: "main", type: "chart.points",
      props: { data: "data/missing.csv", x: "region", y: "rate", interval: { lower: "low", upper: "high" },
               reference: { value: 10, label: "Media" }, format: { y: ",.1f" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
  steps: [
    { id: "first" },
    { id: "later", set: { points: { y: "rate2", interval: { lower: "low2", upper: "high2" } } } },
  ],
};
