// Two text cards and a line chart entering on one step. The chart owns its entrance: it is held for the third
// stagger slot and then draws its line while its box stays still. A later step adds an annotation.
export default {
  id: "chart-third",
  layout: "figure-notes",
  title: "Drawn third",
  elements: [
    { id: "card-a", region: "notes", type: "text", props: { text: "First card" }, from: "go" },
    { id: "card-b", region: "notes", type: "text", props: { text: "Second card" }, from: "go" },
    { id: "chart", region: "main", type: "chart.line", from: "go",
      props: { data: "data/trend.csv", x: "week", y: "count", axes: { x: "Week", y: "Count" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "start" },
    { id: "go" },
    { id: "more", set: { chart: { annotate: [{ x: 5, label: "Week 5" }] } } },
  ],
};
