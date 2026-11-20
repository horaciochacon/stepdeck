// `y` names a column that is not in data/dose-response.csv; the chart must fail naming it.
export default {
  id: "missing-column",
  layout: "full-bleed",
  title: "Missing column",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/dose-response.csv", x: "dose_mg", y: "respondrs", series: "regimen",
               axes: { x: "Dose (mg)", y: "Responders" } } },
    { id: "ok", region: "main", type: "text", props: { text: "Other elements still render." } },
  ],
};
