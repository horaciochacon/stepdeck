// A note shown on one step fades out on the next (step c) and stays hidden after it; a summary arrives as it leaves.
export default {
  id: "exit",
  layout: "full-bleed",
  title: "Leaving",
  elements: [
    { id: "note", region: "main", type: "text", props: { text: "Here for one step" }, at: ["b"], exit: "fade" },
    { id: "summary", region: "main", type: "text", props: { text: "What remains" }, from: "c" },
  ],
  steps: [
    { id: "a" },
    { id: "b" },
    { id: "c" },
    { id: "d", set: { summary: { text: "What remains at the end" } } },
  ],
};
