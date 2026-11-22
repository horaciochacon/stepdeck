// The regions are identified by name, but the rates are keyed by code: no key matches a region.
export default {
  id: "unknown-key",
  layout: "full-bleed",
  title: "A map that fails",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "name",
               layers: { rate: { areas: "data/rates.csv", key: "code", value: "rate" } } } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
};
