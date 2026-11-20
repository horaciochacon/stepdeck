// Categories appear one per step; the hidden ones keep their band, and the axis spans every row.
export default {
  id: "reveal",
  layout: "figure-notes",
  title: "Una a una",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/values.csv", x: "group", y: "value", shown: [], format: { y: ",.1f" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
  steps: [
    { id: "none" },
    { id: "a", set: { bars: { shown: ["a"] } } },
    { id: "ab", set: { bars: { shown: ["a", "b"] } } },
    { id: "abc", set: { bars: { shown: ["a", "b", "c"] } } },
    { id: "focus", only: { bars: { highlight: "b" } } },
  ],
};
