// One square region on a Mercator map, whose edges are exactly vertical and horizontal: the pixel tests read it.
export default {
  id: "square",
  layout: "full-bleed",
  title: "One square",
  elements: [
    { id: "map", type: "fixture.mapkit", box: { x: 160, y: 120, w: 1400, h: 760 },
      props: { data: "data/square-cw.geojson", projection: "mercator", fills: "background", about: [-14, -27] } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [
    { id: "a" },
    { id: "hatch", set: { map: { fills: "palette", hatch: ["Q1"] } } },
    { id: "dot", set: { map: { hatch: [], dots: ["Q1"] } } },
    { id: "zoom", set: { map: { fills: "background", dots: [], zoom: 3 } } },
    { id: "points", set: { map: { zoom: 1, points: true } } },
  ],
};
