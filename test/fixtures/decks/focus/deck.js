// Fixture: `highlight` on chart.line, chart.bar and diagram, in the modern theme. Each slide has the steps
// all -> a (highlight one) -> b (highlight another) -> end (none): the first highlighted mark is the first in
// document order, so raising the focused marks is visible. `grow` adds a node and an edge on the step that also
// changes the highlight: a long concurrent reference for the colour timing. All content and data are synthetic.
export default {
  title: "Focus fixture",
  lang: "en",
  theme: "modern",
  slides: ["line", "bars", "flow", "grow"],
};
