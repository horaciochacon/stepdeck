export default {
  id: "halves-wide",
  layout: "halves",
  regions: { "--split": "2fr 1fr" },
  title: "A wide left half",
  elements: [
    { id: "before", region: "left", type: "text", props: { text: "The prompt, on the wide side." } },
    { id: "after", region: "right", type: "text", props: { text: "Tasks." } },
  ],
};
