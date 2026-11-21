// Before and after: at `before` each region has one dot; at `now` the dot slides to its new value while a connector
// grows behind it and a hollow dot stays where it was. Oeste has no `before`, so it shows only its end dot. At
// `shift` the earlier value changes (each hollow dot slides to it) while Este leaves; at `fold` the pair folds into
// the dot and Este comes back as a plain dot, with no hollow dot of its own.
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
    { id: "shift", set: { points: { from: "early", shown: ["Norte", "Sur", "Oeste", "Centro"] } } },
    { id: "fold", set: { points: { from: null, shown: null } } },
  ],
};
