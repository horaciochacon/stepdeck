// A sorted waterfall: the contributions re-order (highest first, lowest first, a listed pair first) and every base
// follows the new order. The running total dips below zero when the decreases come first, so the axis covers that from
// the start.
export default {
  id: "waterfall-sort",
  layout: "full-bleed",
  title: "Sorted contributions",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/flow.csv", x: "item", y: "change", mode: "waterfall", total: "Net change", format: { y: ",.0f" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "data" },
    { id: "desc", set: { bars: { sort: "-value" } } },
    { id: "asc", set: { bars: { sort: "value" } } },
    { id: "list", set: { bars: { sort: ["Costs", "Taxes"] } } },
  ],
};
