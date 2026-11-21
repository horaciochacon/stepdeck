// Increases take the diverging palette's high colour and decreases its low colour; `invert` swaps them (for a chart
// where a reduction is the good news). The total bar stays in ink. `focus` dims every bar but one.
export default {
  id: "waterfall-invert",
  layout: "full-bleed",
  title: "Where a reduction is good news",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/flow.csv", x: "item", y: "change", mode: "waterfall", total: true, format: { y: ",.0f" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "plain" },
    { id: "invert", set: { bars: { invert: true } } },
    { id: "focus", only: { bars: { highlight: "Costs" } } },
    { id: "back", set: { bars: { invert: false } } },
  ],
};
