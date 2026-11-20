// a patch at step b names an element id that does not exist (nte).
export default {
  id: "s", title: "Unknown element",
  elements: [
    { id: "note", type: "text", props: { text: "Here." } },
  ],
  steps: [{ id: "a" }, { id: "b", set: { nte: { text: "There." } } }],
};
