// A terminal below a collapse note that appears at step `two`.
export default {
  id: "terminal",
  layout: "full-bleed",
  title: "terminal",
  elements: [
    { id: "note", region: "main", type: "text", from: "two", collapse: true,
      props: { text: "A note that takes room when it appears. A note that takes room when it appears. A note that takes room when it appears. A note that takes room when it appears. A note that takes room when it appears. A note that takes room when it appears." } },
    { id: "fig", region: "main", type: "terminal", props: { script: "data/session.json", shown: 30 } },
  ],
  steps: [{ id: "one" }, { id: "two" }],
};
