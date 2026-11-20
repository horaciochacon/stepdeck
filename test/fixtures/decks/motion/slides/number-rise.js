// A big number with `enter: "rise"`: its box rises in and the figure shows its value from the first frame.
export default {
  id: "number-rise",
  layout: "full-bleed",
  title: "A rising number",
  elements: [
    { id: "num", region: "main", type: "big-number", from: "go", enter: "rise", props: { value: 4820, format: ",.0f", label: "items counted" } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [{ id: "start" }, { id: "go" }],
};
