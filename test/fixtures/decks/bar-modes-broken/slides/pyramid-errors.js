// Back-to-back charts that fail on purpose, each naming its problem on the slide: a `group` column with three values,
// a category with no row for one group, a `highlight` that names both a category and a group, a vertical pyramid and
// a negative value. The source line still renders.
export default {
  id: "pyramid-errors",
  layout: "full-bleed",
  title: "Pyramids that cannot be drawn",
  elements: [
    { id: "three", region: "main", type: "chart.bar", props: { data: "data/three.csv", x: "age", y: "share", mode: "back-to-back", group: "group" } },
    { id: "missing", region: "main", type: "chart.bar", props: { data: "data/missing.csv", x: "age", y: "share", mode: "back-to-back", group: "group" } },
    { id: "both", region: "main", type: "chart.bar", props: { data: "data/both.csv", x: "lives", y: "share", mode: "back-to-back", group: "born", highlight: "North" } },
    { id: "vertical", region: "main", type: "chart.bar", props: { data: "data/missing.csv", x: "age", y: "share", mode: "back-to-back", group: "group", orient: "vertical" } },
    { id: "negative", region: "main", type: "chart.bar", props: { data: "data/negative.csv", x: "age", y: "change", mode: "back-to-back", group: "group" } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
};
