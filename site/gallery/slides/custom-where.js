// A custom figure that carries a second view: gallery.where (components/gallery.where/) draws its own bars with ctx.chart
// and, in its top-right corner, mounts a compact diagram with ctx.mount, bound to the same data/process.json as the
// full process on explain-process and its compact copies. Each step shows one stage of the analysis: the bars are that
// stage's column of data/story-stages.csv (what the survey measured, what the fit estimates, what the model predicts),
// the copy lights the stage, and the note says what the bars are. Data: data/story-stages.csv and data/process.json.
export default {
  id: "custom-where",
  layout: "figure-notes",
  title: "Uptake by region, stage by stage",
  elements: [
    { id: "where", region: "main", type: "gallery.where",
      props: { data: "data/story-stages.csv", x: "region", y: "survey", stage: "survey", process: "{{data/process.json#}}" } },
    { id: "note", region: "notes", type: "text",
      props: { role: "note", text: "The bars: uptake per 100, as each region's survey measured it." } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "survey" },
    { id: "fit", set: { where: { y: "fit", stage: "fit" }, note: { text: "The bars: uptake per 100, as the model estimates it from the survey and the records." } } },
    { id: "predict", set: { where: { y: "predict", stage: "predict" }, note: { text: "The bars: uptake per 100 the model predicts five years on." } } },
  ],
  notes: "A custom component that mounts a compact diagram with ctx.mount, beside its own chart. Guide: docs/guide/custom-components.md",
};
