// A compact map, the small locator a slide sets beside a chart (560 x 340 px): no legend, names, panel or inset, and
// one caption a step in its own band at the top of the second-view frame. The regions alone; North lit (its land takes
// a tint of the accent); the rates; a flight to North; the 12-frame time-lapse; a run of three frames; home again.
export default {
  id: "compact",
  layout: "full-bleed",
  title: "A compact map",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 560, h: 340 },
      props: { boundaries: "data/regions.geojson", id: "code", compact: true, caption: "All regions", pace: 100,
               layers: { rate: { areas: "data/rates.csv", value: "rate", classes: [5, 10, 20] },
                         years: { raster: "data/years.json", midpoint: 400 } } } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [
    { id: "plain" },
    { id: "lit", set: { map: { highlight: ["N1"], caption: "North" } } },
    { id: "rates", set: { map: { shown: ["rate"], caption: "Rates in North" } } },
    { id: "fly", set: { map: { view: "N1", caption: "Closer" } } },
    { id: "years", set: { map: { shown: ["years"], caption: "People, 2010" } } },
    { id: "run", set: { map: { frame: "2013", caption: "People, 2013" } } },
    { id: "home", set: { map: { view: null, caption: "All regions" } } },
  ],
};
