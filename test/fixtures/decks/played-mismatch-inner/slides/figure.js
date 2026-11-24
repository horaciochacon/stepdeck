// `width` changes at the second step. A jump to it draws the <svg> 600 px wide; arriving from the first step keeps
// the 300 px the component set on its first update. The element's own box is the same either way.
export default {
  id: "figure",
  layout: "full-bleed",
  title: "A figure that keeps its old size",
  elements: [
    { id: "fig", region: "main", type: "fixture.stale-svg", props: { width: 300 } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [{ id: "narrow" }, { id: "wide", set: { fig: { width: 600 } } }],
};
