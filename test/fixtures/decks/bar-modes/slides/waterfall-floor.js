// A vertical waterfall whose decrease ends just above zero, the bottom of the axis: its label goes under the plot, in
// the room the chart keeps there, never inside the bar.
export default {
  id: "waterfall-floor",
  layout: "full-bleed",
  title: "A decrease that ends near zero",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/low.csv", x: "item", y: "near", mode: "waterfall", orient: "vertical", total: true, format: { y: ",.0f" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [{ id: "only" }],
};
