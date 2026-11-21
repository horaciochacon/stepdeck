// A ticker needs a sweep to count: this chart has none.
export default {
  id: "s", layout: "figure-notes", title: "Ticker without until",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/rows.csv", x: "year", y: "rate", ticker: true, axes: { x: "Year", y: "Rate" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
};
