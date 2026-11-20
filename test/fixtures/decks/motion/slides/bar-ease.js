// A bar chart whose slide sets the theme's easing to `linear`: the bars switch from `low` to `high` over a long
// step, so a sample a quarter of the way through shows the linear progress, not a cubic in-out one.
export default {
  id: "bar-ease",
  layout: "full-bleed",
  title: "Linear bars",
  style: ":scope { --sd-easing: linear; }",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/groups.csv", x: "group", y: "low", domain: [0, 30], axes: { y: "Count" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [{ id: "low" }, { id: "high", set: { bars: { y: "high" } }, transition: { duration: 1600 } }],
};
