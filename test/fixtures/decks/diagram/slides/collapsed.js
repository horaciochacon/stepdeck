// A collapsed diagram (`display: none` until step `show`) whose `nodes` change on an earlier step: it is
// rebuilt while it has no size, and must be laid out again once it shows.
const nodes = (label) => [
  { id: "a", label, shape: "box", col: 0, row: 0 },
  { id: "b", label: "Model", shape: "pill", col: 1, row: 0 },
];
export default {
  id: "collapsed",
  layout: "full-bleed",
  title: "Collapsed until shown",
  elements: [
    { id: "lead", region: "main", type: "text", props: { text: "A line above the diagram." } },
    { id: "flow", region: "main", type: "diagram", from: "show", collapse: true,
      props: { cols: 2, rows: 1, nodes: nodes("Data"), edges: [{ from: "a", to: "b" }] } },
  ],
  steps: [
    { id: "start" },
    { id: "rename", set: { flow: { nodes: nodes("Inputs") } } },
    { id: "show" },
  ],
};
