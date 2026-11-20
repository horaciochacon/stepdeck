// Each step reveals one checklist item that is already done, so the item rises in and its tick is drawn.
export default {
  id: "reveal-done",
  layout: "full-bleed",
  title: "Aparece y se marca",
  elements: [
    { id: "list", region: "main", type: "list",
      props: { marker: "check", shown: 1, done: 1, items: [{ text: "Uno" }, { text: "Dos" }, { text: "Tres" }] } },
  ],
  steps: [
    { id: "a" },
    { id: "b", set: { list: { shown: 2, done: 2 } } },
    { id: "c", set: { list: { shown: 3, done: 3 } } },
  ],
};
