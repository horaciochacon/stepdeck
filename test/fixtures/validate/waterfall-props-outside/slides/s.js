// `invert` swaps a waterfall's colours and `total` adds its total bar: plain bars have neither.
export default {
  id: "s", layout: "figure-notes", title: "Waterfall props on plain bars",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/flow.csv", x: "item", y: "change", invert: true, total: "Net change" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
};
