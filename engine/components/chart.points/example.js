// Example slide using `chart.points`: estimates with a 95% interval for six regions against a labelled average,
// then one region emphasized for a step (`only`, so it does not carry over). Data: data/points-estimates.csv
// relative to the deck root, with columns region, rate, low and high, and a region named "Eastport". Set `shown`
// per step to bring the regions in one by one: each grows out of the average line.
export default {
  id: "chart-points-example",
  layout: "figure-notes",
  title: "Two regions sit well above the average",
  elements: [
    { id: "points", region: "main", type: "chart.points",
      props: { data: "data/points-estimates.csv", x: "region", y: "rate", interval: { lower: "low", upper: "high" },
               reference: { value: 11.7, label: "Average" }, format: { y: ",.1f" }, axes: { y: "Cases per 1,000" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "all" },
    { id: "focus", only: { points: { highlight: "Eastport" } } },
  ],
};
