// The locator inset: the density raster, then an inset on the whole map (at the top-right) whose box marks what the map
// shows. The map flies to North and to Westmere and the inset to a pair of regions (the box follows either, in the inset);
// the inset on Westmere with the map at home or on a pair of regions gives a box wider than the inset (clipped), the map on
// Southmouth one clipped on two sides, and on North none (the inset does not show what the map does); the inset moves to a
// corner and back to the whole map, turns into a zoom inset (the box back on the map, with leaders) and goes away.
export default {
  id: "locator",
  layout: "full-bleed",
  title: "Locator",
  elements: [
    { id: "map", type: "map", box: { x: 160, y: 200, w: 1400, h: 700 },
      props: { boundaries: "data/regions.geojson", id: "code", name: "name",
               layers: { density: { raster: "data/density.json", label: "People per km²", midpoint: 400 } },
               shown: ["density"] } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [
    { id: "home" },
    { id: "locator", set: { map: { inset: { view: null, locator: true } } } },
    { id: "north", set: { map: { view: "N1" } } },
    { id: "west", set: { map: { view: "W1" } } },
    { id: "closer", set: { map: { inset: { view: ["W1", "S2"], locator: true } } } },
    { id: "wide", set: { map: { view: null, inset: { view: "W1", locator: true } } } },
    { id: "pair", set: { map: { view: ["W1", "S2"] } } },
    { id: "partial", set: { map: { view: "S1" } } },
    { id: "away", set: { map: { view: "N1" } } },
    { id: "corner", set: { map: { view: "N1", inset: { view: null, locator: true, at: "bottom-left", scale: false } } } },
    { id: "zoom", set: { map: { inset: { view: "W1", locator: false, at: "top-right", scale: true } } } },
    { id: "off", set: { map: { inset: null } } },
  ],
};
