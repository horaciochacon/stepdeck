// `sort` ranks the bands by the sum of the two sides (`-value`), or by another column summed the same way; both bars
// of a band slide together with its label. `groups` puts Men on the left. A band hidden on the `by` step keeps its
// place in the order and comes back in it.
export default {
  id: "pyramid-sort",
  layout: "full-bleed",
  title: "Bands ranked by their total",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/pyramid.csv", x: "age", y: "share", mode: "back-to-back", group: "group", groups: ["Men", "Women"],
               format: { y: ",.1f" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "data" },
    { id: "total", set: { bars: { sort: "-value" } } },
    { id: "by", set: { bars: { sort: { by: "later", order: "desc" }, shown: ["0-14", "15-29", "30-44", "45-59", "60-74"] } } },
    { id: "list", set: { bars: { sort: ["75+", "60-74"], shown: null } } },
  ],
};
