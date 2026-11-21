// Fixture: a deck whose custom component writes a canvas attribute that depends on how many updates ran,
// so `check --played` must report a mismatch in the canvas state (and only there).
export default {
  title: "Played-mismatch canvas fixture",
  lang: "en",
  theme: "academic-light",
  components: ["fixture.canvas-counter"],
  slides: ["counter"],
};
