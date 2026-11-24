// Fixture: a deck component whose child sets inline `visibility: visible`. While its element is hidden the child
// must stay hidden too (core/stepdeck.css forces a hidden element's descendants hidden); the ghost label still shows.
export default {
  title: "Hidden-children fixture",
  lang: "en",
  theme: "academic-light",
  components: ["fixture.shouter"],
  slides: ["late"],
};
