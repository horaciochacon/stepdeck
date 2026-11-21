// Regions appear by step; the hidden ones keep their row, and the axis covers every row from the start.
export default {
  id: "shown",
  layout: "figure-notes",
  title: "Una a una",
  elements: [
    { id: "points", region: "main", type: "chart.points",
      props: { data: "data/estimates.csv", x: "region", y: "rate", interval: { lower: "low", upper: "high" },
               reference: { value: 11, label: "Media" }, shown: [], format: { y: ",.1f" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
  steps: [
    { id: "none" },
    { id: "one", set: { points: { shown: ["Norte"] } } },
    { id: "three", set: { points: { shown: ["Norte", "Sur", "Este"] } } },
    { id: "all", set: { points: { shown: null } } },
  ],
};
