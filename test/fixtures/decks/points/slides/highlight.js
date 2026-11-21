// One region in focus for a step (the others turn the theme's dim colour), then the second estimate set, then a
// wider axis set with `domain` (its longer tick labels had their room from the start, so the plot keeps its size).
export default {
  id: "highlight",
  layout: "figure-notes",
  title: "Una región destacada",
  elements: [
    { id: "points", region: "main", type: "chart.points",
      props: { data: "data/estimates.csv", x: "region", y: "rate", interval: { lower: "low", upper: "high" },
               format: { y: ",.1f" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
  steps: [
    { id: "all" },
    { id: "focus", only: { points: { highlight: "Este" } } },
    { id: "after", set: { points: { y: "rate2", interval: { lower: "low2", upper: "high2" } } } },
    { id: "wide", set: { points: { domain: [0, 120] } } },
  ],
};
