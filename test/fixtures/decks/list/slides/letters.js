// Letter markers stay a, b, c in a Spanish deck.
export default {
  id: "letters",
  layout: "full-bleed",
  title: "Opciones",
  elements: [
    { id: "list", region: "main", type: "list",
      props: { marker: "letter", items: [{ text: "Primera opción" }, { text: "Segunda opción" }, { text: "Tercera opción" }] } },
  ],
};
