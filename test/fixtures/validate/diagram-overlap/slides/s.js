// Sibling groups 'left' and 'wide' both cover the cell at col 0, row 0.
export default {
  id: "s", title: "Overlapping diagram groups",
  elements: [
    { id: "flow", type: "diagram", props: {
      cols: 2, rows: 2,
      nodes: [
        { id: "a", label: "Data", shape: "box", col: 0, row: 0 },
        { id: "b", label: "Model", shape: "box", col: 1, row: 1 },
      ],
      groups: [
        { id: "left", contains: ["a"] },
        { id: "wide", contains: ["a", "b"], dashed: true },
      ],
    } },
  ],
};
