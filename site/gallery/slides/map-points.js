// Map story: points. Twelve sites, each a circle at its longitude and latitude, sized by its beds (area true to the
// value) and coloured by its kind (clinic, hospital, post), with a size key in the legend; then the four hospitals
// highlighted for a step (`only`) while every other point turns dim. Data: data/map/regions.geojson and
// data/map/sites.csv (id, lon, lat, beds, kind).
export default {
  id: "map-points",
  layout: "full-bleed",
  title: "Four hospitals hold most of the beds",
  elements: [
    { id: "map", region: "main", type: "map",
      props: { boundaries: "data/map/regions.geojson", id: "code", name: "name",
               layers: { sites: { points: "data/map/sites.csv", lon: "lon", lat: "lat", id: "id", size: "beds", color: "kind", label: "Beds" } } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "regions" },
    { id: "sites", set: { map: { shown: ["sites"] } } },
    { id: "hospitals", only: { map: { highlight: ["S02", "S05", "S08", "S11"] } } },
  ],
  notes: "Points sized by a value and coloured by a column, then a highlight by id. Reference: docs/reference/components/map.md",
};
