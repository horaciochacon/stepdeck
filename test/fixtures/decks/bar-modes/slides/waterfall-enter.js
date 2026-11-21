// A waterfall that enters on a step: the chart owns its entrance, so the whole waterfall grows out of zero, every bar
// on its running total, and stays joined while it grows. At `later` the second set of values re-tweens it.
export default {
  id: "waterfall-enter",
  layout: "full-bleed",
  title: "A waterfall that grows in",
  elements: [
    { id: "bars", region: "main", type: "chart.bar", from: "go",
      props: { data: "data/flow.csv", x: "item", y: "change", mode: "waterfall", total: true, format: { y: ",.0f" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "start" },
    { id: "go" },
    { id: "later", set: { bars: { y: "later" } } },
  ],
};
