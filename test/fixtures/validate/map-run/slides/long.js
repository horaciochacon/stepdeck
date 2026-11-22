// 29 frame moves at 700 ms: 20.3 s on its own.
export default {
  id: "long",
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
    { id: "last", set: { map: { frame: "2029" } } },
  ],
};
