// More distinct kinds than the theme's categorical palette has colours: an element error that says so.
export default {
  id: "toomany",
  layout: "full-bleed",
  elements: [
    { id: "over", region: "main", type: "diagram",
      props: {
        cols: 7, rows: 1,
        nodes: ["a", "b", "c", "d", "e", "f", "g"].map((id, col) => ({ id, label: id.toUpperCase(), shape: "card", kind: `kind-${id}`, col, row: 0 })),
      } },
    { id: "ok", region: "main", type: "text", props: { text: "This one carries on" } },
  ],
};
