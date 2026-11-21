// The bars re-sort: data order at `data`, then the highest first, then a listed pair first, then the second set of
// values (`y` and the whisker change together) still highest first. Each bar, with its label and whisker, slides.
export default {
  id: "resort",
  layout: "full-bleed",
  title: "Sorted bars",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/values.csv", x: "group", y: "score", interval: { lower: "low", upper: "high" }, format: { y: ",.1f" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "data" },
    { id: "desc", set: { bars: { sort: "-value" } } },
    { id: "list", set: { bars: { sort: ["West", "Centre"] } } },
    { id: "later", set: { bars: { sort: "-value", y: "later", interval: { lower: "low2", upper: "high2" } } } },
  ],
};
