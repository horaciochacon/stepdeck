// Halves: the right half shows a labelled placeholder until its result arrives on the second step.
export default {
  id: "ghost",
  layout: "halves",
  title: "Before the result",
  elements: [
    { id: "method", region: "left", type: "text", props: { text: "1 · Method" } },
    { id: "result", region: "right", type: "text", props: { text: "The result arrives here" }, ghost: "2 · Result", from: "second" },
  ],
  steps: [{ id: "first" }, { id: "second" }],
};
