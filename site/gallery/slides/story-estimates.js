// Data story: estimates with intervals. Three regions appear against a dashed average, the rest join them, the rows
// re-sort from highest to lowest, and one step singles out the leader. Data: data/story-estimates.csv.
export default {
  id: "story-estimates",
  layout: "figure-notes",
  title: "Two regions sit clear above the average",
  elements: [
    { id: "points", region: "main", type: "chart.points",
      props: { data: "data/story-estimates.csv", x: "region", y: "rate", interval: { lower: "low", upper: "high" },
               reference: { value: 11.7, label: "Average" }, shown: ["North", "South", "East"],
               format: { y: ",.1f" }, axes: { y: "Uptake per 100, 95% interval" } } },
    { id: "note", region: "notes", type: "text", from: "all",
      props: { role: "note", text: "A whisker that crosses the dashed line is not clearly different from the average." } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "three" },
    { id: "all", set: { points: { shown: null } } },
    { id: "ranked", set: { points: { sort: "-value" } } },
    { id: "leader", only: { points: { highlight: "Coastal" } } },
  ],
  notes: "Estimates with intervals: shown reveals rows out of the reference line, sort re-ranks them in one motion. Reference: docs/reference/components/chart-points.md",
};
