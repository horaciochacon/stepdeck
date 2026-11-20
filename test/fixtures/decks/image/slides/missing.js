// The file does not exist: an element error naming the path (validate also reports file-missing).
export default {
  id: "missing",
  layout: "full-bleed",
  title: "Missing",
  elements: [
    { id: "pic", region: "main", type: "image", props: { src: "assets/nope.svg", alt: "Not there" } },
    { id: "ok", region: "main", type: "text", props: { text: "The sibling carries on." } },
  ],
};
