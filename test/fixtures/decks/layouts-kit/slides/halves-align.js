// `--align: center` centres the content of each half: a lone element (stretched to the half's height) and
// two stacked elements alike.
export default {
  id: "halves-align",
  layout: "halves",
  regions: { "--align": "center" },
  title: "Centred halves",
  elements: [
    { id: "steps", region: "left", type: "list",
      props: { marker: "number", items: [{ text: "Read the data" }, { text: "Fit the model" }] } },
    { id: "one", region: "right", type: "text", props: { text: "First line." } },
    { id: "two", region: "right", type: "text", props: { text: "Second line." } },
  ],
};
