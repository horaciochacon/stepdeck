// Two layers, one shown at a time, with the legend at the top right: classes at 2.5 and 5 (a Spanish load reads
// them with decimal commas), then a continuous diverging ramp about 0, which has no classes.
export default {
  id: "legends",
  layout: "full-bleed",
  title: "Two legends",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "code", name: "name", legend: "top-right", shown: ["low"],
               layers: {
                 low: { areas: "data/rates.csv", value: "rate", label: "Rate", classes: [2.5, 5] },
                 change: { areas: "data/change.csv", value: "change", label: "Change", midpoint: 0 },
               } } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [
    { id: "steps" },
    { id: "ramp", set: { map: { shown: ["change"] } } },
  ],
};
