// Example slide using `image`: a cover with an image in the figure region, then a caption added on the
// second step. `src` is a path inside the deck (here assets/cover.svg); `alt` is required.
export default {
  id: "image-example",
  layout: "title",
  title: "A study with a figure",
  elements: [
    { id: "subtitle", region: "subtitle", type: "text", props: { text: "An image beside the title" } },
    { id: "figure", region: "figure", type: "image",
      props: { src: "assets/cover.svg", alt: "An abstract diagram of three connected circles", fit: "contain" } },
  ],
  steps: [
    { id: "start" },
    { id: "captioned", set: { figure: { caption: "A synthetic figure made for this deck" } } },
  ],
};
