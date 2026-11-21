// A re-sort on the step where a row appears. Oeste has no estimate: it ranks last either way. Hidden rows keep
// their place in the order, and a row that appears grows in at its final place while the others slide. At `less`
// two rows leave without a new order.
export default {
  id: "resort-shown",
  layout: "figure-notes",
  title: "Orden y filas nuevas",
  elements: [
    { id: "points", region: "main", type: "chart.points",
      props: { data: "data/missing.csv", x: "region", y: "rate", interval: { lower: "low", upper: "high" },
               shown: ["Norte", "Sur"], format: { y: ",.1f" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
  steps: [
    { id: "start" },
    { id: "both", set: { points: { shown: ["Norte", "Sur", "Este"], sort: "-value" } } },
    { id: "all", set: { points: { shown: null } } },
    { id: "flip", set: { points: { sort: "value" } } },
    { id: "less", set: { points: { shown: ["Sur", "Este"] } } },
  ],
};
