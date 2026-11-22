// A `numbers` key that two time-lapse layers both have, so the panel cannot tell which one it comes from.
export default {
  id: "numbers",
  layout: "full-bleed",
  title: "A map that fails",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "code",
               layers: { north: { raster: "data/years30.json" }, south: { raster: "data/years30.json" } },
               shown: ["north"], numbers: [{ key: "people", label: "People", format: ",.0f" }] } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
};
