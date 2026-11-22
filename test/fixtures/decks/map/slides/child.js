// The same time-lapse in a `map` mounted by a deck component (fixture.mapchild), which has no `ctx.stepProps`: there
// the "no data" row follows the frame each step shows, so it comes with the holed frame and goes with it (the last
// step names a region too).
export default {
  id: "child",
  layout: "full-bleed",
  title: "A map inside a component",
  elements: [
    { id: "map", type: "fixture.mapchild", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { frame: "whole", map: { boundaries: "data/regions.geojson", id: "code", name: "name", layers: { gaps: { raster: "data/gaps.json", label: "People per km²" } }, shown: ["gaps"] } } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [
    { id: "whole" },
    { id: "holed", set: { map: { frame: "holed" } } },
    { id: "again", set: { map: { frame: "whole", map: { labels: ["N1"] } } } },
  ],
};
