// A figure that builds up over four steps, on the `figure-notes` layout: the chart in `main`, a note
// and a big number in `notes`, a source line in `footer`. Each step patches the state before it
// (`set` lasts, `only` holds for one step); `from` names the step an element first shows at.
// The chart reads data/series.csv and the big number is bound to data/summary.json with
// {{file#/pointer}}; data/make-data.mjs writes both. The title, the note and the annotation are
// typed here: change them when the data changes, or bind them the same way.
// `stepdeck catalog chart.line` lists the chart's props; the docs are at
// https://horaciochacon.github.io/stepdeck/site/docs/
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
