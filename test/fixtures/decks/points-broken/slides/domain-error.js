// A given `domain` that stops short of an estimate: the chart fails naming the first estimate outside it; the
// source line still renders.
export default {
  id: "domain-error",
  layout: "figure-notes",
  title: "Dominio corto",
  elements: [
    { id: "points", region: "main", type: "chart.points",
      props: { data: "data/estimates.csv", x: "region", y: "rate", interval: { lower: "low", upper: "high" }, domain: [0, 10] } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
};
