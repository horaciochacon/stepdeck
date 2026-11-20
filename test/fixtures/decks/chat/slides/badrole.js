// An unknown role is an element error naming it; the sibling carries on.
export default {
  id: "badrole",
  layout: "full-bleed",
  elements: [
    { id: "bad", region: "main", type: "chat", props: { messages: [{ role: "robot", text: "hola" }] } },
    { id: "ok", region: "main", type: "text", props: { text: "Este sigue" } },
  ],
};
