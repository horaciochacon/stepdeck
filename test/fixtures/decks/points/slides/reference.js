// A reference line across every row: it fades in with its label, then moves to another value and label.
export default {
  id: "reference",
  layout: "figure-notes",
  title: "Frente a la media",
  elements: [
    { id: "points", region: "main", type: "chart.points",
      props: { data: "data/estimates.csv", x: "region", y: "rate", interval: { lower: "low", upper: "high" },
               format: { y: ",.1f" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
  steps: [
    { id: "none" },
    { id: "line", set: { points: { reference: { value: 11, label: "Media" } } } },
    { id: "moved", set: { points: { reference: 9 } } },
  ],
};
