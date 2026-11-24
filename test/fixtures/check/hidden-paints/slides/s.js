// `late` enters at the second step, so the first step hides it. Its component forces its line visible (an inline
// `visibility: visible !important`), which shows through the hidden element: the audience reads the line one step
// early. `styled` is hidden too, and the slide's style sets a plain `visibility: visible` on its text: the engine
// keeps the descendants of a hidden element hidden against that, so it must not be reported. Nor must `ghosted`,
// whose ghost placeholder is meant to show.
export default {
  id: "s",
  layout: "full-bleed",
  style: '.sd-el[data-el="styled"] .sd-text { visibility: visible; }',
  elements: [
    { id: "lead", region: "main", type: "text", props: { text: "The first line." } },
    { id: "late", region: "main", type: "fixture.leak", from: "last", props: { text: "The line that should wait." } },
    { id: "styled", region: "main", type: "text", from: "last", props: { text: "A line the engine keeps hidden." } },
    { id: "ghosted", region: "main", type: "text", from: "last", ghost: "Still to come", props: { text: "A line behind a ghost." } },
  ],
  steps: [{ id: "first" }, { id: "last" }],
};
