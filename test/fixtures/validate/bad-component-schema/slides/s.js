// a deck component whose schema.json does not compile (type 'strng').
export default {
  id: "s", title: "Bad component schema",
  elements: [
    { id: "lead", type: "text", props: { text: "The deck component is declared but unused." } },
  ],
};
