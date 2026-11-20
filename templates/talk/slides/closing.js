// The closing slide, on the `title` layout. No steps.
export default {
  id: "closing",
  layout: "title",
  title: "Thank you",
  elements: [
    { id: "subtitle", region: "subtitle", type: "text", props: { text: "Questions and comments welcome" } },
    { id: "meta", region: "meta", type: "text", props: { text: "your.name@example.org" } },
  ],
};
