// The zoom inset: the density raster, then an inset on Westmere (at the top-right, with its scale bar, its box beside it
// and two leaders), the inset flying to a pair of regions (its box then overlaps it: no leaders), three names, the inset
// moved to the bottom-right with no scale bar, the map itself flying to North (the box follows) and the inset going away.
export default {
  id: "inset",
  layout: "full-bleed",
  title: "Inset",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "code", name: "name",
               layers: { density: { raster: "data/density.json", label: "People per km²", midpoint: 400 } },
               shown: ["density"] } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [
    { id: "home" },
    { id: "inset", set: { map: { inset: { view: "W1" } } } },
    { id: "pair", set: { map: { inset: { view: ["W1", "S2"] } } } },
    { id: "named", set: { map: { labels: ["N1", "W1", "S2"] } } },
    { id: "corner", set: { map: { inset: { view: ["W1", "S2"], at: "bottom-right", scale: false } } } },
    { id: "main", set: { map: { view: "N1" } } },
    { id: "off", set: { map: { inset: null } } },
  ],
};
