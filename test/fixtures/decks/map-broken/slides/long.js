// A run of 29 frame moves at the default 700 ms a frame (20.3 s), longer than one update may declare: playing the
// second step is an element error. The step changes nothing but `frame`, so the run is the whole of it.
export default {
  id: "long",
  layout: "full-bleed",
  title: "A map that fails",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "code",
               layers: { years: { raster: "data/years30.json", label: "People per km²" } },
               shown: ["years"] } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [
    { id: "first" },
    { id: "last", set: { map: { frame: "2019" } } },
  ],
};
