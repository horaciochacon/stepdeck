// A `diagram` built over three steps: the exposure, then the outcome, then the labelled arrow between them.
// The outcome node carries the deck's deliberately long node label, which wraps inside its box.
export default {
  id: "concept",
  layout: "full-bleed",
  title: "The idea in one arrow",
  elements: [
    { id: "idea", region: "main", type: "diagram",
      props: {
        cols: 3, rows: 1,
        nodes: [
          { id: "exposure", label: "Exposure", sub: "how much, how long", shape: "box", col: 0, row: 0 },
          { id: "outcome", label: "Outcome measured a year later in the same people", sub: "cases per 100", shape: "box", col: 2, row: 0 },
        ],
        edges: [{ id: "link", from: "exposure", to: "outcome", label: "raises the risk of" }],
        shown: ["exposure"],
      } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic concept diagram." } },
  ],
  steps: [
    { id: "exposure" },
    { id: "outcome", set: { idea: { shown: ["exposure", "outcome"] } } },
    { id: "link", set: { idea: { shown: ["exposure", "outcome", "link"] } } },
  ],
};
