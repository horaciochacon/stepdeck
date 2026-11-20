// Two text cards and a bar chart with interval whiskers entering on one step. The chart owns its entrance: it is
// held for the third stagger slot, then its bars grow and their whiskers follow while its box stays still.
export default {
  id: "bar-third",
  layout: "figure-notes",
  title: "Grown third",
  elements: [
    { id: "card-a", region: "notes", type: "text", props: { text: "First card" }, from: "go" },
    { id: "card-b", region: "notes", type: "text", props: { text: "Second card" }, from: "go" },
    { id: "bars", region: "main", type: "chart.bar", from: "go",
      props: { data: "data/groups.csv", x: "group", y: "value", interval: { lower: "low", upper: "high" }, axes: { y: "Count" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "start" },
    { id: "go" },
    { id: "more", set: { bars: { highlight: "East" } } },
  ],
};
