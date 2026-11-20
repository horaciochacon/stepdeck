// A four-stop timeline whose fill advances through `progress`; `current` moves along with it.
export default {
  id: "fill",
  layout: "full-bleed",
  title: "Fill",
  elements: [
    { id: "tl", region: "main", type: "timeline",
      props: { progress: 0, current: "draft", stops: [
        { id: "draft", label: "First draft", sub: "week 1" },
        { id: "review", label: "Review" },
        { id: "revise", label: "Revision", sub: "week 3" },
        { id: "final", label: "Final" },
      ] } },
  ],
  steps: [
    { id: "start" },
    { id: "half", set: { tl: { progress: 0.5, current: "review" } } },
    { id: "most", set: { tl: { progress: 0.8, current: "revise" } } },
    { id: "full", set: { tl: { progress: 1, current: "final" } } },
  ],
};
