// Two steps: a paragraph that appears at "two" keeping its space, and one that collapses until then.
export default {
  id: "hello",
  layout: "full-bleed",
  title: "Hello, stepdeck",
  elements: [
    { id: "lead", region: "main", type: "text", props: { text: "Slides are data: a layout, elements and steps." } },
    { id: "reveal", region: "main", type: "text", from: "two", props: { text: "This paragraph appears at step two; its space was reserved." } },
    { id: "aside", region: "main", type: "text", from: "two", collapse: true, props: { role: "note", text: "This note takes no space until it appears." } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Source: synthetic example." } },
  ],
  steps: [{ id: "one" }, { id: "two" }],
};
