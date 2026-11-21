// Data story: a waterfall with a total. The gains, then the cuts, then the last item, then the total bar that adds
// it all up. Hidden categories keep their band, so nothing reflows. Data: data/story-waterfall.csv.
export default {
  id: "story-waterfall",
  layout: "full-bleed",
  title: "Gains outweigh the cuts: the budget ends 13 up",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/story-waterfall.csv", x: "item", y: "change", mode: "waterfall",
               shown: ["New programmes", "Fee income"], format: { y: ",.0f" }, axes: { y: "Change in budget, index points" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "gains" },
    { id: "cuts", set: { bars: { shown: ["New programmes", "Fee income", "Staffing", "Equipment"] } } },
    { id: "other", set: { bars: { shown: null } } },
    { id: "total", set: { bars: { total: true } } },
  ],
  notes: "Waterfall: mode \"waterfall\" and total: true. The running total counts only the shown bars. Reference: docs/reference/components/chart-bar.md",
};
