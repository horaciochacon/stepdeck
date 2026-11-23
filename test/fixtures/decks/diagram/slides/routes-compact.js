// Compact copies of a four-stage process with a loop routed over the top, from the last card back to the second:
// a medium copy with a caption and a small one, in boxes. The first step lights nothing; the next lights the loop
// and its ends in the medium copy and the second card in the small one.
const DEF = {
  cols: 4, rows: 1,
  nodes: [
    { id: "collect", label: "Collect", shape: "card", kind: "input", col: 0, row: 0 },
    { id: "clean", label: "Clean", shape: "card", kind: "step", col: 1, row: 0 },
    { id: "fit", label: "Fit", shape: "card", kind: "step", col: 2, row: 0 },
    { id: "report", label: "Report", shape: "card", col: 3, row: 0 },
  ],
  edges: [
    { from: "collect", to: "clean" },
    { from: "clean", to: "fit" },
    { from: "fit", to: "report" },
    { id: "again", from: "report", to: "clean", route: "over" },
  ],
};
export default {
  id: "routes-compact",
  layout: "full-bleed",
  title: "A loop in a small copy",
  elements: [
    { id: "medium", type: "diagram", box: { x: 96, y: 300, w: 560, h: 200 }, props: { ...DEF, compact: true, caption: "The process" } },
    { id: "small", type: "diagram", box: { x: 96, y: 600, w: 320, h: 120 }, props: { ...DEF, compact: true } },
  ],
  steps: [
    { id: "plain" },
    { id: "lit", set: { medium: { highlight: ["report", "again", "clean"] }, small: { highlight: ["clean"] } } },
  ],
};
