// Process story: where we are, later. The same compact copy as on explain-fit, now lit at the next stage, beside a
// forecast. Data: data/story-forecast.csv and data/process.json.
const process = {
  cols: "{{data/process.json#/cols}}",
  rows: "{{data/process.json#/rows}}",
  nodes: "{{data/process.json#/nodes}}",
  edges: "{{data/process.json#/edges}}",
  groups: "{{data/process.json#/groups}}",
};
export default {
  id: "explain-predict",
  layout: "figure-notes",
  title: "The forecast keeps North climbing",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/story-forecast.csv", x: "year", y: "demand", series: "series",
               interval: { lower: "low", upper: "high" }, forecast: { from: 2024 }, until: 2024,
               format: { x: "d" }, axes: { x: "Year", y: "Demand index" } } },
    { id: "where", type: "diagram", box: { x: 1264, y: 250, w: 560, h: 300 },
      props: { ...process, compact: true, caption: "Predicting", highlight: ["predict", "fit-predict"] } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "observed" },
    { id: "forecast", set: { chart: { until: 2040 }, where: { caption: "Predicting: outputs", highlight: ["predict", "predict-tables", "predict-briefs", "tables", "briefs"] } } },
  ],
  notes: "The same compact diagram as explain-fit, lit at the next stage. Reference: docs/guide/second-views.md",
};
