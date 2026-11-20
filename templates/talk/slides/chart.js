// A figure that builds up over four steps (spec §6.2), on the `figure-notes` layout: the chart in
// `main`, a note and a big number in `notes`, a source line in `footer`. Every figure comes from a
// data file (data/make-data.mjs); none is typed by hand.
export default {
  id: "chart",
  layout: "figure-notes",
  title: "Group B overtakes Group A after 2020",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/series.csv", x: "year", y: "value", series: "group",
               series_shown: ["Group A"],
               axes: { x: "Year", y: "Indicator per 1,000" },
               format: { x: "d", y: ",.0f" } } },
    { id: "note", region: "notes", type: "text", from: "mark",
      props: { role: "note", text: "From 2020 on, Group B rises three times faster than before." } },
    { id: "latest", region: "notes", type: "big-number", from: "latest",
      props: { value: "{{data/summary.json#/latest_b}}", format: ",.1f", label: "Group B in 2024, per 1,000" } },
    { id: "source", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic example data (data/make-data.mjs)." } },
  ],
  steps: [
    { id: "base", notes: "Start with one series." },
    { id: "compare", set: { chart: { series_shown: ["Group A", "Group B"] } } },
    { id: "mark", set: { chart: { annotate: [{ x: 2020, label: "2020" }] } } },
    { id: "latest", only: { chart: { highlight: "Group B" } }, notes: "Land on the figure." },
  ],
};
