export default {
  id: "cover",
  layout: "title",
  title: "A synthetic study of layout",
  elements: [
    { id: "subtitle", region: "subtitle", type: "text", props: { text: "Regions, grid variables and type" } },
    { id: "meta", region: "meta", type: "text", props: { text: "A. Author · Example Institute · 2026" } },
    { id: "venue", region: "footer", type: "text", props: { role: "source", text: "Synthetic fixture." } },
  ],
};
