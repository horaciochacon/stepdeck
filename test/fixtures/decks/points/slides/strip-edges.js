// Strips at their edges: a strip with a single row, one whose values are all equal, one without the followed item
// (the line skips it), and one with no value at all ("sin datos"). Then the strips are sorted by their median, highest
// first (the empty one stays last); the equal strip leaves (the line goes: one strip has the item left), and comes back.
export default {
  id: "strip-edges",
  layout: "figure-notes",
  title: "Franjas en los bordes",
  elements: [
    { id: "points", region: "main", type: "chart.points",
      props: { data: "data/strip-edges.csv", x: "region", y: "score", id: "id", focus: "a01", format: { y: ",.1f" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
  steps: [
    { id: "edges" },
    { id: "sorted", set: { points: { sort: "-value" } } },
    { id: "less", set: { points: { shown: ["Uno", "Varios", "Vacío"] } } },
    { id: "all", set: { points: { shown: null } } },
  ],
};
