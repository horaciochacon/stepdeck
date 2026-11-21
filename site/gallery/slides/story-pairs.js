// Data story: before and after. Each region's earlier value first; the next step adds `from` and moves `y`, so the
// filled dots slide while the connectors grow behind them. West has no earlier value, so it shows its end dot alone.
// Data: data/story-pairs.csv.
export default {
  id: "story-pairs",
  layout: "figure-notes",
  title: "Waits fell in most regions",
  elements: [
    { id: "points", region: "main", type: "chart.points",
      props: { data: "data/story-pairs.csv", x: "region", y: "before",
               format: { y: ",.0f" }, axes: { y: "Median wait, days" } } },
    { id: "note", region: "notes", type: "text", from: "now",
      props: { role: "note", text: "Hollow dot: before. Filled dot: now. West has no earlier value." } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "before" },
    { id: "now", set: { points: { y: "now", from: "before" } } },
    { id: "ranked", set: { points: { sort: "value" } } },
    { id: "rise", only: { points: { highlight: "Central" } } },
  ],
  notes: "Before and after: y: \"now\" with from: \"before\". An empty from shows the end dot alone. Reference: docs/reference/components/chart-points.md",
};
