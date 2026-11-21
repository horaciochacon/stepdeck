// Vertical bars whose values change sign between steps: a label above its bar moves below it, and back.
export default {
  id: "sign-change",
  layout: "figure-notes",
  title: "Cambio de signo",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/signed.csv", x: "group", y: "before", orient: "vertical" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Datos sintéticos." } },
  ],
  steps: [
    { id: "before" },
    { id: "after", set: { bars: { y: "after" } } },
  ],
};
