// Example slide using `chart.line`: two series, the second drawn in at step "both", an annotation,
// a one-step highlight and a y morph. Data: data/dose-response.csv relative to the deck root.
export default {
  id: "chart-line-example",
  layout: "full-bleed",
  title: "chart.line",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/dose-response.csv", x: "dose_mg", y: "responders", series: "regimen",
               series_shown: ["single"],
               axes: { x: "Dose (mg)", y: "Participants responding" },
               format: { y: ",.0f" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Source: synthetic example data." } },
  ],
  steps: [
    { id: "one" },
    { id: "both", set: { chart: { series_shown: ["single", "combined"] } } },
    { id: "mark", set: { chart: { annotate: [{ x: 250, label: "250 mg" }] } } },
    { id: "focus", only: { chart: { highlight: "combined" } } },
    { id: "rate", set: { chart: { y: "rate", axes: { y: "Responders per 1,000" } } } },
  ],
};
