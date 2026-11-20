// an explicit text title written like markdown bold: ** renders as written, not as an accent.
export default {
  id: "s",
  elements: [
    { id: "title", region: "title", type: "text", props: { text: "Use **bold** here" } },
    { id: "lead", type: "text", props: { text: "Body." } },
  ],
};
