// Deck settings and the ordered list of slides (spec §6). Plain data: this file must import in Node
// (no DOM, no fetch, no top-level await). Each slide id is a file slides/<id>.js.
export default {
  title: "Your talk title",
  lang: "en",
  theme: "modern",
  // Deck components, each in components/<name>/ (`stepdeck new-component my.thing` adds one here).
  components: [],
  slides: ["title", "chart", "closing"],
};
