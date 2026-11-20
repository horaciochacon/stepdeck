// The element type is misspelled: the registry suggests 'text'.
export default {
  id: "bad-type",
  layout: "full-bleed",
  elements: [
    { id: "ok", region: "main", type: "text", props: { text: "This one works." } },
    { id: "typo", region: "main", type: "tetx", props: { text: "Never rendered." } },
  ],
};
