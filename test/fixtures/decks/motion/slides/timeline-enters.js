// Two text cards and a timeline entering on one step with its fill at 0.5. The timeline owns its entrance: it is
// held for the third stagger slot, then its fill tweens from the start to the progress and the current stop
// grows, while its box stays still. A later step moves the fill and the current stop on.
export default {
  id: "timeline-enters",
  layout: "figure-notes",
  title: "Filled third",
  elements: [
    { id: "card-a", region: "notes", type: "text", props: { text: "First card" }, from: "go" },
    { id: "card-b", region: "notes", type: "text", props: { text: "Second card" }, from: "go" },
    { id: "tl", region: "main", type: "timeline", from: "go",
      props: { progress: 0, current: "draft", stops: [
        { id: "draft", label: "Draft" },
        { id: "review", label: "Review" },
        { id: "revise", label: "Revise" },
        { id: "final", label: "Final" },
      ] } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic content." } },
  ],
  steps: [
    { id: "start" },
    { id: "go", set: { tl: { progress: 0.5, current: "review" } } },
    { id: "more", set: { tl: { progress: 1, current: "final" } } },
  ],
};
