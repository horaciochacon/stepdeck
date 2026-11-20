// An unknown id in `done` is an element error naming the id; the sibling carries on.
export default {
  id: "badid",
  layout: "full-bleed",
  elements: [
    { id: "bad", region: "main", type: "list", props: { marker: "check", done: ["zz"], items: [{ id: "a", text: "uno" }] } },
    { id: "ok", region: "main", type: "text", props: { text: "Este sigue" } },
  ],
};
