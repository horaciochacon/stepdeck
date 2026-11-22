// Map story: a flight and an inset. A choropleth of the change in each region, a flight to the region that rose most
// (the map zooms in on it), then back out with an inset that keeps it in view: a zoomed second view with a box on the map
// where it is, two leader lines and a scale bar. The country is narrow, so the home view is a box wider than it to the
// west: the country sits to the right of centre and the inset has the empty left for itself, with the legend under it.
// Data: data/map/regions.geojson and data/map/change.csv (code, change).
const HOME = { bounds: [-22.5, -29.62, -10, -23.49] };
export default {
  id: "map-flight-inset",
  layout: "full-bleed",
  title: "Southmouth rose the most",
  elements: [
    { id: "map", region: "main", type: "map",
      props: { boundaries: "data/map/regions.geojson", id: "code", name: "name", shown: ["change"], view: HOME, legend: "bottom-left",
               layers: { change: { areas: "data/map/change.csv", value: "change", label: "Change in cases per 1,000", classes: [-4, 0, 6], midpoint: 0 } } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "change" },
    { id: "flight", set: { map: { view: "S1", labels: ["S1"] } } },
    { id: "inset", set: { map: { view: HOME, inset: { view: "S1", at: "top-left" } } } },
  ],
  notes: "A flight (view) and an inset with its box, leaders and scale bar. Reference: docs/reference/components/map.md",
};
