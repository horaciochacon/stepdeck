// Map story: a before/after swipe, from the custom component gallery.swipe (components/gallery.swipe/), which is built
// only from the engine's map pieces. One raster file, two of its frames side by side: the divider starts at the right
// edge (the 2010 picture alone), moves to the middle (both), then to the left edge (the 2021 picture alone). A played
// step moves the divider; a jump puts it there. Data: data/map/regions.geojson and data/map/years.json.
export default {
  id: "map-swipe",
  layout: "figure-notes",
  title: "People per km², 2010 beside 2021",
  elements: [
    { id: "swipe", region: "main", type: "gallery.swipe",
      props: { boundaries: "data/map/regions.geojson", raster: "data/map/years.json", before: "2010", after: "2021", at: 1 } },
    { id: "note", region: "notes", type: "text",
      props: { role: "note", text: "The same regions in two years. The divider shows the earlier year on its left and the later one on its right." } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "before" },
    { id: "swipe", set: { swipe: { at: 0.5 } } },
    { id: "after", set: { swipe: { at: 0 } } },
  ],
  notes: "A custom component built only from ctx.map, ctx.chart and ctx.motion, with no import. Guide: docs/guide/custom-components.md",
};
