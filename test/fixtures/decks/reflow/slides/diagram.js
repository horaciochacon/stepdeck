// A diagram below a collapse note that appears at step `two`.
export default {
  id: "diagram",
  layout: "full-bleed",
  title: "diagram",
  elements: [
    { id: "note", region: "main", type: "text", from: "two", collapse: true,
      props: { text: "A note that takes room when it appears. A note that takes room when it appears. A note that takes room when it appears. A note that takes room when it appears. A note that takes room when it appears. A note that takes room when it appears." } },
    { id: "fig", region: "main", type: "diagram",
      props: { cols: 2, rows: 2,
               nodes: [{ id: "a", label: "Data", shape: "box", col: 0, row: 0 }, { id: "b", label: "Model", shape: "pill", col: 1, row: 0 }, { id: "c", label: "Checks", shape: "box", col: 1, row: 1 }],
               edges: [{ from: "a", to: "b" }, { from: "c", to: "b" }] } },
  ],
  steps: [{ id: "one" }, { id: "two" }],
};
