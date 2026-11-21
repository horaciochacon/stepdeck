// `highlight` names a group (the other side turns the theme's dim colour, its title the muted one) or a category
// (every other band dims, on both sides). Each lasts one step (`only`), so on `sort` the colours come back while the
// bands re-sort by the sum of the two sides.
export default {
  id: "pyramid-highlight",
  layout: "full-bleed",
  title: "One side, then one band",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/pyramid.csv", x: "age", y: "share", mode: "back-to-back", group: "group",
               interval: { lower: "low", upper: "high" }, format: { y: ",.1f" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "plain" },
    { id: "group", only: { bars: { highlight: "Men" } } },
    { id: "category", only: { bars: { highlight: "45-59" } } },
    { id: "sort", set: { bars: { sort: "-value" } } },
  ],
};
