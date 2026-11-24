// The other way: the collapse note shows at step `one` only, so the chart gains room at step `two`.
export default {
  id: "leave",
  layout: "full-bleed",
  title: "chart.bar, the note leaves",
  elements: [
    { id: "note", region: "main", type: "text", at: ["one"], collapse: true,
      props: { text: "A note that takes room when it appears. A note that takes room when it appears. A note that takes room when it appears. A note that takes room when it appears. A note that takes room when it appears. A note that takes room when it appears." } },
    { id: "fig", region: "main", type: "chart.bar", props: { data: "data/tasks.csv", x: "task", y: "days" } },
  ],
  steps: [{ id: "one" }, { id: "two" }],
};
