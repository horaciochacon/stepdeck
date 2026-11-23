// A compact map mounted by a deck component (fixture.mapchild), the size of the compact slide's (560 x 340 px): its
// frame, caption and body go in the component's own element, the ctx.mount target, not in the slide's element box.
// The regions alone, North lit.
export default {
  id: "childcompact",
  layout: "full-bleed",
  title: "A compact map inside a component",
  elements: [
    { id: "map", type: "fixture.mapchild", box: { x: 160, y: 200, w: 560, h: 340 },
      props: { map: { boundaries: "data/regions.geojson", id: "code", compact: true, caption: "North", highlight: ["N1"] } } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
};
