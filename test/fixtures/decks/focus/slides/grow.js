// A node and an edge appear on the step that also moves the highlight, so the colour change runs beside a build
// that takes much longer (the node pops in, then the edge draws).
export default {
  id: "grow",
  layout: "full-bleed",
  title: "Focus while growing",
  elements: [
    { id: "flow", region: "main", type: "diagram",
      props: {
        cols: 4, rows: 1,
        nodes: [
          { id: "a", label: "Collect", shape: "box", col: 0, row: 0 },
          { id: "b", label: "Clean", shape: "box", col: 1, row: 0 },
          { id: "c", label: "Review", shape: "box", col: 2, row: 0 },
          { id: "d", label: "Report", shape: "box", col: 3, row: 0 },
        ],
        edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "d" }],
        shown: ["a", "b", "c", "a->b", "b->c"],
      } },
  ],
  steps: [
    { id: "base" },
    { id: "grow", set: { flow: { shown: ["a", "b", "c", "d", "a->b", "b->c", "c->d"] } }, only: { flow: { highlight: ["a", "a->b", "d", "c->d"] } } },
  ],
};
