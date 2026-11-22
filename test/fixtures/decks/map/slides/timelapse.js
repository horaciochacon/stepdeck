// Time-lapse runs: a raster layer of 12 yearly frames (2010 to 2021), with the corner panel showing the year on screen
// and the people of that frame. The map runs from the first frame to the last at 100 ms a frame, back to 2015 at
// 200 ms a frame, flies to North and then runs on to 2020; then the layer takes a file of 19 frames (2000 to 2018) at
// the default 700 ms a frame and runs through all of them: 18 moves, 12.6 s, longer than the plain 10 s an update has.
// Last, an inset on Westmere comes in at the top-left (the panel moves to the top-right) and the map runs back to 2010,
// the inset showing the same frames.
export default {
  id: "timelapse",
  layout: "full-bleed",
  title: "Time-lapse",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "code", name: "name",
               layers: { years: { raster: "data/years.json", label: "People per km²", midpoint: 400 } },
               shown: ["years"], pace: 100,
               numbers: [{ key: "people", label: "People", format: ",.0f" }] } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [
    { id: "first" },
    { id: "last", set: { map: { frame: "2021" } } },
    { id: "back", set: { map: { frame: "2015", pace: 200 } } },
    { id: "north", set: { map: { view: "N1", frame: "2020" } } },
    { id: "long", set: { map: { view: null, layers: { years: { raster: "data/years19.json" } }, frame: "2000", pace: 700 } } },
    { id: "longrun", set: { map: { frame: "2018" } } },
    { id: "corner", set: { map: { inset: { view: "W1", at: "top-left" }, frame: "2010", pace: 100 } } },
  ],
};
