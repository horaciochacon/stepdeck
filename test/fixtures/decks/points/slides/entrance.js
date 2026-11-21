// The chart appears at `go` and builds itself: the dots grow out from the reference line, then their whiskers
// draw outward, while the box stays still.
export default {
  id: "entrance",
  layout: "figure-notes",
  title: "Entrada propia",
  elements: [
    { id: "lead", region: "notes", type: "text", props: { text: "Cada punto sale de la media." } },
    { id: "points", region: "main", type: "chart.points", from: "go",
      props: { data: "data/estimates.csv", x: "region", y: "rate", interval: { lower: "low", upper: "high" },
               reference: { value: 11, label: "Media" }, format: { y: ",.1f" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
  steps: [
    { id: "start" },
    { id: "go" },
    { id: "more", only: { points: { highlight: "Norte" } } },
  ],
};
