// Hard case 3: a custom component (demo.story, in the deck's components/) that draws its own SVG and
// mounts the built-in `text` with ctx.mount. The slide drives it with one `stage` prop through
// `advance` (spec §6.2); the component renders props and never reads the step.
export default {
  id: "story",
  section: "Escape hatch",
  layout: "figure-notes",
  title: "From study data to a result",
  elements: [
    { id: "story", region: "main", type: "demo.story",
      props: { stage: 0 },
      advance: { prop: "stage", values: [0, 1, 2, 3], start: "start" } },
    { id: "note", region: "notes", type: "text", props: { role: "note", text: "One prop drives the strip and its caption." } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic pipeline, for illustration." } },
  ],
  steps: [{ id: "start" }, { id: "collect" }, { id: "analyze" }, { id: "share" }],
  seconds: 60,
};
