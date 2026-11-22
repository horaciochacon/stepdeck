// Map story: a time-lapse. A raster file with twelve frames, 2010 to 2021, each frame a year of people per km². Each
// step moves `frame`: the map runs through the frames in between, and the panel's year and its people count follow.
// Data: data/map/regions.geojson and data/map/years.json (twelve PNGs in data/map/years/, `numbers.people` in each).
export default {
  id: "map-timelapse",
  layout: "full-bleed",
  title: "The population grew by about 45% from 2010 to 2021",
  elements: [
    { id: "map", region: "main", type: "map",
      props: { boundaries: "data/map/regions.geojson", id: "code", name: "name", shown: ["years"],
               layers: { years: { raster: "data/map/years.json", label: "People per km²" } },
               numbers: [{ key: "people", label: "People", format: ",.0f" }] } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "start" },
    { id: "middle", set: { map: { frame: "2015" } } },
    { id: "end", set: { map: { frame: "2021" } } },
  ],
  notes: "A time-lapse: frame moves a run through the frames, pace sets the time per frame, numbers fills the panel. Reference: docs/reference/components/map.md",
};
