// A vertical waterfall: contributions run left to right, the total bar comes last, a category appears at `appear`, and
// two leave at `less`, each shrinking into the running total while the bars after it move down.
export default {
  id: "waterfall-vertical",
  layout: "full-bleed",
  title: "A vertical waterfall",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/flow.csv", x: "item", y: "change", mode: "waterfall", orient: "vertical", total: true,
               shown: ["Opening", "Growth", "Costs", "Taxes", "Other"], format: { y: ",.0f" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "start" },
    { id: "appear", set: { bars: { shown: null } } },
    { id: "less", set: { bars: { shown: ["Opening", "Prices", "Costs", "Other"] } } },
  ],
};
