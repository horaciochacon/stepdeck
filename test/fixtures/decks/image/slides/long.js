// A deliberately long caption wraps inside the region instead of overflowing.
export default {
  id: "long",
  layout: "figure-notes",
  title: "Long caption",
  elements: [
    { id: "pic", region: "main", type: "image",
      props: { src: "assets/a.svg", alt: "A blue circle beside an orange panel", caption: "This caption is deliberately very long so that it has to wrap onto several lines inside the box instead of running past the edge of the region, and it should stay readable while the picture above it shrinks to make room for it" } },
  ],
};
