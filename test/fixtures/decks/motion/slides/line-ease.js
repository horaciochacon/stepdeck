// A line chart whose slide sets the theme's easing to `linear`: it enters on a long step and draws its line, so
// a sample a quarter of the way through shows the linear progress, not a cubic in-out one.
export default {
  id: "line-ease",
  layout: "full-bleed",
  title: "A linear draw",
  style: ":scope { --sd-easing: linear; }",
  elements: [
    { id: "chart", region: "main", type: "chart.line", from: "go",
      props: { data: "data/trend.csv", x: "week", y: "count", axes: { x: "Week", y: "Count" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [{ id: "start" }, { id: "go", transition: { duration: 1600 } }],
};
