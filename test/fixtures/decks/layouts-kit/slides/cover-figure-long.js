// A cover with a section, a ~40 character title and a figure beside it (Review Focus 5: at most 3 lines).
export default {
  id: "cover-figure-long",
  layout: "title",
  section: "Methods",
  title: "Analysing data with an agent at scale",
  elements: [
    { id: "subtitle", region: "subtitle", type: "text", props: { text: "A cover with a long title and a figure" } },
    { id: "meta", region: "meta", type: "text", props: { text: "A. Author · Example Institute · 2026" } },
    { id: "figure", region: "figure", type: "text", props: { text: "Figure" } },
    { id: "venue", region: "footer", type: "text", props: { role: "source", text: "Synthetic fixture." } },
  ],
};
