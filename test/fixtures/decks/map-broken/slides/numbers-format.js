// A `numbers` entry without a `format`.
export default {
  id: "numbers-format",
  layout: "full-bleed",
  title: "A map that fails",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "code",
               layers: { years: { raster: "data/years30.json" } },
               shown: ["years"], numbers: [{ key: "people", label: "People" }] } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
};
