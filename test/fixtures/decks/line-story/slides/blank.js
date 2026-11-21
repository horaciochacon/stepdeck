// A blank-looking cell (a quoted space) in `rate`: the point is missing, so the line runs from 2000 to 2020 with no dot
// at 2010, never down to zero.
export default {
  id: "blank",
  layout: "full-bleed",
  title: "A blank cell",
  elements: [
    { id: "chart", region: "main", type: "chart.line", props: { data: "data/blank.csv", x: "year", y: "rate", points: true, format: { x: "d" }, axes: { x: "Year", y: "Rate" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [{ id: "start" }],
};
