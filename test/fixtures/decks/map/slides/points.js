// Points over the land: seven sites sized by beds and coloured by kind (a column), highlighted for one step, then
// recoloured with a theme role; then the same sites with no size, in the accent colour, and in the alert colour.
export default {
  id: "points",
  layout: "full-bleed",
  title: "Sites",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "code", name: "name",
               layers: {
                 sites: { points: "data/sites.csv", lon: "lon", lat: "lat", id: "id", size: "beds", color: "kind", label: "Beds" },
                 plain: { points: "data/sites.csv", lon: "lon", lat: "lat", id: "id", label: "Sites" },
               } } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [
    { id: "base" },
    { id: "sites", set: { map: { shown: ["sites"] } } },
    { id: "focus", only: { map: { highlight: ["S4"] } } },
    { id: "role", set: { map: { layers: { sites: { color: "alert" } } } } },
    { id: "plain", set: { map: { shown: ["plain"] } } },
    { id: "alert", set: { map: { layers: { plain: { color: "alert" } } } } },
  ],
};
