// A raster over the one square region (Mercator, -14 to -12 degrees of longitude), four columns of 1.5 degrees from -16
// to -10: level 0, no data, 254, 255. Steps: the raster with the land hatched under it, without the hatch, two frames
// mixed, and the picture built at one view drawn at another.
const map = { data: "data/square-cw.geojson", projection: "mercator", fills: "background", raster: "data/levels.json", about: [-14, -27] };

export default {
  id: "raster",
  layout: "full-bleed",
  title: "A raster",
  elements: [
    { id: "map", type: "fixture.mapkit", box: { x: 160, y: 120, w: 1400, h: 760 }, props: map },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [
    { id: "a" },
    { id: "bare", set: { map: { rasterHatch: false } } },
    { id: "mix", set: { map: { rasterHatch: true, raster: "data/lapse.json", rasterDraws: [{ frame: 0 }, { frame: 12, alpha: 0.5 }] } } },
    { id: "moved", set: { map: { raster: "data/levels.json", rasterDraws: [{ frame: 0, zoom: 1 }], zoom: 2 } } },
    { id: "gone", set: { map: { raster: null, zoom: 1 } } },
  ],
};
