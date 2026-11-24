// The one slide that is written. Two steps, so a per-step command loads the deck more than once.
export default {
  id: "first",
  layout: "full-bleed",
  title: "The slide that exists",
  elements: [
    { id: "lead", region: "main", type: "text", props: { text: "Written." } },
    { id: "more", region: "main", type: "text", from: "more", props: { text: "And more." } },
  ],
  steps: [{ id: "start" }, { id: "more" }],
};
