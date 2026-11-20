// a chart on a slide with no element whose props have role: source.
export default {
  id: "s", layout: "figure-notes", title: "No source",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/points.csv", x: "x", y: "y", series: "group", axes: { x: "X", y: "Y" } } },
  ],
};
