// A re-sort on the step where a bar appears. Hidden bars keep their place in the sorted order: West is ranked
// last by value and is hidden until `all`. At `less` two bars leave without a new order.
export default {
  id: "resort-shown",
  layout: "full-bleed",
  title: "Sorting while bars appear",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/values.csv", x: "group", y: "score", shown: ["North", "South"], format: { y: ",.1f" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "start" },
    { id: "both", set: { bars: { shown: ["North", "South", "East"], sort: "-value" } } },
    { id: "all", set: { bars: { shown: null } } },
    { id: "flip", set: { bars: { sort: "value" } } },
    { id: "less", set: { bars: { shown: ["South", "East"] } } },
  ],
};
