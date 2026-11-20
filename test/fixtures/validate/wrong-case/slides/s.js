// the data path differs in case from the file on disk (data/Points.csv vs data/points.csv).
export default {
  id: "s", layout: "figure-notes", title: "Wrong case",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/Points.csv", x: "x", y: "y", series: "group", axes: { x: "X", y: "Y" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
};
