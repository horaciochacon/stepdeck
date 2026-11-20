// Two text cards and a terminal entering on one step with four events shown. The terminal owns its entrance: it is
// held for the third stagger slot, then its command is typed and its lines fade in one after another, while its
// box stays still. A later step shows the rest of the session.
export default {
  id: "terminal-enters",
  layout: "figure-notes",
  title: "Typed third",
  elements: [
    { id: "card-a", region: "notes", type: "text", props: { text: "First card" }, from: "go" },
    { id: "card-b", region: "notes", type: "text", props: { text: "Second card" }, from: "go" },
    { id: "term", region: "main", type: "terminal", from: "go",
      props: { script: "data/session.json", shown: 0, typing: true } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic content." } },
  ],
  steps: [
    { id: "start" },
    { id: "go", set: { term: { shown: 4 } } },
    { id: "more", set: { term: { shown: 6 } } },
  ],
};
