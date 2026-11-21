// The same bars switch to a waterfall and back: each bar rises from zero to float on the running total before it (its
// whisker with it), the connectors and the total fade in, and the colours change to the diverging palette's.
// Switching back clears `total`, which plain bars do not use.
export default {
  id: "mode-switch",
  layout: "full-bleed",
  title: "From bars to a waterfall",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/flow.csv", x: "item", y: "change", interval: { lower: "low", upper: "high" }, format: { y: ",.0f" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "bars" },
    { id: "waterfall", set: { bars: { mode: "waterfall", total: true } } },
    { id: "again", set: { bars: { mode: "bars", total: null } } },
  ],
};
