// The rates on the same regions in two projections: a step that changes `projection` redraws the map at once, and every
// canvas's signature changes with it (the geometry is part of what a signature hashes).
export default {
  id: "projection",
  layout: "full-bleed",
  title: "Two projections",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "code", projection: "equal-earth", shown: ["rate"], legend: false,
               layers: { rate: { areas: "data/rates.csv", value: "rate", classes: [5, 10, 20] } } } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [
    { id: "equal" },
    { id: "conic", set: { map: { projection: "conic-equal-area" } } },
  ],
};
