// step b's set repeats the current text, so the folded state equals step a's (a warning, not an error).
export default {
  id: "s", title: "No-op step",
  elements: [
    { id: "lead", type: "text", props: { text: "Nothing changes at b." } },
  ],
  steps: [{ id: "a" }, { id: "b", set: { lead: { text: "Nothing changes at b." } } }],
};
