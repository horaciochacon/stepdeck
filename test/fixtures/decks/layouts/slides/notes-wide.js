export default {
  id: "notes-wide",
  layout: "figure-notes",
  regions: { "--notes-width": "700px" },
  title: "Figure with notes",
  elements: [
    { id: "figure", region: "main", type: "text", props: { text: "Figure" } },
    { id: "note", region: "notes", type: "text", props: { role: "note", text: "A note beside the figure." } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic." } },
  ],
};
