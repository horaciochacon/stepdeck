// a step id made of digits, ambiguous with a step number.
export default {
  id: "s", title: "Numeric step id",
  elements: [
    { id: "lead", type: "text", props: { text: "One." } },
    { id: "more", type: "text", from: "two", props: { text: "Two." } },
  ],
  steps: [{ id: "1" }, { id: "two" }],
};
