// A path that leaves the deck root is an element error, like a data path.
export default {
  id: "outside",
  layout: "full-bleed",
  title: "Outside",
  elements: [
    { id: "pic", region: "main", type: "image", props: { src: "../outside.svg", alt: "Outside the deck" } },
    { id: "ok", region: "main", type: "text", props: { text: "The sibling carries on." } },
  ],
};
