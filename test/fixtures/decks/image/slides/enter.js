// An image that enters on a step: its box moves it, the figure itself stays untouched.
export default {
  id: "enter",
  layout: "figure-notes",
  title: "Image enters",
  elements: [
    { id: "pic", region: "main", type: "image", props: { src: "assets/a.svg", alt: "A blue circle beside an orange panel" }, from: "go" },
  ],
  steps: [{ id: "start" }, { id: "go" }],
};
