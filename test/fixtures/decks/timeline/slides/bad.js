// Fewer than two stops is an element error that names the problem; the sibling carries on.
export default {
  id: "bad",
  layout: "full-bleed",
  elements: [
    { id: "bad", region: "main", type: "timeline", props: { progress: 0, stops: [{ id: "only", label: "Alone" }] } },
    { id: "ok", region: "main", type: "text", props: { text: "This one carries on" } },
  ],
};
