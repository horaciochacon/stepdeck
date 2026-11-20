// big-number count-up: `up` changes the value (animated), `same` changes only a sibling (the big
// number's update is skipped by the engine).
export default {
  id: "count",
  layout: "full-bleed",
  elements: [
    { id: "num", region: "main", type: "big-number", props: { value: 1000, format: ",.0f", label: "participantes que responden" } },
    { id: "note", region: "main", type: "text", props: { text: "inicio" } },
  ],
  steps: [
    { id: "start" },
    { id: "up", set: { num: { value: 53265 } } },
    { id: "same", set: { note: { text: "sin cambios en el número" } } },
  ],
};
