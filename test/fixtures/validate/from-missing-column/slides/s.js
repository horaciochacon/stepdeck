// The estimates are fine at the first step; the second step adds a `from` column that is not there.
export default {
  id: "s", layout: "figure-notes", title: "Missing from column",
  elements: [
    { id: "pairs", region: "main", type: "chart.points", props: { data: "data/rows.csv", x: "group", y: "before" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "one" },
    { id: "two", set: { pairs: { y: "after", from: "befor" } } },
  ],
};
