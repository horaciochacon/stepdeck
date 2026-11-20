export default {
  id: "halves-default",
  layout: "halves",
  title: "Before and after",
  elements: [
    { id: "before", region: "left", type: "text", props: { text: "Before: results arrived late." } },
    { id: "after", region: "right", type: "text", props: { text: "After: results arrive early." } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic fixture." } },
  ],
};
