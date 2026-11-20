// from names a step id that does not exist (thre).
export default {
  id: "s", title: "Bad step ref",
  elements: [
    { id: "lead", type: "text", props: { text: "One." } },
    { id: "late", type: "text", from: "thre", props: { text: "Three." } },
  ],
  steps: [{ id: "one" }, { id: "two", set: { lead: { text: "Two." } } }, { id: "three", set: { lead: { text: "Three." } } }],
};
