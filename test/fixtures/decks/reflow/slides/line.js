// A chart.line below a collapse note that appears at step `two`.
export default {
  id: "line",
  layout: "full-bleed",
  title: "chart.line",
  elements: [
    { id: "note", region: "main", type: "text", from: "two", collapse: true,
      props: { text: "A note that takes room when it appears. A note that takes room when it appears. A note that takes room when it appears. A note that takes room when it appears. A note that takes room when it appears. A note that takes room when it appears." } },
    { id: "fig", region: "main", type: "chart.line", props: { data: "data/trend.csv", x: "year", y: "value", series: "group" } },
  ],
  steps: [{ id: "one" }, { id: "two" }],
};
