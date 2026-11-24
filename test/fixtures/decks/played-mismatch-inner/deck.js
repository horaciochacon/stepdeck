// Fixture: a deck whose custom component sizes its <svg> once, so `check --played` must fail on the figure's inner
// size while the element's box, text and visibility stay equal.
export default {
  title: "Played-mismatch fixture: inner size",
  lang: "en",
  theme: "academic-light",
  components: ["fixture.stale-svg"],
  slides: ["figure"],
};
