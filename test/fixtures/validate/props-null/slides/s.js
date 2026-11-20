// set: { note: null } at step b makes the element's props null.
export default {
  id: "s", title: "Props become null",
  elements: [
    { id: "note", type: "text", props: { text: "Here." } },
  ],
  steps: [{ id: "a" }, { id: "b", set: { note: null } }],
};
