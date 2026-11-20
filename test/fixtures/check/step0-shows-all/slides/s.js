// Two steps, and the second changes nothing: step 0 already shows everything.
export default {
  id: "s",
  layout: "full-bleed",
  elements: [
    { id: "lead", region: "main", type: "text", props: { text: "All of it, at once." } },
  ],
  steps: [{ id: "first" }, { id: "last" }],
};
