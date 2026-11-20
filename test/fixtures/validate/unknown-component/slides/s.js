// an element type that is not a component (chart.lien); validate suggests chart.line.
export default {
  id: "s", layout: "figure-notes", title: "Unknown component",
  elements: [
    { id: "chart", region: "main", type: "chart.lien",
      props: { data: "data/points.csv", x: "x", y: "y", axes: { x: "X", y: "Y" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
};
