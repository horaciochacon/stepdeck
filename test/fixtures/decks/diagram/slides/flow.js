// Nodes, edges and two nested groups revealed by step through `shown`; the last step highlights one path.
const NODES = ["data", "model", "result", "check"];
export default {
  id: "flow",
  layout: "full-bleed",
  title: "From data to a result",
  elements: [
    { id: "flow", region: "main", type: "diagram",
      props: {
        cols: 3, rows: 2,
        nodes: [
          { id: "data", label: "Data", sub: "CSV files", shape: "box", col: 0, row: 0 },
          { id: "model", label: "Model", shape: "pill", col: 1, row: 0 },
          { id: "result", label: "Result", shape: "circle", col: 2, row: 0 },
          { id: "check", label: "Checks", shape: "text", col: 1, row: 1 },
        ],
        edges: [
          { from: "data", to: "model" },
          { from: "model", to: "result", label: "predicts" },
          { from: "check", to: "model", dashed: true },
        ],
        groups: [
          { id: "fit", contains: ["data", "model"] },
          { id: "all", label: "Pipeline", contains: ["fit", "result", "check"], dashed: true },
        ],
        shown: ["data"],
      } },
  ],
  steps: [
    { id: "start" },
    { id: "model", set: { flow: { shown: ["data", "model", "data->model", "fit"] } } },
    { id: "result", set: { flow: { shown: ["data", "model", "data->model", "fit", "result", "model->result"] } } },
    { id: "all", set: { flow: { shown: [...NODES, "data->model", "model->result", "check->model", "fit", "all"] } } },
    { id: "focus", set: { flow: { highlight: ["model", "model->result", "result"] } } },
  ],
};
