// One map of nine regions, six steps: the fills change, a region is hatched, another becomes a dot, the view zooms, and
// points, an inset and a scale bar join.
export default {
  id: "kit",
  layout: "full-bleed",
  title: "Map painters",
  elements: [
    { id: "map", type: "fixture.mapkit", box: { x: 160, y: 120, w: 1400, h: 760 },
      props: { data: "data/regions.geojson", projection: "equal-earth" } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [
    { id: "a" },
    { id: "b", set: { map: { fills: "shifted" } } },
    { id: "c", set: { map: { hatch: ["N1"] } } },
    { id: "d", set: { map: { hatch: [], dots: ["I1"] } } },
    { id: "e", set: { map: { dots: [], zoom: 2 } } },
    { id: "f", set: { map: { zoom: 1, points: true, inset: true, scale: true } } },
  ],
};
