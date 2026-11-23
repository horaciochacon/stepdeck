// A compact copy of the shared process definition (data/process.json: cards of two kinds and one without a kind,
// a labelled group, an edge label, a text node with a dashed edge to it). The first step draws the full view; the
// next turns compact on with a caption, then lights a card with a kind, then the card without one as the caption
// changes, then the text node, which a compact view does not draw.
const DEF = {
  cols: "{{data/process.json#/cols}}",
  rows: "{{data/process.json#/rows}}",
  nodes: "{{data/process.json#/nodes}}",
  edges: "{{data/process.json#/edges}}",
  groups: "{{data/process.json#/groups}}",
};
export default {
  id: "compact",
  layout: "full-bleed",
  title: "Where we are",
  elements: [{ id: "process", region: "main", type: "diagram", props: DEF }],
  steps: [
    { id: "full" },
    { id: "plain", set: { process: { compact: true, caption: "The process" } } },
    { id: "lit", set: { process: { highlight: ["clean"] } } },
    { id: "next", set: { process: { highlight: ["report"], caption: "Next: the report" } } },
    { id: "note", set: { process: { highlight: ["note"] } } },
  ],
};
