// `chart.bar` with an interval whisker: one estimate first, then the second group joins.
export default {
  id: "estimate",
  layout: "figure-notes",
  title: "More exposure, more cases",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/estimate.csv", x: "group", y: "per100", interval: { lower: "low", upper: "high" },
               shown: ["Less exposed"], format: { y: ",.1f" }, axes: { y: "Cases per 100" } } },
    { id: "n1", region: "notes", type: "text", props: { text: "Each bar is an estimate with its 95% interval." } },
    { id: "n2", region: "notes", type: "text", from: "both", props: { text: "The intervals do not overlap." } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic cohort (data/make-data.mjs)." } },
  ],
  steps: [
    { id: "one" },
    { id: "both", set: { bars: { shown: ["Less exposed", "More exposed"] } } },
  ],
};
