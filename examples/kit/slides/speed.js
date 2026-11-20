// `chart.bar` with a fixed `domain`: the bars shrink when `y` switches from the "before" column to the
// "with an agent" column. Both columns are in days (data/speed.csv, from data/make-data.mjs).
export default {
  id: "speed",
  layout: "figure-notes",
  title: "From weeks to days",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/speed.csv", x: "task", y: "before_days", domain: [0, 30], format: { y: ",.0f" },
               axes: { y: "Days, before" } } },
    { id: "before", region: "notes", type: "text", props: { text: "Before: weeks of work per task." } },
    { id: "after", region: "notes", type: "text", from: "agent", props: { text: "With an agent: a few days." } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic task durations (data/make-data.mjs)." } },
  ],
  steps: [
    { id: "before" },
    { id: "agent", set: { bars: { y: "agent_days", axes: { y: "Days, with an agent" } } } },
  ],
};
