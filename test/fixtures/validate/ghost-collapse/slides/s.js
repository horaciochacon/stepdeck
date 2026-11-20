// a ghost placeholder on an element that also collapses: a collapsed element has no space for it.
export default {
  id: "s", title: "Ghost collapse",
  elements: [
    { id: "note", type: "text", props: { text: "Later." }, from: 1, ghost: "Next", collapse: true },
  ],
  steps: [{ id: "a" }, { id: "b" }],
};
