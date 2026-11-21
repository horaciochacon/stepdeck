// The counter's `step` changes at every step, so every navigation calls its update. A jump to a step runs
// update once; arriving from a neighbor runs it twice, and the canvas layer says so in `data-n`.
export default {
  id: "counter",
  layout: "full-bleed",
  title: "A canvas layer that depends on the path",
  elements: [
    { id: "counter", region: "main", type: "fixture.canvas-counter", props: { step: 0 } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [
    { id: "one" },
    { id: "two", set: { counter: { step: 1 } } },
    { id: "three", set: { counter: { step: 2 } } },
  ],
};
