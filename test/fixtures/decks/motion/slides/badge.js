// Text badges: one with the theme's accent colour, one with a palette tone that changes (and whose text changes)
// on a later step while it is on screen.
export default {
  id: "badge",
  layout: "full-bleed",
  title: "Status badges",
  elements: [
    { id: "plain", region: "main", type: "text", props: { role: "badge", text: "Draft" } },
    { id: "toned", region: "main", type: "text", props: { role: "badge", tone: 1, text: "In review" } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic content." } },
  ],
  steps: [
    { id: "start" },
    { id: "done", set: { toned: { tone: 0, text: "Approved" } } },
    { id: "same-text", set: { toned: { tone: 1 } } },
  ],
};
