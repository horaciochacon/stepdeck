// A `timeline` that fills over three steps, on the `statement` layout with a short lead line. The slide
// `style` widens the gap between the lead and the track.
export default {
  id: "track",
  layout: "statement",
  title: "From first draft to final",
  style: ":scope > [data-region=\"main\"] { gap: calc(var(--sd-region-gap) * 3); }",
  elements: [
    { id: "lead", region: "main", type: "text", props: { text: "Every report takes the same path." } },
    { id: "path", region: "main", type: "timeline",
      props: { progress: 0, current: "draft", stops: [
        { id: "draft", label: "First draft", sub: "written with the agent" },
        { id: "review", label: "Review", sub: "by a person" },
        { id: "final", label: "Final" },
      ] },
      advance: { prop: "progress", values: [0, 0.5, 1], start: "draft" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic workflow." } },
  ],
  steps: [
    { id: "draft" },
    { id: "review", set: { path: { current: "review" } } },
    { id: "final", set: { path: { current: "final" } } },
  ],
};
