// Two steps on one dataset: `y` switches between two columns while the explicit `domain` keeps the axis put.
export default {
  id: "shrink",
  layout: "figure-notes",
  title: "De semanas a días",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/tasks.csv", x: "task", y: "weeks_days", domain: [0, 30], format: { y: ",.0f" },
               axes: { y: "Días" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
  steps: [
    { id: "before" },
    { id: "after", set: { bars: { y: "agent_days" } } },
  ],
};
