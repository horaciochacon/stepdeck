// Example slide using `timeline`: `advance` moves the fill through `progress`; `current` is set per step
// with `set`. Stops are evenly spaced; the fill stops exactly on a stop.
export default {
  id: "timeline-example",
  layout: "full-bleed",
  title: "From first draft to final",
  elements: [
    { id: "path", region: "main", type: "timeline",
      props: { progress: 0, current: "draft", stops: [
        { id: "draft", label: "First draft" },
        { id: "review", label: "Review", sub: "two weeks" },
        { id: "final", label: "Final" },
      ] },
      advance: { prop: "progress", values: [0, 0.5, 1], start: "start" } },
  ],
  steps: [
    { id: "start" },
    { id: "reviewing", set: { path: { current: "review" } } },
    { id: "done", set: { path: { current: "final" } } },
  ],
};
