// Two time-lapse layers whose labels differ (2001, 2002, 2003 and 2001, 2002, 2004).
export default {
  id: "labels",
  layout: "full-bleed",
  title: "A map",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "code",
               layers: { years: { raster: "data/lapse.json" }, other: { raster: "data/other.json" } },
               shown: ["years"] } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
};
