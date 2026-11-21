// A waterfall needs every contribution: an empty value would be drawn as no change, so the chart fails naming the
// category instead. The source line still renders.
export default {
  id: "waterfall-empty",
  layout: "full-bleed",
  title: "A waterfall with a gap",
  elements: [
    { id: "bars", region: "main", type: "chart.bar", props: { data: "data/gaps.csv", x: "item", y: "change", mode: "waterfall", total: true } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
};
