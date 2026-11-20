// an advance with more values than the slide has steps from its start.
export default {
  id: "s", layout: "figure-notes", title: "Advance overflow",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/points.csv", x: "x", y: "y", series: "group", axes: { x: "X", y: "Y" }, series_shown: ["a", "b"] },
      advance: { prop: "series_shown", values: [["a"], ["a", "b"], ["b"], ["a"]], start: "two" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [{ id: "one" }, { id: "two" }, { id: "three" }],
};
