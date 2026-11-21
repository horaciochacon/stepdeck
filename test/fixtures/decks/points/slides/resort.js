// The rows re-sort by value: data order at `data`, then the highest first, then a listed pair first, then the
// second estimate set (`y` and the interval change together) still highest first. Each row slides to its new place.
export default {
  id: "resort",
  layout: "figure-notes",
  title: "Orden por valor",
  elements: [
    { id: "points", region: "main", type: "chart.points",
      props: { data: "data/estimates.csv", x: "region", y: "rate", interval: { lower: "low", upper: "high" },
               format: { y: ",.1f" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
  steps: [
    { id: "data" },
    { id: "desc", set: { points: { sort: "-value" } } },
    { id: "list", set: { points: { sort: ["Oeste", "Centro"] } } },
    { id: "later", set: { points: { sort: "-value", y: "rate2", interval: { lower: "low2", upper: "high2" } } } },
  ],
};
