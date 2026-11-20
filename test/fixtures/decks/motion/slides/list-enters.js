// Two text cards and a checklist entering on one step while `shown` goes 0 -> 3. The list owns its entrance: it
// is held for the third stagger slot, then its items rise in one after another and the done ticks draw, while
// its box stays still. A later step ticks the last item.
export default {
  id: "list-enters",
  layout: "figure-notes",
  title: "Built third",
  elements: [
    { id: "card-a", region: "notes", type: "text", props: { text: "First card" }, from: "go" },
    { id: "card-b", region: "notes", type: "text", props: { text: "Second card" }, from: "go" },
    { id: "list", region: "main", type: "list", from: "go",
      props: { marker: "check", shown: 0, done: 0, items: [
        { text: "Draft the outline" },
        { text: "Collect the figures" },
        { text: "Review the summary" },
      ] } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic content." } },
  ],
  steps: [
    { id: "start" },
    { id: "go", set: { list: { shown: 3, done: 2 } } },
    { id: "more", set: { list: { shown: 3, done: 3 } } },
  ],
};
