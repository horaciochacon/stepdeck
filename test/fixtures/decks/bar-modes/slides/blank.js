// A blank-looking cell (a quoted space) in `score`: South has no value, so it has no label, never "0", and it ranks
// last whichever way the bars are sorted.
export default {
  id: "blank",
  layout: "full-bleed",
  title: "A blank cell",
  elements: [
    { id: "bars", region: "main", type: "chart.bar", props: { data: "data/blank.csv", x: "group", y: "score", format: { y: ",.1f" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "data" },
    { id: "low", set: { bars: { sort: "value" } } },
  ],
};
