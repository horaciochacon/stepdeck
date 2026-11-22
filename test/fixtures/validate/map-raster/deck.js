// Fixture: raster files outside the raster format, one slide each: a bad sidecar, a colour PNG, a missing image, an interlaced one, a file that is no PNG, frames of different sizes, an image named in the wrong case, one outside the deck, and a sidecar that is not JSON. The files come from make.mjs.
export default {
  title: "validate fixture: map-raster",
  lang: "en",
  theme: "academic-light",
  slides: ["sidecar", "colour", "missing", "interlaced", "junk", "size", "case", "outside", "parse"],
};
