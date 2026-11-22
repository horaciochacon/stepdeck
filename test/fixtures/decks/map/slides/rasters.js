// Raster layers, one shown at a time: density (a value raster on a diverging scale about 400, with a patch of land that
// has no data), cover (three classes), wells (a mask, in the accent colour, then in the alert colour), half (a raster
// over the west half of the land, so the east half has no data) and the same density image on a log scale. The last
// step shows nothing, so a layer can fade out.
export default {
  id: "rasters",
  layout: "full-bleed",
  title: "Rasters",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "code", name: "name",
               layers: {
                 density: { raster: "data/density.json", label: "People per km²", midpoint: 400 },
                 cover: { raster: "data/cover.json", label: "Land cover" },
                 wells: { raster: "data/wells.json", label: "Wells" },
                 half: { raster: "data/half.json", label: "Partial survey" },
                 log: { raster: "data/log.json", label: "People per km², log" },
               } } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [
    { id: "base" },
    { id: "density", set: { map: { shown: ["density"] } } },
    { id: "cover", set: { map: { shown: ["cover"] } } },
    { id: "wells", set: { map: { shown: ["wells"] } } },
    { id: "alert", set: { map: { layers: { wells: { color: "alert" } } } } },
    { id: "half", set: { map: { shown: ["half"] } } },
    { id: "log", set: { map: { shown: ["log"] } } },
    { id: "gone", set: { map: { shown: [] } } },
  ],
};
