// Example slide using `list`: `advance` reveals one item per step through `shown`; the slide never
// patches the list's items. For a checklist, set `marker: "check"` and advance `done` the same way.
export default {
  id: "list-example",
  layout: "full-bleed",
  title: "Three steps",
  elements: [
    { id: "steps", region: "main", type: "list",
      props: { marker: "number", shown: 0, items: [
        { text: "Define the **question**" },
        { text: "Gather the data", sub: "Sources in `data/`" },
        { text: "Fit the model" },
      ] },
      advance: { prop: "shown", values: [0, 1, 2, 3], start: "start" } },
  ],
  steps: [{ id: "start" }, { id: "first" }, { id: "second" }, { id: "third" }],
};
