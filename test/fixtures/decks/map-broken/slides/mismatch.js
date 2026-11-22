// A time-lapse whose second frame is another size than the first, shown from the start.
export default {
  id: "mismatch",
  layout: "full-bleed",
  title: "A map that fails",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "code",
               layers: { sizes: { raster: "data/mismatch.json" } },
               shown: ["sizes"], frame: "2001" } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
};
