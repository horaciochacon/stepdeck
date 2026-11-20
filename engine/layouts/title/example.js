// Example slide using the title layout. The `section` is the kicker on the top margin; drop it for a cover
// without one. The `figure` element is optional: drop it for a plain cover.
export default {
  id: "title-example",
  layout: "title",
  section: "Case study",
  title: "Dose and response under two regimens",
  elements: [
    { id: "subtitle", region: "subtitle", type: "text", props: { text: "A synthetic example for the title layout" } },
    { id: "authors", region: "meta", type: "text", props: { text: "A. Author, B. Author" } },
    { id: "where", region: "meta", type: "text", props: { role: "note", text: "Example Institute · 18 November 2026" } },
    { id: "figure", region: "figure", type: "chart.line",
      props: { data: "data/dose-response.csv", x: "dose_mg", y: "responders", series: "regimen",
               axes: { x: "Dose (mg)", y: "Participants responding" }, format: { y: ",.0f" } } },
    { id: "license", region: "footer", type: "text", props: { role: "source", text: "Slides: CC BY 4.0" } },
  ],
};
