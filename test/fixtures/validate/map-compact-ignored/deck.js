// Fixture: a compact map given the props it does not draw (`labels`, a `legend` other than false, `numbers`, `inset`),
// which `validate` warns about once each; a full-size map with the same props and a compact one with `legend: false`
// are clean. The data files are those of map-prop-unused (its make.mjs writes them). The browser tests render it too.
export default {
  title: "validate fixture: map-compact-ignored",
  lang: "en",
  theme: "academic-light",
  slides: ["s"],
};
