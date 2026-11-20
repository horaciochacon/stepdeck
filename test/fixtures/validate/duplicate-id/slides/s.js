// two elements share the id note.
export default {
  id: "s", title: "Duplicate id",
  elements: [
    { id: "note", type: "text", props: { text: "First." } },
    { id: "note", type: "text", props: { text: "Second." } },
  ],
};
