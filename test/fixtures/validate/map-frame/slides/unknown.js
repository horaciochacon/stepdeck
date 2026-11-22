// `frame` is 1999, which the time-lapse does not have (2001 to 2003).
export default {
  id: "unknown",
  layout: "full-bleed",
  title: "A map",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "code",
               layers: { years: { raster: "data/lapse.json" } },
               shown: ["years"], frame: "1999" } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
};
