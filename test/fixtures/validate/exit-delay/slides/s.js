// The note leaves on step b with a delay, which the engine ignores: every exit starts at once.
export default {
  id: "s", title: "Exit delay",
  elements: [
    { id: "note", type: "text", props: { text: "Soon gone." }, at: ["a"], exit: { motion: "fade", delay: 300 } },
    { id: "keep", type: "text", props: { text: "Stays." } },
  ],
  steps: [{ id: "a" }, { id: "b" }],
};
