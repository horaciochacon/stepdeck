// The same re-sort on vertical bars: the bands run left to right.
export default {
  id: "resort-vertical",
  layout: "full-bleed",
  title: "Sorted vertical bars",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/values.csv", x: "group", y: "score", interval: { lower: "low", upper: "high" }, orient: "vertical", format: { y: ",.1f" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "data" },
    { id: "desc", set: { bars: { sort: "-value" } } },
    { id: "list", set: { bars: { sort: ["West", "Centre"] } } },
    { id: "later", set: { bars: { sort: "value", y: "later", interval: { lower: "low2", upper: "high2" } } } },
  ],
};
