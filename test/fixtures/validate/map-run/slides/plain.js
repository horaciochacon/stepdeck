// The same 28 frame moves with no flight: 19.6 s, inside the ceiling.
export default {
  id: "plain",
  layout: "full-bleed",
  title: "A map",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "code",
               layers: { years: { raster: "data/years30.json" } },
               shown: ["years"] } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [
    { id: "first" },
    { id: "last", set: { map: { frame: "2028" } } },
  ],
};
