// A waterfall of contributions. At `appear` an early category (Growth, the second) appears: it grows from the running
// total before it while every later base moves up to make room. The total bar fades in at `total`, and at `later` the
// second set of values re-tweens every bar, base and connector. At `ranked` the bars re-sort while Prices leaves, and at
// `back` they return to the data order while it comes back. The value axis covers every step from the start.
export default {
  id: "waterfall",
  layout: "full-bleed",
  title: "A waterfall that adds up what is shown",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/flow.csv", x: "item", y: "change", mode: "waterfall", shown: ["Opening", "Prices", "Costs", "Taxes", "Other"],
               format: { y: ",.0f" }, axes: { y: "Units" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "start" },
    { id: "appear", set: { bars: { shown: null } } },
    { id: "total", set: { bars: { total: true } } },
    { id: "later", set: { bars: { y: "later" } } },
    { id: "ranked", set: { bars: { sort: "-value", shown: ["Opening", "Growth", "Costs", "Taxes", "Other"] } } },
    { id: "back", set: { bars: { sort: null, shown: null } } },
  ],
};
