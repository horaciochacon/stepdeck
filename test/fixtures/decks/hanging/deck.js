// Fixture (R6): a deck whose custom component never settles its update (I1). The talk must still
// move on: the controller's watchdog fails the element and records the error.
export default {
  title: "Hanging-component fixture",
  lang: "en",
  theme: "academic-light",
  components: ["fixture.hang"],
  slides: ["title", "hang", "next"],
};
