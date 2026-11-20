// The cover: the `title` layout with an `image` in its `figure` region. The `section` is the kicker on the top
// margin; `*an agent*` is the title's accent phrase. No steps.
export default {
  id: "cover",
  layout: "title",
  section: "Slide kit",
  title: "Analysing data with *an agent*",
  elements: [
    { id: "subtitle", region: "subtitle", type: "text", props: { text: "A slide kit, built step by step" } },
    { id: "meta", region: "meta", type: "text", props: { text: "A. Speaker · Example Institute · 2026" } },
    { id: "figure", region: "figure", type: "image",
      props: { src: "assets/cover.svg", alt: "A chat prompt and an agent's reply above a bar chart whose bars get shorter" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "All content in this deck is synthetic." } },
  ],
};
