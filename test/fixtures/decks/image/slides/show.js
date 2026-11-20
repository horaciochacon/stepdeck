// One image that changes source, gets a caption and switches fit across the steps.
export default {
  id: "show",
  layout: "figure-notes",
  title: "Image",
  elements: [
    { id: "pic", region: "main", type: "image", props: { src: "assets/a.svg", alt: "A blue circle beside an orange panel" } },
  ],
  steps: [
    { id: "a" },
    { id: "b", set: { pic: { src: "assets/b.svg", alt: "A green triangle", caption: "A synthetic triangle" } } },
    { id: "c", set: { pic: { fit: "cover", caption: "The same triangle, cropped to fill the box" } } },
    { id: "d", set: { pic: { src: "assets/a.svg", alt: "A blue circle beside an orange panel", fit: "contain", caption: null } } },
  ],
};
