// `shown` lists 'pop', but the only layer is 'rate'.
export default {
  id: "s",
  layout: "full-bleed",
  title: "A map",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "code",
               layers: { rate: { areas: "data/rates.csv", key: "code", value: "rate" } },
               shown: ["pop"] } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
};
