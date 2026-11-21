// A series that starts at the top of the plot, so its label sits where the ticker is: the label moves down, clear of it.
const data = { data: "data/peak.csv", x: "year", y: "rate", series: "series", format: { x: "d" }, axes: { x: "Year", y: "Rate" } };
export default {
  id: "clash",
  layout: "full-bleed",
  title: "Ticker and labels",
  elements: [
    { id: "chart", region: "main", type: "chart.line", props: { ...data, until: 2000, ticker: true } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "start" },
    { id: "next", set: { chart: { until: 2004 } } },
    { id: "more", set: { chart: { until: 2012 } } },
  ],
};
