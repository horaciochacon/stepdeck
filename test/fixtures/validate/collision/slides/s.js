// deck.js declares a component named like a built-in (text); it is unused, still an error.
export default {
  id: "s", title: "Collision",
  elements: [
    { id: "lead", type: "markdown", props: { md: "Nothing here uses the deck's text." } },
  ],
};
