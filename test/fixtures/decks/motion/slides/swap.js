// Two collapsing elements trade places on one step: the first snaps out, and the second fades into the space it
// freed. (A fade, not the theme's rise, so the second element's on-screen position is its layout position.)
export default {
  id: "swap",
  layout: "full-bleed",
  title: "One in place of another",
  elements: [
    { id: "before", region: "main", type: "text", props: { text: "Before the change" }, collapse: true, at: ["a"] },
    { id: "after", region: "main", type: "text", props: { text: "After the change" }, collapse: true, at: ["b"], enter: "fade" },
  ],
  steps: [{ id: "a" }, { id: "b" }],
};
