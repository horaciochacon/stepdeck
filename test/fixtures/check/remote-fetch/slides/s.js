// One element of the fixture component; see components/fixture.remote-fetch/index.js.
export default {
  id: "s",
  layout: "full-bleed",
  elements: [
    { id: "lead", region: "main", type: "text", props: { text: "A slide whose component fetches." } },
    { id: "bad", region: "main", type: "fixture.remote-fetch", props: {} },
  ],
};
