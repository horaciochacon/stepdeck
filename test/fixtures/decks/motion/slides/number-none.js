// A big number with `enter: "none"`: it appears at its value, with no count and no motion of its box.
export default {
  id: "number-none",
  layout: "full-bleed",
  title: "No entrance",
  elements: [
    { id: "num", region: "main", type: "big-number", from: "go", enter: "none", props: { value: 4820, format: ",.0f", label: "items counted" } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [{ id: "start" }, { id: "go" }],
};
