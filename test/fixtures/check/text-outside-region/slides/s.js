// One unbreakable word wider than the figure column: it spills out of `main` (into the empty
// notes column), but stays inside the canvas and overlaps no other text.
export default {
  id: "s",
  layout: "figure-notes",
  elements: [
    { id: "wide", region: "main", type: "text", props: { text: "Overflowing".repeat(7) } },
  ],
};
