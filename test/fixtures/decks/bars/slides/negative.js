// Horizontal bars with negative values: a negative bar's label points left, into room kept between the plot and the
// category labels. `domain` ends at the lowest value, so that bar reaches the plot's left edge.
export default {
  id: "negative",
  layout: "figure-notes",
  title: "Valores negativos",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/signed.csv", x: "group", y: "after", domain: [-6, 10] } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
  steps: [
    { id: "after" },
    { id: "before", set: { bars: { y: "before", domain: [-4, 12] } } },
  ],
};
