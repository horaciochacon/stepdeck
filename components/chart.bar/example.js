// Example slide using `chart.bar`: one dataset, two steps. `y` switches between two columns while the explicit
// `domain` keeps the axis put, so the bars visibly shrink. Data: data/durations.csv relative to the deck root,
// with columns task, weeks_days and agent_days (all in days) and a task named "Analysis". Set `shown` per step to
// reveal categories one by one.
export default {
  id: "chart-bar-example",
  layout: "figure-notes",
  title: "From weeks to days",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/durations.csv", x: "task", y: "weeks_days", domain: [0, 30],
               format: { y: ",.0f" }, axes: { y: "Days" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "before" },
    { id: "after", set: { bars: { y: "agent_days" } } },
    { id: "focus", only: { bars: { highlight: "Analysis" } } },
  ],
};
