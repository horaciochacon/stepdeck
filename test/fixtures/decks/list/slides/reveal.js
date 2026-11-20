// A numbered list revealed one item per step through `shown` (items rise in, staggered).
export default {
  id: "reveal",
  layout: "full-bleed",
  title: "Pasos",
  elements: [
    { id: "list", region: "main", type: "list",
      props: { marker: "number", shown: 0, rule: true, items: [
        { text: "Definir la **pregunta**" },
        { text: "Reunir los datos", sub: "Fuentes en `data/`" },
        { text: "Ajustar el modelo" },
      ] },
      advance: { prop: "shown", values: [0, 1, 2, 3], start: "none" } },
  ],
  steps: [{ id: "none" }, { id: "one" }, { id: "two" }, { id: "three" }],
};
