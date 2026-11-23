// Process story: where we are. A result slide (estimates with intervals) carries a compact copy of the process in its
// right column, lit at the stage the result belongs to. The copy binds the same five props as the full
// diagram on explain-process, so the two cannot drift. Data: data/story-estimates.csv and data/process.json.
const process = {
  cols: "{{data/process.json#/cols}}",
  rows: "{{data/process.json#/rows}}",
  nodes: "{{data/process.json#/nodes}}",
  edges: "{{data/process.json#/edges}}",
  groups: "{{data/process.json#/groups}}",
};
export default {
  id: "explain-fit",
  layout: "figure-notes",
  title: "The fit puts some regions above average",
  elements: [
    { id: "points", region: "main", type: "chart.points",
      props: { data: "data/story-estimates.csv", x: "region", y: "rate", interval: { lower: "low", upper: "high" },
               reference: { value: 11.7, label: "Average" }, shown: ["North", "South", "East"],
               format: { y: ",.1f" }, axes: { y: "Uptake per 100, 95% interval" } } },
    { id: "where", type: "diagram", box: { x: 1264, y: 250, w: 560, h: 300 },
      props: { ...process, compact: true, caption: "Fitting the data", highlight: ["survey", "records", "fit", "survey-fit", "records-fit"] } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "three" },
    { id: "all", set: { points: { shown: null }, where: { caption: "Fitting: all regions", highlight: ["fit"] } } },
  ],
  notes: "A compact diagram in a box, lit per step, bound to the same data/process.json as explain-process. Reference: docs/guide/second-views.md",
};
