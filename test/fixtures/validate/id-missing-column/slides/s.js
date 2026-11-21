// The strips are fine at the first step; the second step names an `id` column that is not there.
export default {
  id: "s", layout: "figure-notes", title: "Missing id column",
  elements: [
    { id: "strips", region: "main", type: "chart.points", props: { data: "data/rows.csv", x: "group", y: "value", id: "item" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "one" },
    { id: "two", set: { strips: { id: "items" } } },
  ],
};
