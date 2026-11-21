// The pairs appear at `go` and build themselves: each filled dot slides from its old value to its new one while the
// connector grows behind it, with the hollow dot staying where it was.
export default {
  id: "pairs-entrance",
  layout: "figure-notes",
  title: "Entrada de pares",
  elements: [
    { id: "lead", region: "notes", type: "text", props: { text: "De antes a ahora." } },
    { id: "points", region: "main", type: "chart.points", from: "go",
      props: { data: "data/pairs.csv", x: "region", y: "now", from: "before", format: { y: ",.1f" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
  steps: [
    { id: "start" },
    { id: "go" },
  ],
};
