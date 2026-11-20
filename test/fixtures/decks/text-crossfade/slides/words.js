// `line` is on screen from the start and changes twice; `late` enters on "change" with its text already
// changed on that step. The "slow" step sets a transition duration of 600 ms.
export default {
  id: "words",
  layout: "full-bleed",
  title: "Words",
  elements: [
    { id: "line", region: "main", type: "text", props: { text: "The old words" } },
    { id: "late", region: "main", type: "text", props: { text: "Late, before" }, from: "change" },
  ],
  steps: [
    { id: "start" },
    { id: "change", set: { line: { text: "The new words" }, late: { text: "Late, after" } } },
    { id: "slow", transition: { duration: 600 }, set: { line: { text: "The slowest words" } } },
  ],
};
