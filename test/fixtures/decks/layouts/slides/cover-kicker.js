// A cover with a section (the kicker), a title, a subtitle, two meta lines and a footer line, no figure.
export default {
  id: "cover-kicker",
  layout: "title",
  section: "Methods",
  title: "A synthetic study",
  elements: [
    { id: "subtitle", region: "subtitle", type: "text", props: { text: "Regions, grid variables and type" } },
    { id: "meta", region: "meta", type: "text", props: { text: "A. Author · Example Institute · 2026" } },
    { id: "meta2", region: "meta", type: "text", props: { role: "note", text: "Synthetic fixture" } },
    { id: "venue", region: "footer", type: "text", props: { role: "source", text: "Synthetic fixture." } },
  ],
};
