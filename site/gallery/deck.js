// The gallery deck: every built-in layout, then every built-in component (in components/index.json order),
// each slide re-exporting the engine's own example so the gallery cannot drift from it; then the motion slides,
// written for the gallery, which show the named motions, a step's choreography and the slide devices (focus-dim,
// the message line and badges, ghost placeholders); then the data-story slides, which play the chart moves
// (forecast and sweep, the draw fan, estimates, pairs, strips, waterfall, pyramid) and the map's (rasters, a flight and
// an inset, a time-lapse, points), then the second views: a process diagram with cards and a flowing loop, its compact
// copy lit on two result slides, a locator inset, and a compact map beside a chart; last the custom components, each
// built only from what the engine hands every component, with no import: gallery.slope (components/gallery.slope/),
// a slope chart, gallery.swipe (components/gallery.swipe/), a before/after swipe of a map raster, and gallery.where
// (components/gallery.where/), a bar chart that carries a compact diagram of the process, lit at the stage it names.
// All content is synthetic. `entries` also feeds the landing page; test/unit/gallery.test.mjs checks it covers everything.
const LAYOUTS = ["figure-notes", "full-bleed", "halves", "statement", "title"];
const COMPONENTS = ["text", "chart.line", "chart.bar", "chart.points", "terminal", "markdown", "big-number", "list", "diagram", "chat", "timeline", "image", "map"];
const MOTION = [
  ["motion-names", "named motions"],
  ["motion-choreography", "choreography"],
  ["motion-focus", "focus-dim"],
  ["motion-message", "message line and badge"],
  ["motion-ghost", "ghost placeholders"],
];
// Each data story names the component it shows, so its entry links that component's reference page.
const STORY = [
  ["story-forecast", "forecast and sweep", "chart.line"],
  ["story-fan", "draw fan", "chart.line"],
  ["story-estimates", "estimates and re-sort", "chart.points"],
  ["story-pairs", "before and after", "chart.points"],
  ["story-strips", "strips", "chart.points"],
  ["story-waterfall", "waterfall", "chart.bar"],
  ["story-pyramid", "back to back", "chart.bar"],
  ["map-rasters", "map rasters", "map"],
  ["map-flight-inset", "flight and inset", "map"],
  ["map-timelapse", "time-lapse", "map"],
  ["map-points", "sized points", "map"],
  ["explain-process", "cards and a flowing loop", "diagram"],
  ["explain-fit", "where we are", "diagram"],
  ["explain-predict", "where we are, later", "diagram"],
  ["map-locator", "locator inset", "map"],
  ["map-compact", "compact map", "map"],
];
// The deck's own components, each with the slide that shows it; their entries link the custom-components guide.
const CUSTOM = [["custom-slope", "gallery.slope"], ["map-swipe", "gallery.swipe"], ["custom-where", "gallery.where"]];

// "chart.line" -> "chart-line": the name as it appears in slide ids (slides/<id>.js) and reference pages.
const dashed = (name) => name.replaceAll(".", "-");

export const entries = [
  ...LAYOUTS.map((name) => ({ slide: `${name}-example`, kind: "layout", name, doc: `engine/layouts/${name}/README.md` })),
  ...COMPONENTS.map((name) => ({ slide: `${dashed(name)}-example`, kind: "component", name, doc: `docs/reference/components/${dashed(name)}.md` })),
  ...MOTION.map(([slide, name]) => ({ slide, kind: "motion", name, doc: "docs/guide/animation-and-motion.md" })),
  ...STORY.map(([slide, name, component]) => ({ slide, kind: "story", name, doc: `docs/reference/components/${dashed(component)}.md` })),
  ...CUSTOM.map(([slide, name]) => ({ slide, kind: "custom", name, doc: "docs/guide/custom-components.md" })),
];

export default {
  title: "stepdeck gallery",
  lang: "en",
  theme: "modern",
  components: CUSTOM.map(([, name]) => name),
  slides: ["cover", ...entries.map((e) => e.slide)],
};
