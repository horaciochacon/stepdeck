// Data story: strips. Each region is a strip of 30 items with a median tick; the domain cuts a few items off the ends,
// and boxes count them. One item is followed across the strips, then the strips re-sort by their median.
// Data: data/story-strips.csv.
export default {
  id: "story-strips",
  layout: "full-bleed",
  title: "One item sits above the median in every region",
  elements: [
    { id: "points", region: "main", type: "chart.points",
      props: { data: "data/story-strips.csv", x: "region", y: "score", id: "id", summary: "median",
               domain: [32, 80], format: { y: ",.0f" }, axes: { y: "Score" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data: 30 items per region." } },
  ],
  steps: [
    { id: "strips" },
    { id: "focus", set: { points: { focus: "p07" } } },
    { id: "ranked", set: { points: { sort: "-value" } } },
  ],
  notes: "Strips: id makes each row a point, focus follows one item across them, a domain that cuts points shows the overflow boxes. Reference: docs/reference/components/chart-points.md",
};
