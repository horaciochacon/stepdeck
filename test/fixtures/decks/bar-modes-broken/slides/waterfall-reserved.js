// A category named like the total bar's key: with a total, the chart fails naming it instead of drawing two bars as one.
export default {
  id: "waterfall-reserved",
  layout: "full-bleed",
  title: "A category that takes the total's name",
  elements: [
    { id: "bars", region: "main", type: "chart.bar", props: { data: "data/reserved.csv", x: "item", y: "change", mode: "waterfall", total: true } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
};
