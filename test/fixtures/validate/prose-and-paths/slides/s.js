// Running text (a string with spaces) is not a path, a colour or a resource to load: `prose` must give no error,
// only the remote-url warning for the URL it cites. The four images name files that are missing, each written in
// a way the file test must see through (./, a space, a query, a fragment); `there` and `spaced` exist.
export default {
  id: "s", title: "Prose and paths",
  elements: [
    { id: "prose", type: "list", props: { marker: "number", items: [
      { text: "Fixed in issue #123", sub: "see PR #4521" },
      { text: "Source: WHO 2024, https://www.who.int/data" },
      { text: "Divide with a //b comment" },
      { text: "The answer is in results.csv" },
    ] } },
    { id: "dot", type: "image", props: { src: "./assets/nope.png", alt: "Missing, with a leading dot-slash" } },
    { id: "space", type: "image", props: { src: "assets/my photo.png", alt: "Missing, with a space" } },
    { id: "query", type: "image", props: { src: "assets/nope.PNG?v=2", alt: "Missing, with a query" } },
    { id: "hash", type: "image", props: { src: "assets/nope.svg#mark", alt: "Missing, with a fragment" } },
    { id: "there", type: "image", props: { src: "./assets/dot.svg?v=2", alt: "A dot" } },
    { id: "spaced", type: "image", props: { src: "assets/two words.svg", alt: "A dot" } },
  ],
};
