// A small flow with a group, a text node and a dashed edge; each highlight step lasts one step (`only`).
export default {
  id: "flow",
  layout: "full-bleed",
  title: "Focus on a path",
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
        groups: [{ id: "fit", label: "Fit", contains: ["data", "model"] }],
      } },
  ],
  steps: [
    { id: "all" },
    { id: "a", only: { flow: { highlight: ["data", "data->model", "model", "fit"] } } },
    { id: "b", only: { flow: { highlight: ["model", "model->result", "result"] } } },
    { id: "end" },
  ],
};
