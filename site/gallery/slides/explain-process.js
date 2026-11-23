// Process story: cards and a flowing loop. The inputs come first (two kinds of card), then the model they feed (a
// group), the outputs, the arrows, and last the loop that runs back over the top: "next round", drawn dashed with its
// dashes marching while the page animates. Every structural prop is bound to data/process.json, so the compact copies
// on the next two slides (explain-fit, explain-predict) are the same diagram.
const process = {
  cols: "{{data/process.json#/cols}}",
  rows: "{{data/process.json#/rows}}",
  nodes: "{{data/process.json#/nodes}}",
  edges: "{{data/process.json#/edges}}",
  groups: "{{data/process.json#/groups}}",
};
const inputs = ["survey", "records"];
const model = [...inputs, "fit", "predict", "model"];
const outputs = [...model, "tables", "briefs"];
const arrows = [...outputs, "survey-fit", "records-fit", "fit-predict", "predict-tables", "predict-briefs"];
export default {
  id: "explain-process",
  layout: "full-bleed",
  title: "How one round of the analysis runs",
  elements: [
    { id: "flow", region: "main", type: "diagram", props: { ...process, shown: inputs } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic process." } },
  ],
  steps: [
    { id: "inputs" },
    { id: "model", set: { flow: { shown: model } } },
    { id: "outputs", set: { flow: { shown: outputs } } },
    { id: "arrows", set: { flow: { shown: arrows } } },
    { id: "loop", set: { flow: { shown: [...arrows, "again"] } } },
  ],
  notes: "Diagram cards, kinds and a flowing routed edge, all from data/process.json. Reference: docs/reference/components/diagram.md",
};
