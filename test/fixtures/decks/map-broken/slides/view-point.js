// `view` names a point of a layer: a view names regions only.
export default {
  id: "view-point",
  layout: "full-bleed",
  title: "A map that fails",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "code", view: "S4",
               layers: { sites: { points: "data/sites-ok.csv", lon: "lon", lat: "lat", id: "id" } } } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
};
