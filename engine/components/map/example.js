// Example slide using `map`: the regions of a fictional country, then their rates in four classes (Cragmoor has no
// rate, so it is hatched and the legend adds a "no data" row), then the highest rate (Ironridge) and the lowest on the
// mainland (Eastport; only an island is lower) named and highlighted for one step (`only`, so it does not carry
// over). Data, relative to the deck root: data/map/regions.geojson, whose property `code` identifies each region and
// `name` names it, and data/map/rates.csv, with columns code and rate.
export default {
  id: "map-example",
  layout: "full-bleed",
  title: "Ironridge is highest, Eastport lowest on the mainland",
  elements: [
    { id: "map", region: "main", type: "map",
      props: { boundaries: "data/map/regions.geojson", id: "code", name: "name",
               layers: { rate: { areas: "data/map/rates.csv", value: "rate", label: "Cases per 1,000", classes: [5, 10, 15] } } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "regions" },
    { id: "rates", set: { map: { shown: ["rate"] } } },
    { id: "ends", only: { map: { highlight: ["W4", "E1"], labels: ["W4", "E1"] } } },
  ],
};
