// A raster over the pixel limit: the element fails with the loader's message, the slide still opens.
export default {
  id: "broken",
  layout: "full-bleed",
  title: "A raster that cannot load",
  elements: [
    { id: "map", type: "fixture.mapkit", box: { x: 160, y: 120, w: 1400, h: 760 },
      props: { data: "data/square-cw.geojson", projection: "mercator", raster: "data/wide.json" } },
  ],
  steps: [{ id: "a" }],
};
