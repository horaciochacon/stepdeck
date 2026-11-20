// A deliberately long node label: it wraps inside its box and `check` stays clean.
export default {
  id: "long",
  layout: "full-bleed",
  title: "Long labels wrap",
  elements: [
    { id: "flow", region: "main", type: "diagram",
      props: {
        cols: 3, rows: 1,
        nodes: [
          { id: "a", label: "Short", shape: "box", col: 0, row: 0 },
          { id: "b", label: "A much longer label that has to wrap over several lines", sub: "and a sub line", shape: "box", col: 1, row: 0 },
          { id: "c", label: "Round", shape: "circle", col: 2, row: 0 },
        ],
        edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
        groups: [{ id: "g", label: "Stage", contains: ["a", "b"] }],
      } },
  ],
};
