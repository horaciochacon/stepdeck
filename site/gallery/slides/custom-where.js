// A custom figure that carries a second view: gallery.where (components/gallery.where/) draws its own bars with ctx.chart
// and, in its top-right corner, mounts a compact diagram with ctx.mount, bound to the same data/process.json as the
// full process on explain-process and its compact copies. Each step names the stage the bars belong to and the copy
// lights it. Data: data/story-estimates.csv and data/process.json.
export default {
  id: "custom-where",
  layout: "figure-notes",
  title: "The estimates, stage by stage",
  elements: [
    { id: "where", region: "main", type: "gallery.where",
      props: { data: "data/story-estimates.csv", x: "region", y: "low", stage: "survey", process: "{{data/process.json#}}" } },
    { id: "note", region: "notes", type: "text",
      props: { role: "note", text: "The same process as the diagram on the process slides, drawn small by the chart itself and lit at the stage each step names." } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "survey" },
    { id: "fit", set: { where: { y: "rate", stage: "fit" } } },
    { id: "predict", set: { where: { y: "high", stage: "predict" } } },
  ],
  notes: "A custom component that mounts a compact diagram with ctx.mount, beside its own chart. Guide: docs/guide/custom-components.md",
};
