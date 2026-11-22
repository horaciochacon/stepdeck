// The same square region twice, side by side: wound clockwise, as d3 draws it, and counter-clockwise, as RFC 7946
// files are written. Both must paint the same pixels.
export default {
  id: "square",
  layout: "full-bleed",
  title: "One square, both windings",
  elements: [
    { id: "cw", type: "map", box: { x: 160, y: 200, w: 680, h: 700 }, props: { boundaries: "data/square-cw.geojson", id: "code" } },
    { id: "ccw", type: "map", box: { x: 880, y: 200, w: 680, h: 700 }, props: { boundaries: "data/square-ccw.geojson", id: "code" } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
};
