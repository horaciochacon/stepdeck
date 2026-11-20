// Three bars; each highlight step lasts one step (`only`). The first bar is the first highlighted.
export default {
  id: "bars",
  layout: "full-bleed",
  title: "Focus on a bar",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/values.csv", x: "group", y: "value", axes: { y: "Value" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "all" },
    { id: "a", only: { bars: { highlight: "a" } } },
    { id: "b", only: { bars: { highlight: "b" } } },
    { id: "end" },
  ],
};
