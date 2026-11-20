// A checklist whose boxes tick one by one (`done` by count) and then by id; `active` emphasises one item.
export default {
  id: "check",
  layout: "full-bleed",
  title: "Lista de control",
  elements: [
    { id: "list", region: "main", type: "list",
      props: { marker: "check", done: 0, items: [
        { id: "data", text: "Datos revisados" },
        { id: "model", text: "Modelo ajustado", sub: "con intervalo del 95 %" },
        { id: "report", text: "Informe entregado" },
      ] } },
  ],
  steps: [
    { id: "start" },
    { id: "first", set: { list: { done: 1 } } },
    { id: "second", set: { list: { done: 2, active: "report" } } },
    { id: "all", set: { list: { done: 3, active: 2 } } },
    { id: "byid", set: { list: { done: ["report"], active: "data" } } },
  ],
};
