// Example slide using `terminal`: `advance` sets `shown` step by step; the slide never patches the
// terminal's content. It reads data/session.json in the deck, which a new deck does not have: the
// script shape and a complete example are in this component's README (catalog terminal --json).
export default {
  id: "terminal-example",
  layout: "full-bleed",
  title: "An agent at work",
  elements: [
    { id: "term", region: "main", type: "terminal",
      props: { script: "data/session.json", shown: 0, typing: true },
      advance: { prop: "shown", values: [0, 4, 9, 22], start: "start" } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic agent session." } },
  ],
  steps: [{ id: "start" }, { id: "read" }, { id: "work" }, { id: "done" }],
};
