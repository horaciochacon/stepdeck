// Three steps without ids: the text names the step.
export default {
  id: "plain",
  title: "Plain",
  elements: [{ id: "t", region: "main", type: "text", props: { text: "zero" }, advance: { prop: "text", values: ["zero", "one", "two"] } }],
  steps: [{}, {}, {}],
};
