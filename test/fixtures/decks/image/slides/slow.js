// The second source is served slowly by the test: settled() must wait for it.
export default {
  id: "slow",
  layout: "full-bleed",
  title: "Slow",
  elements: [
    { id: "pic", region: "main", type: "image", props: { src: "assets/a.svg", alt: "A blue circle beside an orange panel" } },
  ],
  steps: [
    { id: "first" },
    { id: "second", set: { pic: { src: "assets/b.svg", alt: "A green triangle" } } },
  ],
};
