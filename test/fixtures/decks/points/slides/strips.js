// Beeswarm strips: four regions with forty synthetic points each, one row per point (`id`). The chart appears at
// `go` and fades in from left to right; then the summary tick turns from the median to the mean, the second score
// moves every point (each slides to its new place in the swarm), and the tick goes.
export default {
  id: "strips",
  layout: "figure-notes",
  title: "Franjas de puntos",
  elements: [
    { id: "lead", region: "notes", type: "text", props: { text: "Cuarenta puntos por región." } },
    { id: "points", region: "main", type: "chart.points", from: "go",
      props: { data: "data/strips.csv", x: "region", y: "score", id: "id", format: { y: ",.1f" }, axes: { y: "Puntaje" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
  steps: [
    { id: "start" },
    { id: "go" },
    { id: "mean", set: { points: { summary: "mean" } } },
    { id: "later", set: { points: { y: "score2" } } },
    { id: "none", set: { points: { summary: "none" } } },
  ],
};
