// Hard case 1: a line chart that builds up over five steps (spec §6.2). The y morph at "total"
// is chart.line's own keyed join; the highlight at "focus" is transient (`only`).
export default {
  id: "trend",
  section: "Results",
  layout: "figure-notes",
  title: "Response rises with dose",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/dose-response.csv", x: "dose_mg", y: "responders", series: "regimen",
               series_shown: ["single"],
               axes: { x: "Dose (mg)", y: "Participants responding" },
               format: { y: ",.0f" } } },
    { id: "n1", region: "notes", type: "text", from: "annotate",
      props: { text: "Above 250 mg the curve steepens." } },
    { id: "big", region: "notes", type: "big-number", from: "total",
      props: { value: "{{data/summary.json#/responders}}", format: ",.0f", label: "participants responding at 500 mg on the combined regimen" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic example data." } },
  ],
  steps: [
    { id: "base" },
    { id: "regimens", set: { chart: { series_shown: ["single", "combined"] } } },
    { id: "annotate", set: { chart: { annotate: [{ x: 250, label: "250 mg" }] } } },
    { id: "focus", only: { chart: { highlight: "combined" } }, notes: "Pause here." },
    { id: "total", set: { chart: { y: "rate", axes: { y: "Responders per 1,000" } } } },
  ],
  seconds: 90,
};
