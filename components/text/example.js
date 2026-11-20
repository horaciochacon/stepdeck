// Example slide using `text`: a body paragraph that appears at the second step, and a source line.
export default {
  id: "text-example",
  layout: "full-bleed",
  title: "Text",
  elements: [
    { id: "lead", region: "main", type: "text", props: { text: "Plain text, one paragraph per element." } },
    { id: "more", region: "main", type: "text", from: "more", props: { text: "This paragraph appears at step 'more'." } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Source: synthetic example." } },
  ],
  steps: [{ id: "start" }, { id: "more" }],
};
