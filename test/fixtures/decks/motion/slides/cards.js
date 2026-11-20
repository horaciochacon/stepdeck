// Three cards entering on one step, staggered in slide order; a note follows on the next step.
export default {
  id: "cards",
  layout: "full-bleed",
  title: "Three cards",
  elements: [
    { id: "card-a", region: "main", type: "text", props: { text: "First card" }, from: "go" },
    { id: "card-b", region: "main", type: "text", props: { text: "Second card" }, from: "go" },
    { id: "card-c", region: "main", type: "text", props: { text: "Third card" }, from: "go" },
    { id: "note", region: "main", type: "text", props: { text: "A note after the cards", role: "note" }, from: "more" },
  ],
  steps: [{ id: "start" }, { id: "go" }, { id: "more" }],
};
