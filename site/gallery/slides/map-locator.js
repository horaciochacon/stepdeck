// Map story: a locator inset. A rate map zooms into one region, then two; a small overview in the corner keeps the
// whole country in sight, with a box that follows the flight. Data: data/map/regions.geojson and data/map/rates.csv.
export default {
  id: "map-locator",
  layout: "full-bleed",
  title: "Zooming in on the west coast",
  elements: [
    { id: "map", region: "main", type: "map",
      props: { boundaries: "data/map/regions.geojson", id: "code", name: "name", shown: ["rate"], legend: "bottom-left",
               inset: { view: null, at: "top-right", locator: true },
               layers: { rate: { areas: "data/map/rates.csv", value: "rate", label: "Cases per 1,000", classes: [5, 10, 15], types: { code: "string" } } } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "country" },
    { id: "west", set: { map: { view: "W4" } } },
    { id: "coast", set: { map: { view: ["W4", "S1"] } } },
  ],
  notes: "inset.locator: an overview whose box follows the map's flights. Reference: docs/reference/components/map.md",
};
