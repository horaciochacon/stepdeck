// Example slide using `big-number`: the count of responders bound to a data file (no figure typed by
// hand), with a label and a source line. Data: data/summary.json relative to the deck root.
export default {
  id: "big-number-example",
  layout: "full-bleed",
  title: "big-number",
  elements: [
    { id: "responders", region: "main", type: "big-number",
      props: { value: "{{data/summary.json#/responders}}", format: ",.0f", label: "participants responding at 500 mg on the combined regimen" } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Source: synthetic example data." } },
  ],
};
