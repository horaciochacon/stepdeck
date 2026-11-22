// Map story: the three kinds of raster. A value raster first (density, with the land it has no data for hatched), then a
// raster of classes (land cover) in its place, then a mask (near a well) over the classes: each layer brings its legend
// row, and the density's row leaves with it. Data: data/map/regions.geojson, and a raster file each (density.json,
// cover.json, wells.json, each with its greyscale PNG next to it).
export default {
  id: "map-rasters",
  layout: "full-bleed",
  title: "Density, land cover and wells, one layer at a time",
  elements: [
    { id: "map", region: "main", type: "map",
      props: { boundaries: "data/map/regions.geojson", id: "code", name: "name",
               layers: {
                 density: { raster: "data/map/density.json", label: "People per km²" },
                 cover: { raster: "data/map/cover.json", label: "Land cover" },
                 wells: { raster: "data/map/wells.json", label: "Wells", color: "ink" },
               } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "regions" },
    { id: "density", set: { map: { shown: ["density"] } } },
    { id: "cover", set: { map: { shown: ["cover"] } } },
    { id: "wells", set: { map: { shown: ["cover", "wells"] } } },
  ],
  notes: "Three raster kinds: a value raster (hatch where there is no data), classes, and a mask. Reference: docs/reference/components/map.md",
};
