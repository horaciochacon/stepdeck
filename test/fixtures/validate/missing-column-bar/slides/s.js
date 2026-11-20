// The bars are fine at the first step; the second step switches the interval to a column that is not there.
export default {
  id: "s", layout: "figure-notes", title: "Missing column",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/rows.csv", x: "group", y: "value", interval: { lower: "lo", upper: "hi" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "one" },
    { id: "two", set: { bars: { interval: { lower: "lo", upper: "hi_" } } } },
  ],
};
