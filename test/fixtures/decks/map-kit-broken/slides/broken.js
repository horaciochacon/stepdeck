// A raster over the pixel limit: the element fails with the loader's message (`ctx.map.loadRaster`), the slide still
// opens, and `validate` reports the image.
export default {
  id: "broken",
  layout: "full-bleed",
  title: "A raster that cannot load",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 120, w: 1400, h: 760 },
      props: { boundaries: "data/square-cw.geojson", id: "code", projection: "mercator", layers: { wide: { raster: "data/wide.json" } }, shown: ["wide"] } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [{ id: "a" }],
};
