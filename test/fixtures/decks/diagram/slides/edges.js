// Both nodes are shown from the start; the edge between them only once `shown` lists its id.
export default {
  id: "edges",
  layout: "full-bleed",
  title: "An edge by id",
  elements: [
    { id: "pair", region: "main", type: "diagram",
      props: {
        cols: 2, rows: 1,
        nodes: [
          { id: "a", label: "Question", shape: "box", col: 0, row: 0 },
          { id: "b", label: "Answer", shape: "box", col: 1, row: 0 },
        ],
        edges: [{ id: "link", from: "a", to: "b", label: "leads to" }],
        shown: ["a", "b"],
      } },
  ],
  steps: [
    { id: "nodes" },
    { id: "edge", set: { pair: { shown: ["a", "b", "link"] } } },
  ],
};
