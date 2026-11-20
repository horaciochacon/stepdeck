export default {
  id: "cover-figure",
  layout: "title",
  title: "A synthetic study of layout",
  elements: [
    { id: "subtitle", region: "subtitle", type: "text", props: { text: "A cover with a figure beside the title" } },
    { id: "meta", region: "meta", type: "text", props: { text: "A. Author · Example Institute · 2026" } },
    { id: "figure", region: "figure", type: "text", props: { text: "Figure" } },
    { id: "venue", region: "footer", type: "text", props: { role: "source", text: "Synthetic fixture." } },
  ],
};
