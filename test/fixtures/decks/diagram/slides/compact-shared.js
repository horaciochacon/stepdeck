// Two views of one definition: the full diagram in the main region and its compact copy in a box over the empty
// notes column, both bound to data/process.json, so every id and every kind colour agree. The copy enters on the
// second step (it builds itself) and lights the current stage.
const DEF = {
  cols: "{{data/process.json#/cols}}",
  rows: "{{data/process.json#/rows}}",
  nodes: "{{data/process.json#/nodes}}",
  edges: "{{data/process.json#/edges}}",
  groups: "{{data/process.json#/groups}}",
};
export default {
  id: "compact-shared",
  layout: "figure-notes",
  title: "One definition, two views",
  elements: [
    { id: "big", region: "main", type: "diagram", props: DEF },
    { id: "small", type: "diagram", box: { x: 1264, y: 600, w: 560, h: 280 }, from: "fit",
      props: { ...DEF, compact: true, caption: "You are here", highlight: ["fit"] } },
  ],
  steps: [
    { id: "start" },
    { id: "fit" },
    { id: "report", set: { small: { highlight: ["report"], caption: "Next" } } },
  ],
};
