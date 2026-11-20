// One estimate with its interval, then a second, then the second estimate set (y and interval switch together).
export default {
  id: "interval",
  layout: "figure-notes",
  title: "Estimaciones",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/values.csv", x: "group", y: "value", interval: { lower: "low", upper: "high" },
               shown: ["a"], format: { y: ",.1f" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
  steps: [
    { id: "one" },
    { id: "two", set: { bars: { shown: ["a", "b"] } } },
    { id: "three", set: { bars: { shown: ["a", "b", "c"] } } },
    { id: "later", set: { bars: { y: "later", interval: { lower: "low2", upper: "high2" } } } },
  ],
};
