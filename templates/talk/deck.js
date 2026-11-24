// The deck: its settings and its slides. `slides` is the order they are shown in, and every id in it
// needs a file slides/<id>.js whose `id` is the same. To add a slide, write the file and add its id
// here; to remove one, delete both. Plain data: this file must import in Node (no DOM, no fetch, no
// top-level await). `stepdeck catalog` lists the themes, layouts and components you can name;
// `stepdeck validate` checks this file and every slide. Docs: https://horaciochacon.github.io/stepdeck/site/docs/
export default {
  title: "Your talk title",
  lang: "en",
  theme: "modern",
  // Deck components, each in components/<name>/ (`stepdeck new-component my.thing` adds one here).
  components: [],
  slides: ["title", "chart", "closing"],
};
