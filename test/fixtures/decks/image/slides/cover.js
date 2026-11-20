// The main use: an image in the figure region of a cover.
export default {
  id: "cover",
  layout: "title",
  title: "A synthetic study of images",
  elements: [
    { id: "subtitle", region: "subtitle", type: "text", props: { text: "A cover with an image beside the title" } },
    { id: "figure", region: "figure", type: "image", props: { src: "assets/b.svg", alt: "A green triangle", caption: "Synthetic figure" } },
  ],
};
