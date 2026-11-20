// An edge to an unknown node id is an element error naming the id; the sibling carries on.
export default {
  id: "badid",
  layout: "full-bleed",
  elements: [
    { id: "bad", region: "main", type: "diagram",
      props: { cols: 2, rows: 1, nodes: [{ id: "a", label: "One", shape: "box", col: 0, row: 0 }], edges: [{ from: "a", to: "ghost" }] } },
    { id: "ok", region: "main", type: "text", props: { text: "This one carries on" } },
  ],
};
