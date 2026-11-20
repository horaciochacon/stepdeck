// a chart prop misspelled (serie_shown); validate suggests series_shown.
export default {
  id: "s", layout: "figure-notes", title: "Unknown prop",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/points.csv", x: "x", y: "y", series: "group", axes: { x: "X", y: "Y" }, serie_shown: ["a"] } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
};
