// The gallery deck: every built-in layout, then every built-in component (in components/index.json order),
// each slide re-exporting the engine's own example so the gallery cannot drift from it. All content is
// synthetic. `entries` also feeds the landing page; test/unit/gallery.test.mjs checks it covers everything.
const LAYOUTS = ["figure-notes", "full-bleed", "halves", "statement", "title"];
const COMPONENTS = ["text", "chart.line", "chart.bar", "terminal", "markdown", "big-number", "list", "diagram", "chat", "timeline", "image"];

// "chart.line" -> "chart-line": the name as it appears in slide ids (slides/<id>.js) and reference pages.
const dashed = (name) => name.replaceAll(".", "-");

export const entries = [
  ...LAYOUTS.map((name) => ({ slide: `${name}-example`, kind: "layout", name, doc: `layouts/${name}/README.md` })),
  ...COMPONENTS.map((name) => ({ slide: `${dashed(name)}-example`, kind: "component", name, doc: `docs/reference/components/${dashed(name)}.md` })),
];

export default {
  title: "stepdeck gallery",
  lang: "en",
  theme: "modern",
  slides: ["cover", ...entries.map((e) => e.slide)],
};
