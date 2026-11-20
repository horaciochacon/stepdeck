// section is set, but the layout main-only has no title region (test/fixtures/no-title-layout); a step still
// patches the kicker (ignored there, not unknown-element).
export default {
  id: "s", layout: "main-only", section: "Methods",
  elements: [{ id: "lead", type: "text", props: { text: "Body." } }],
  steps: [{ id: "a" }, { id: "b", set: { kicker: { text: "Later" }, lead: { text: "More." } } }],
};
