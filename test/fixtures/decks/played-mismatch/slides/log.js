// The appender's `count` changes at every step, so every navigation calls its update. A jump to a
// step runs update once; arriving from a neighbor runs it twice, and the appender shows two lines.
export default {
  id: "log",
  layout: "full-bleed",
  title: "A component that is not idempotent",
  elements: [
    { id: "log", region: "main", type: "fixture.appender", props: { count: 0 } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [
    { id: "one" },
    { id: "two", set: { log: { count: 1 } } },
    { id: "three", set: { log: { count: 2 } } },
  ],
};
