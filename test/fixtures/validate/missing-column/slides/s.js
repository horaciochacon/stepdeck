// the chart names a y column the CSV does not have (yy).
export default {
  id: "s", layout: "figure-notes", title: "Missing column",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/points.csv", x: "x", y: "yy", series: "group", axes: { x: "X", y: "Y" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
};
