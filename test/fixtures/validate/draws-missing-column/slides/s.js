// data/draws.csv calls the series column `grp` (the chart's is `group`) and the draw column `draw` (the chart says `drw`).
export default {
  id: "s", layout: "figure-notes", title: "Missing draws column",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/points.csv", x: "x", y: "y", series: "group", axes: { x: "X", y: "Y" },
               draws: { data: "data/draws.csv", id: "drw", shown: 2 } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
};
