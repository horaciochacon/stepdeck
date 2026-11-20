// Two text cards and a diagram entering on one step. The diagram owns its entrance: it is held for the third
// stagger slot, then its group fades in, its nodes pop in one after another and its edges draw, while its box
// stays still. A later step shows one more node and edge.
const BASE = ["a", "b", "c", "pair", "a->b", "b->c"];
export default {
  id: "diagram-enters",
  layout: "figure-notes",
  title: "Built third",
  elements: [
    { id: "card-a", region: "notes", type: "text", props: { text: "First card" }, from: "go" },
    { id: "card-b", region: "notes", type: "text", props: { text: "Second card" }, from: "go" },
    { id: "diagram", region: "main", type: "diagram", from: "go",
      props: {
        cols: 4, rows: 1,
        nodes: [
          { id: "a", label: "Collect", shape: "box", col: 0, row: 0 },
          { id: "b", label: "Clean", shape: "box", col: 1, row: 0 },
          { id: "c", label: "Model", shape: "box", col: 2, row: 0 },
          { id: "d", label: "Report", shape: "box", col: 3, row: 0 },
        ],
        edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "d" }],
        groups: [{ id: "pair", label: "Prepare", contains: ["a", "b"] }],
        shown: [],
      } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic content." } },
  ],
  steps: [
    { id: "start" },
    { id: "go", set: { diagram: { shown: BASE } } },
    { id: "more", set: { diagram: { shown: [...BASE, "d", "c->d"] } } },
  ],
};
