// The "no data" row of a time-lapse follows the frames the slide's steps show. The time-lapse's second frame lacks data
// on a block of land, but no step shows it, so the legend has no "no data" row.
const layers = { gaps: { raster: "data/gaps.json", label: "People per km²" } };

export default {
  id: "gaps",
  layout: "full-bleed",
  title: "Only the whole frame",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "code", name: "name", layers, shown: ["gaps"], frame: "whole" } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [{ id: "whole" }, { id: "named", set: { map: { labels: ["N1"] } } }],
};
