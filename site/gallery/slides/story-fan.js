// Data story: the draw fan. 200 draws around the trend (data/story-fan-draws.csv); `shown` rises 0, 10, 50, 200 and
// the draws already on screen stay while more join them. The y axis already has room for every draw. Data: data/story-fan-trend.csv.
export default {
  id: "story-fan",
  layout: "full-bleed",
  title: "More draws show how wide the range of futures is",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/story-fan-trend.csv", x: "year", y: "demand", series: "series",
               draws: { data: "data/story-fan-draws.csv", id: "draw", shown: 0 },
               format: { x: "d" }, axes: { x: "Year", y: "Demand index" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data: 200 simulated draws." } },
  ],
  steps: [
    { id: "trend" },
    { id: "ten", set: { chart: { draws: { shown: 10 } } } },
    { id: "fifty", set: { chart: { draws: { shown: 50 } } } },
    { id: "all", set: { chart: { draws: { shown: 200 } } } },
  ],
  notes: "The draw fan: draws.shown rises step by step, and the density of the fan reads as probability. Reference: docs/reference/components/chart-line.md",
};
