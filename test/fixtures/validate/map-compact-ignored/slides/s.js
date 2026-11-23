// The same map at full size, where every prop draws, and compact, where `labels`, `legend`, `numbers` and `inset` draw
// nothing; a compact map with `legend: false` and nothing else it ignores.
const props = {
  boundaries: "data/regions.geojson", id: "code", name: "name",
  layers: { years: { raster: "data/lapse.json", label: "People per km²" } }, shown: ["years"],
  numbers: [{ key: "people", label: "People", format: ",.0f" }],
  labels: ["Q1"], legend: "top-left", inset: { view: "Q1", at: "bottom-right" },
};
export default {
  id: "s",
  layout: "full-bleed",
  title: "A compact map ignores what it cannot carry",
  elements: [
    { id: "full", type: "map", box: { x: 100, y: 200, w: 900, h: 600 }, props },
    { id: "small", type: "map", box: { x: 1100, y: 200, w: 640, h: 300 }, props: { ...props, compact: true, caption: "Where" } },
    { id: "quiet", type: "map", box: { x: 1100, y: 560, w: 640, h: 240 },
      props: { boundaries: "data/regions.geojson", id: "code", compact: true, caption: "Here", legend: false } },
    { id: "src", type: "text", box: { x: 100, y: 920, w: 1640, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
};
