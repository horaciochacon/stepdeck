// Two text cards and a chat entering on one step with two messages shown. The chat owns its entrance: it is
// held for the third stagger slot, then its messages rise in and the newest is typed, while its box stays
// still. A later step adds the third message.
export default {
  id: "chat-enters",
  layout: "figure-notes",
  title: "Built, then typed",
  elements: [
    { id: "card-a", region: "notes", type: "text", props: { text: "First card" }, from: "go" },
    { id: "card-b", region: "notes", type: "text", props: { text: "Second card" }, from: "go" },
    { id: "chat", region: "main", type: "chat", from: "go",
      props: { style: "bubbles", typing: true, shown: 0, messages: [
        { role: "user", label: "You", text: "Can we check this against held-out data?" },
        { role: "agent", label: "Agent", text: "Yes. I will set aside a test split and report the error on it." },
        { role: "user", text: "Good, go ahead." },
      ] } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic content." } },
  ],
  steps: [
    { id: "start" },
    { id: "go", set: { chat: { shown: 2 } } },
    { id: "more", set: { chat: { shown: 3 } } },
  ],
};
