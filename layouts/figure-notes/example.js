// Example slide using the figure-notes layout: a chart with notes that build up beside it.
export default {
  id: "figure-notes-example",
  layout: "figure-notes",
  regions: { "--notes-width": "620px" },
  title: "Response rises with dose",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/dose-response.csv", x: "dose_mg", y: "responders", series: "regimen",
               axes: { x: "Dose (mg)", y: "Participants responding" }, format: { y: ",.0f" } } },
    { id: "n1", region: "notes", type: "text", props: { text: "Above 250 mg the curve steepens." } },
    { id: "n2", region: "notes", type: "text", from: "more", props: { role: "note", text: "The combined regimen shifts the whole curve up." } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic example data." } },
  ],
  steps: [{ id: "base" }, { id: "more" }],
};
