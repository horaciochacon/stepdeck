// A lettered `list` with an accent rule, one item per step through `advance` on `shown`. On `statement`
// the list sits in the middle of the canvas instead of hanging under the title.
// The third item is the deck's deliberately long list item: it wraps inside the region.
export default {
  id: "criteria",
  layout: "statement",
  title: "How we check the agent's work",
  elements: [
    { id: "list", region: "main", type: "list",
      props: { marker: "letter", rule: true, shown: 1, items: [
        { text: "The numbers match a **hand count** on a sample" },
        { text: "Every step is in a script we can rerun" },
        { text: "Each figure in the report traces back to one file in `data/`, with the code that made it and the date it was run, so that a reviewer can rebuild it alone", sub: "No figure is typed by hand" },
        { text: "A second person reviews the code" },
      ] },
      advance: { prop: "shown", values: [1, 2, 3, 4], start: "a" } },
  ],
  steps: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
};
