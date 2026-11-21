// Estimates with a 95% interval, one row per region. `y` and the interval switch together at `later` (the axis
// covers both, so it stays put), and the axis titles fade in at `titled` (the plot keeps its size).
export default {
  id: "estimates",
  layout: "figure-notes",
  title: "Estimaciones por región",
  elements: [
    { id: "points", region: "main", type: "chart.points",
      props: { data: "data/estimates.csv", x: "region", y: "rate", interval: { lower: "low", upper: "high" },
               format: { y: ",.1f" }, axes: { y: "Tasa por 1.000" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
  steps: [
    { id: "base" },
    { id: "later", set: { points: { y: "rate2", interval: { lower: "low2", upper: "high2" } } } },
    { id: "titled", set: { points: { axes: { x: "Región", y: "Tasa ajustada" } } } },
  ],
};
