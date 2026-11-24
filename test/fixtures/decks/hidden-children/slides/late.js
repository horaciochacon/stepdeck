// The component is hidden at step `before` (with a ghost) and visible from `shown` on.
export default {
  id: "late",
  layout: "full-bleed",
  title: "A child that asks to be visible",
  elements: [
    { id: "loud", type: "fixture.shouter", from: "shown", ghost: "Coming next", props: { text: "Here I am" } },
  ],
  steps: [{ id: "before" }, { id: "shown" }],
};
