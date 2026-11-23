// The full view's caption draws nothing; the compact copy's is its one line of text.
const props = {
  cols: 2, rows: 1,
  nodes: [
    { id: "a", label: "Data", shape: "box", col: 0, row: 0 },
    { id: "b", label: "Model", shape: "box", col: 1, row: 0 },
  ],
  edges: [{ from: "a", to: "b" }],
};
export default {
  id: "s", title: "A caption without compact",
  elements: [
    { id: "full", type: "diagram", props: { ...props, caption: "Unused" } },
    { id: "small", type: "diagram", props: { ...props, compact: true, caption: "The process" } },
  ],
};
