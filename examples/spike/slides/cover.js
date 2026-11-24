// The cover: the title layout (title, subtitle, meta, footer). No steps.
export default {
  id: "cover",
  layout: "title",
  title: "stepdeck: slides as data",
  elements: [
    { id: "subtitle", region: "subtitle", type: "text", props: { text: "A line chart that morphs, a scripted terminal and a deck component" } },
    { id: "meta", region: "meta", type: "text", props: { text: "Second example deck · academic-light theme" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "All data in this deck are synthetic." } },
  ],
};
