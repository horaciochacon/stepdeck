// `shown` names 'nope' at the second step only: one diagram-id problem, reported at that step.
export default {
  id: "s", title: "Unknown diagram id",
  elements: [
    { id: "flow", type: "diagram", props: {
      cols: 2, rows: 1,
      nodes: [
        { id: "a", label: "Data", shape: "box", col: 0, row: 0 },
        { id: "b", label: "Model", shape: "box", col: 1, row: 0 },
      ],
      edges: [{ from: "a", to: "b" }],
      shown: ["a"],
    } },
  ],
  steps: [{ id: "one" }, { id: "two", set: { flow: { shown: ["a", "nope"] } } }],
};
