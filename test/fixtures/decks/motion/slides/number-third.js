// Two text cards and a big number entering on one step. The number owns its entrance: it is held for the third
// stagger slot, then counts up from 0 while its box stays still. A later step changes its label.
export default {
  id: "number-third",
  layout: "figure-notes",
  title: "Counted third",
  elements: [
    { id: "card-a", region: "notes", type: "text", props: { text: "First card" }, from: "go" },
    { id: "card-b", region: "notes", type: "text", props: { text: "Second card" }, from: "go" },
    { id: "num", region: "main", type: "big-number", from: "go", props: { value: 4820, format: ",.0f", label: "items counted" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "start" },
    { id: "go" },
    { id: "more", set: { num: { label: "items counted in total" } } },
  ],
};
