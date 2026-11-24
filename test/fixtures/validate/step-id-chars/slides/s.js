// Two step ids outside letters, digits, _ and -: one with a slash and dots (a path), one with a space. `ok-1` and
// `Also_ok` are fine.
export default {
  id: "s", title: "Step ids",
  elements: [{ id: "lead", type: "text", props: { text: "One." } }],
  steps: [
    { id: "ok-1" },
    { id: "x/../../escaped", set: { lead: { text: "Two." } } },
    { id: "two words", set: { lead: { text: "Three." } } },
    { id: "Also_ok", set: { lead: { text: "Four." } } },
  ],
};
