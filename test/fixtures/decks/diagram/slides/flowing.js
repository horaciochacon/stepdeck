// Flowing edges: a straight one from the first stage to the second and a labelled loop routed over the top from the
// last stage back to the first, both with `flow`, beside a plain edge. The nodes show first; the edges come on the
// next step (the flowing ones fade in, as dashed edges do); the last step highlights the straight run and its ends, so
// the loop dims while the straight edge stays lit. A compact copy in a box over the notes column draws the same edges
// and lights the second stage on the last step.
const DEF = {
  cols: 3, rows: 1,
  nodes: [
    { id: "collect", label: "Collect", shape: "box", col: 0, row: 0 },
    { id: "fit", label: "Fit", shape: "box", col: 1, row: 0 },
    { id: "report", label: "Report", shape: "box", col: 2, row: 0 },
  ],
  edges: [
    { id: "feed", from: "collect", to: "fit", flow: true },
    { from: "fit", to: "report" },
    { id: "again", from: "report", to: "collect", route: "over", label: "next round", flow: true },
  ],
};
const NODES = ["collect", "fit", "report"];
export default {
  id: "flowing",
  layout: "figure-notes",
  title: "Edges that flow",
  elements: [
    { id: "loop", region: "main", type: "diagram", props: { ...DEF, shown: NODES } },
    { id: "where", type: "diagram", box: { x: 1264, y: 600, w: 560, h: 280 }, props: { ...DEF, compact: true } },
  ],
  steps: [
    { id: "nodes" },
    { id: "edges", set: { loop: { shown: [...NODES, "feed", "fit->report", "again"] } } },
    { id: "focus", set: { loop: { highlight: ["collect", "feed", "fit"] }, where: { highlight: ["fit"] } } },
  ],
};
