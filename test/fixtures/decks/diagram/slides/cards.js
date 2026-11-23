// Card nodes, and kinds on every shape: a kind takes the next colour of the categorical palette in order of
// first appearance (source, step, model), so the stripes and the outlines agree. A text node ignores its kind
// and takes no colour. The steps show nodes and an edge, then highlight one card.
const ALL = ["ingest", "clean", "model", "plain", "box", "pill", "dot", "note", "ingest->clean", "clean->model"];
export default {
  id: "cards",
  layout: "full-bleed",
  title: "Cards and kinds",
  elements: [
    { id: "cards", region: "main", type: "diagram",
      props: {
        cols: 4, rows: 2,
        nodes: [
          { id: "ingest", label: "Ingest", sub: "files and feeds", shape: "card", kind: "source", col: 0, row: 0 },
          { id: "clean", label: "Clean", sub: "fix the gaps", shape: "card", kind: "step", col: 1, row: 0 },
          { id: "model", label: "Model", sub: "fit and check", shape: "card", kind: "model", col: 2, row: 0 },
          { id: "plain", label: "Plain card", sub: "no kind", shape: "card", col: 3, row: 0 },
          { id: "box", label: "Box", shape: "box", kind: "source", col: 0, row: 1 },
          { id: "pill", label: "Pill", shape: "pill", kind: "step", col: 1, row: 1 },
          { id: "dot", label: "Dot", shape: "circle", kind: "model", col: 2, row: 1 },
          { id: "note", label: "Text", shape: "text", kind: "unused", col: 3, row: 1 },
        ],
        edges: [{ from: "ingest", to: "clean" }, { from: "clean", to: "model" }],
        shown: ["ingest", "clean"],
      } },
  ],
  steps: [
    { id: "start" },
    { id: "more", set: { cards: { shown: ALL } } },
    { id: "focus", set: { cards: { highlight: ["clean", "box", "clean->model"] } } },
  ],
};
