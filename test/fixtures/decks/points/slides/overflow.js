// A fixed axis that cuts the tails of some strips: the points outside it are not drawn, and a box at that end of
// the row counts them. A wider axis leaves fewer outside; without `domain` the axis covers every point and the
// boxes go (the room for them is kept, so the plot keeps its size).
export default {
  id: "overflow",
  layout: "figure-notes",
  title: "Fuera del eje",
  elements: [
    { id: "points", region: "main", type: "chart.points",
      props: { data: "data/strips.csv", x: "region", y: "score", id: "id", domain: [12, 30], format: { y: ",.0f" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
  steps: [
    { id: "cut" },
    { id: "wide", set: { points: { domain: [10, 34] } } },
    { id: "auto", set: { points: { domain: null } } },
  ],
};
