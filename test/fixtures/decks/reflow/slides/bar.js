// A chart.bar below a collapse note that appears at step `two`.
export default {
  id: "bar",
  layout: "full-bleed",
  title: "chart.bar",
  elements: [
    { id: "note", region: "main", type: "text", from: "two", collapse: true,
      props: { text: "A note that takes room when it appears. A note that takes room when it appears. A note that takes room when it appears. A note that takes room when it appears. A note that takes room when it appears. A note that takes room when it appears." } },
    { id: "fig", region: "main", type: "chart.bar", props: { data: "data/tasks.csv", x: "task", y: "days" } },
  ],
  steps: [{ id: "one" }, { id: "two" }],
};
