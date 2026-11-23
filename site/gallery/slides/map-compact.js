// Map story: a compact map. A bar chart of the rates sits beside a small map of the same regions in a box, lit at the
// region the chart's step names, with one caption. Data: data/map/regions.geojson and data/map/rates.csv.
export default {
  id: "map-compact",
  layout: "figure-notes",
  title: "Rates differ across the regions",
  elements: [
    { id: "rates", region: "main", type: "chart.bar",
      props: { data: "data/map/rates.csv", x: "code", y: "rate", orient: "vertical", axes: { y: "Cases per 1,000" }, highlight: "W4" } },
    { id: "where", type: "map", box: { x: 1264, y: 250, w: 560, h: 420 },
      props: { boundaries: "data/map/regions.geojson", id: "code", compact: true, caption: "West", highlight: ["W4"] } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "west" },
    { id: "south", set: { rates: { highlight: "S1" }, where: { caption: "South", highlight: ["S1"] } } },
  ],
  notes: "A compact map in a box beside a chart, lit per step. Reference: docs/guide/second-views.md",
};
