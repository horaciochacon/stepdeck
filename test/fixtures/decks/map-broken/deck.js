// Fixture: `map` slides that fail on purpose, one element error each, kept apart from the map deck so that deck stays
// clean under `check --played`. All values are synthetic.
export default {
  title: "Map errors fixture",
  lang: "en",
  theme: "academic-light",
  slides: ["region", "labels", "layer", "unknown-key", "twice", "column", "color"],
};
