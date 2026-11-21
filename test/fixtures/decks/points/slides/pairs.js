// Before and after: at `before` each region has one dot; at `now` the dot slides to its new value while a connector
// grows behind it and a hollow dot stays where it was. Oeste has no `before`, so it shows only its end dot.
export default {
  id: "pairs",
  layout: "figure-notes",
  title: "Antes y ahora",
  elements: [
    { id: "points", region: "main", type: "chart.points",
      props: { data: "data/pairs.csv", x: "region", y: "before", format: { y: ",.1f" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
  steps: [
    { id: "before" },
    { id: "now", set: { points: { y: "now", from: "before" } } },
  ],
};
