// chart props are valid at step 0 but a patch at step 3 ('d') sets highlight to a number.
export default {
  id: "s", layout: "figure-notes", title: "Invalid at step 3",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/points.csv", x: "x", y: "y", series: "group", axes: { x: "X", y: "Y" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "a" },
    { id: "b", set: { chart: { series_shown: ["a"] } } },
    { id: "c", set: { chart: { series_shown: ["a", "b"] } } },
    { id: "d", set: { chart: { highlight: 7 } } },
  ],
};
