// A vertical waterfall below zero: the total ends at the bottom of the axis, and the decreases' labels and the total's
// go under their bars, in the room the chart keeps under the plot.
export default {
  id: "waterfall-below",
  layout: "full-bleed",
  title: "A total at the bottom of the axis",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/low.csv", x: "item", y: "below", mode: "waterfall", orient: "vertical", total: true, format: { y: ",.0f" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [{ id: "only" }],
};
