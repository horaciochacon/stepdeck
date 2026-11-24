// Large values with no `format`: the value labels keep every digit, and the tick labels of the horizontal axis are
// thinned until they fit side by side.
export default {
  id: "large",
  layout: "halves",
  title: "Valores grandes",
  elements: [
    { id: "bars", region: "left", type: "chart.bar", props: { data: "data/large.csv", x: "group", y: "value" } },
    { id: "src", region: "right", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
};
