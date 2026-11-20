// Catalog fixture: a deck component whose index.js throws on import. The catalog reads schema.json
// and README.md only, so the component must still be listed (spec §5).
export default {
  title: "catalog fixture",
  lang: "en",
  components: ["bad.boom"],
  slides: ["s"],
};
