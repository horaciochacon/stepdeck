export default {
  id: "cover-figure-wide",
  layout: "title",
  regions: { "--figure-width": "900px" },
  title: "A synthetic study of layout",
  elements: [
    { id: "subtitle", region: "subtitle", type: "text", props: { text: "A cover with a wider figure" } },
    { id: "meta", region: "meta", type: "text", props: { text: "A. Author · Example Institute · 2026" } },
    { id: "figure", region: "figure", type: "text", props: { text: "Figure" } },
  ],
};
