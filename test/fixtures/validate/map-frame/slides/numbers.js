// The `numbers` key 'people' is in the frames of two time-lapse layers.
export default {
  id: "numbers",
  layout: "full-bleed",
  title: "A map",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "code",
               layers: { years: { raster: "data/lapse.json" }, twin: { raster: "data/twin.json" } },
               shown: ["years"], numbers: [{ key: "people", format: ",.0f" }] } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
};
