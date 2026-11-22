// A choropleth step by step: the regions alone, the rates in four classes (Eastport has no rate, so it is hatched),
// North and Westmere highlighted for one step, then three names on the map.
export default {
  id: "areas",
  layout: "full-bleed",
  title: "Rates by region",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "code", name: "name",
               layers: { rate: { areas: "data/rates.csv", value: "rate", label: "Rate per 1,000", classes: [5, 10, 20] } } } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [
    { id: "base" },
    { id: "rates", set: { map: { shown: ["rate"] } } },
    { id: "focus", only: { map: { highlight: ["N1", "W1"] } } },
    { id: "named", set: { map: { labels: ["N1", "W1", "S2"] } } },
  ],
};
