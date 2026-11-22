// A locator-sized map (140 x 76 px): the two islands are under 6 px across, so they are drawn as dots.
export default {
  id: "small",
  layout: "full-bleed",
  title: "A small map",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 140, h: 76 },
      props: { boundaries: "data/regions.geojson", id: "code", legend: false, shown: ["rate"],
               layers: { rate: { areas: "data/rates.csv", value: "rate", classes: [5, 10, 20] } } } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
};
