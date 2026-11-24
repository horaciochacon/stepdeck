// Example slide for __NAME__: `stage` advances one item per step. To try it, copy this file to
// slides/__ID__.js and add "__ID__" to `slides` in deck.js, then run the CLI's `check --played` on the deck.
// In `full-bleed` a deck component is only as tall as its content; to make it fill, use a region with the
// only-child rule (`main` of `figure-notes`, a `halves` half) or give the element a `box`.
export default {
  id: "__ID__",
  layout: "full-bleed",
  title: "__NAME__",
  elements: [
    { id: "list", region: "main", type: "__NAME__",
      props: { items: ["Collect", "Clean", "Model", "Share"], stage: 0 },
      advance: { prop: "stage", values: [0, 1, 2, 3] } },
  ],
  steps: [{ id: "collect" }, { id: "clean" }, { id: "model" }, { id: "share" }],
};
