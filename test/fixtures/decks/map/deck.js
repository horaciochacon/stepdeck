// Fixture: the built-in `map`, clean under `check --played` in both themes (the slides that fail on purpose are in
// map-broken). The elements are placed with `box`, so the tests know their size in pixels. fixture.mapchild mounts the
// map inside a deck component, as a `ctx.mount` child. compact is a second view: a compact map with its caption. locator
// is an inset that marks where the map is. All values are synthetic.
export default {
  title: "Map fixture",
  lang: "en",
  theme: "academic-light",
  components: ["fixture.mapchild"],
  slides: ["areas", "legends", "rasters", "small", "square", "projection", "points", "flight", "inset", "timelapse", "gaps", "child", "compact", "locator"],
};
