// Light grey text on the white canvas: about 1.9:1, under 4.5:1.
export default {
  id: "s",
  layout: "full-bleed",
  style: "[data-el=\"pale\"] .sd-text { color: rgb(187, 187, 187); }",
  elements: [
    { id: "ok", region: "main", type: "text", props: { text: "Dark ink reads well." } },
    { id: "pale", region: "main", type: "text", props: { text: "Pale text is hard to read." } },
  ],
};
