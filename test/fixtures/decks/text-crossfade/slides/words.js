// `line` is on screen from the start and changes twice; `late` enters on "change" with its text already
// changed on that step. The "slow" step sets a transition duration of 600 ms. `mark` and `tag` keep their text:
// "plain" turns off `mark`'s accent and makes the toned badge `tag` a plain body text (neither animates).
export default {
  id: "words",
  layout: "full-bleed",
  title: "Words",
  elements: [
    { id: "line", region: "main", type: "text", props: { text: "The old words" } },
    { id: "late", region: "main", type: "text", props: { text: "Late, before" }, from: "change" },
    { id: "mark", region: "main", type: "text", props: { text: "The *marked* words", accent: true } },
    { id: "tag", region: "main", type: "text", props: { role: "badge", tone: 1, text: "Tagged" } },
  ],
  steps: [
    { id: "start" },
    { id: "change", set: { line: { text: "The new words" }, late: { text: "Late, after" } } },
    { id: "slow", transition: { duration: 600 }, set: { line: { text: "The slowest words" } } },
    { id: "plain", set: { mark: { accent: false }, tag: { role: "body" } } },
  ],
};
