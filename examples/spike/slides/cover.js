// The cover: the title layout (title, subtitle, meta, footer). No steps.
export default {
  id: "cover",
  layout: "title",
  title: "stepdeck: slides as data",
  elements: [
    { id: "subtitle", region: "subtitle", type: "text", props: { text: "The spike deck: the hard cases that freeze the component contract" } },
    { id: "meta", region: "meta", type: "text", props: { text: "Milestone M0 · synthetic examples" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "All data in this deck are synthetic." } },
  ],
};
