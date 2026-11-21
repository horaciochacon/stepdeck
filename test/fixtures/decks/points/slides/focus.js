// One item followed across the strips: at `focus` its dots are ringed and raised, a line joins them, and every
// other dot turns the dim colour; then the strips re-sort by their median (the line follows), and another item is
// followed instead.
export default {
  id: "focus",
  layout: "figure-notes",
  title: "Un punto en cada franja",
  elements: [
    { id: "points", region: "main", type: "chart.points",
      props: { data: "data/strips.csv", x: "region", y: "score", id: "id", format: { y: ",.1f" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
  steps: [
    { id: "strips" },
    { id: "focus", set: { points: { focus: "p07" } } },
    { id: "resort", set: { points: { sort: "-value" } } },
    { id: "next", set: { points: { focus: "p23" } } },
  ],
};
