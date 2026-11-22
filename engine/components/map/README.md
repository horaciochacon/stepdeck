# map

A map of regions from a GeoJSON file, with layers of data over them. A layer with `areas` is a choropleth: a CSV
joined to the regions by key and coloured in the theme's palettes, stepped (`classes`), diverging (`midpoint`) or as a
continuous ramp. A layer with `raster` is a picture over the land from a raster file: a value ramp, classes, or a
mask. Built for step-by-step stories: steps bring layers in and out (each adds its legend row), highlight
regions and name them on the map, and a region (or land under a raster) without a value is hatched, never a colour of the scale. Colours come
from the theme, so the same deck reads correctly in every theme.

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `boundaries` | string | (required) | snap | GeoJSON path relative to the deck root: a FeatureCollection of Polygon and MultiPolygon features, the regions. |
| `id` | string | the feature's `id` | snap | Feature property that identifies a region, as text. `highlight`, `labels` and a layer's `key` column use it. |
| `name` | string | the id | snap | Feature property that labels show. |
| `projection` | `"equal-earth"` \| `"natural-earth"` \| `"mercator"` \| `"conic-equal-area"` | `"equal-earth"` | snap | Centred on the regions and fitted to the element with a margin of 6% of its smaller side. |
| `layers` | `{ id: layer }` | none | fade | The layers of data, keyed by id. See Layers. |
| `shown` | string[] | none | fade | The layers on screen, by id. A layer that appears fades in with its legend row; one that leaves fades out. |
| `highlight` | string[] | none | fade | Regions outlined in ink; every other region of an areas layer turns `--sd-color-dim`. |
| `labels` | string[] | none | fade | Regions named on the map, at the centroid of their largest polygon, on a halo. |
| `legend` | corner \| `false` | `"bottom-left"` | snap | Where the legend sits (`"bottom-left"`, `"bottom-right"`, `"top-left"`, `"top-right"`), or no legend. |

Layers (`layers.<id>`):

| Key | Meaning |
|---|---|
| `areas` | CSV path: one row per region. Makes the layer a choropleth. |
| `raster` | Raster file path (a JSON: `bounds`, `value`, and a greyscale PNG in `src`). Makes the layer a picture over the land. A layer has one of `areas` and `raster`. |
| `key` | Column naming each row's region, compared as text with the map's `id`. Default: the map's `id`. |
| `value` | Column of values (required). An empty cell, or a region without a row, is hatched. |
| `label` | Title of the layer's legend row. |
| `types` | CSV column types for the loader: declare a key column of codes such as `"07"` as `"string"`. |
| `classes` | (`areas` and value rasters.) Breaks, in increasing order: stepped classes along the sequential palette, labelled `< 5`, `5–10`, …, `≥ 20`. |
| `midpoint` | (`areas` and value rasters.) Splits the diverging palette; with `classes`, one of the breaks. |
| `domain` | (`areas` and value rasters.) `[lo, hi]`: the ends of a continuous ramp, used as given. Default: the values' extent (symmetric about `midpoint`); for a raster, the file's `min` and `max`. |
| `color` | A mask's colour: a theme colour role (`accent`, `alert`, `ink`, `muted`, …). Default `accent`. |

Behaviour:
- **Paint order.** The land (`--sd-color-surface`), then the shown `areas` layers, then the shown `raster` layers
  (each kind in the order `layers` declares them), then the borders (`--sd-color-rule`, drawn with `ctx.map.paintBorders`) on top, then the labels. Each is its own canvas
  layer; the labels are SVG text.
- **No data.** A region without a value is hatched: lines at 45°, 6 px apart and 1.5 px wide, `--sd-color-dim` over
  `--sd-color-surface`. The legend row then ends with a hatched "no data" swatch (`sin datos` in Spanish).
- **Rasters.** What the file's `value` says decides the look: a value raster (linear or log) takes the scale props as
  `areas` does (the ramp spans the file's `min` to `max` unless `domain` says otherwise); a raster of two or more classes takes the
  categorical palette in order; a raster of one class is a mask, painted in `color`. A value raster or a raster of
  classes hatches the land it has no data for (a land cell without data, and land beyond its bounds) in its own
  canvas, and its legend row adds "no data"; a mask has no no-data and never gets the row. A file with `frames` shows
  its first frame. Rasters are drawn at one pixel per CSS pixel and are not dimmed by `highlight`.
- **Small regions.** A region under 6 px across in both directions is drawn as a dot of radius 5 px at its centroid,
  in its colour, ringed in the background colour, so a tiny island stays visible.
- **Highlight.** The highlighted regions keep their colour and get an ink outline (a dot's ring turns ink); the other
  regions of a shown areas layer turn `--sd-color-dim`, never faded. A hatched region stays hatched.
- **Legend.** On a panel of the background colour, one row per shown layer: its `label`, then its classes (a swatch
  each, 28 px) or a ramp between its two end values, then the "no data" swatch when a region has no value. Rows stack
  away from the legend's corner. Numbers are written in the deck language (`2,5` in Spanish).
- **Joins.** Keys compare with region ids as text, trimmed. A key column the loader reads as numbers turns `07` into
  `7`, which matches no region `07`: declare it as `"string"` in `types`. A key that matches no region and a region in
  two rows are element errors, never a silently missing value.
- **Motion** (a forward step by one, the map already on screen): a layer that appears or leaves fades over the step's
  duration (`--sd-duration`, or the step's `transition`), with its legend row; labels that come or go fade with it; a
  change to a shown areas layer's data or scale crossfades its colours (a raster shows its new picture at once); `highlight` tweens the colours over
  `--sd-duration-fast`. Jumps, backward steps and reduced motion show the end state at once. The map does not own its
  entrance: the engine moves its box in.
- **State on the canvases.** Each canvas layer (`data-layer` `main:base`, `main:areas:<id>`, `main:raster:<id>`, `main:borders`) carries
  `data-view`, `data-shown`, `data-highlight`, `data-frame` and `data-sig` (the signature of what it painted), which
  `dump` and `check --played` compare.
- **Errors** (on the slide): `region 'X' not found (regions: …)` for `highlight` and `labels`; `layer 'x' not found
  (layers: …)` for `shown`; `<csv>: key 'X' matches no region`; `<csv>: key 'X' appears twice`;
  `column 'c' not found in <csv> (columns: …)`; and the boundaries' own (`<file>: only Polygon and MultiPolygon
  features are supported (found LineString)`, `<file>: feature 3 has no 'code'`, …).

```js
{ id: "map", region: "main", type: "map",
  props: { boundaries: "data/regions.geojson", id: "code", name: "name",
           layers: { rate: { areas: "data/rates.csv", value: "rate", label: "Cases per 1,000", classes: [5, 10, 15] } } } }
// steps: { set: { map: { shown: ["rate"] } } }, then { only: { map: { highlight: ["W4"], labels: ["W4"] } } }
```

The map is a figure: its slide needs a `role: "source"` line. Its pieces are public as `ctx.map` and `ctx.chart`
(`colorScale`, `legendRow`), so a deck component can build a map of its own.
