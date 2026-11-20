// One element of the fixture component; see components/fixture.render-error/index.js.
export default {
  id: "s",
  layout: "full-bleed",
  elements: [
    { id: "lead", region: "main", type: "text", props: { text: "A slide with a faulty component." } },
    { id: "bad", region: "main", type: "fixture.render-error", props: {} },
  ],
};
