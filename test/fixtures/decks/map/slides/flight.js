// Flights: the density raster from the first step; then the map flies to one region while two names fade in, to a pair
// of regions, to a box of longitude and latitude, and home again (`view: null`). A name whose region's centre is out of
// the view is not drawn.
export default {
  id: "flight",
  layout: "full-bleed",
  title: "Flights",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "code", name: "name",
               layers: { density: { raster: "data/density.json", label: "People per km²", midpoint: 400 } },
               shown: ["density"] } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [
    { id: "home" },
    { id: "north", set: { map: { view: "N1", labels: ["N1", "S2"] } } },
    { id: "pair", set: { map: { view: ["W1", "S2"] } } },
    { id: "box", set: { map: { view: { bounds: [-15, -28, -12, -25] } } } },
    { id: "back", set: { map: { view: null } } },
  ],
};
