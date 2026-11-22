# map

A map of regions from a GeoJSON file, with layers of data over them. A layer with `areas` is a choropleth: a CSV
joined to the regions by key and coloured in the theme's palettes, stepped (`classes`), diverging (`midpoint`) or as a
continuous ramp. A layer with `raster` is a picture over the land from a raster file: a value ramp, classes, or a
mask. A layer with `points` puts a circle at the longitude and latitude of each row of a CSV, sized by a column (area
true to the value, with a two-circle size key in the legend) and coloured by a column or a theme role. Built for step-by-step stories: steps bring layers in and out (each adds its legend row), highlight
regions and name them on the map, fly the map to a region or a box and back, and play a time-lapse raster through its
frames, with a corner panel of the frame's label and its numbers; a region (or land under a raster) without a value is hatched, never a colour of the scale. Colours come
from the theme, so the same deck reads correctly in every theme. The files it draws come from the project's own
analysis code (R or Python); their exact shapes and writer functions for rasters are in the stepdeck docs, "From your
analysis code to a map slide".

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `boundaries` | string | (required) | snap | GeoJSON path relative to the deck root: a FeatureCollection of Polygon and MultiPolygon features, the regions. |
| `id` | string | the feature's `id` | snap | Feature property that identifies a region, as text. `highlight`, `labels` and a layer's `key` column use it. |
| `name` | string | the id | snap | Feature property that labels show. |
| `projection` | `"equal-earth"` \| `"natural-earth"` \| `"mercator"` \| `"conic-equal-area"` | `"equal-earth"` | snap | Centred on the regions and fitted to the element with a margin of 6% of its smaller side. |
| `layers` | `{ id: layer }` | none | fade | The layers of data, keyed by id. See Layers. |
| `shown` | string[] | none | fade | The layers on screen, by id. A layer that appears fades in with its legend row; one that leaves fades out. |
| `highlight` | string[] | none | fade | Regions and points (by id) outlined in ink; every other region of an areas layer and every other point turns `--sd-color-dim`. |
| `view` | region id \| string[] \| `{ bounds }` \| `null` | `null` | tween | Where the map looks: fitted to a region or a list of them, or to `{ bounds: [west, south, east, north] }` in degrees; `null` is the whole map. A change flies the map there. |
| `inset` | `{ view, at, scale }` \| `null` | none | fade | A second, zoomed view of the same shown layers in a corner of the element, with a box on the map, two dashed leaders and a scale bar. `view` is as the map's own (a change flies the inset alone); `at` is `"top-right"` (default), `"top-left"`, `"bottom-right"` or `"bottom-left"`; `scale` (default `true`) shows the scale bar. |
| `frame` | string \| number | the first frame | tween | The time-lapse frame on screen, by its label (compared as text). One value for the map: every time-lapse layer on it has the same labels. A change runs through the frames in between. |
| `pace` | number, 100–2000 | `700` | snap | A run's ms per frame moved. |
| `numbers` | `{ key, label, format }[]` | none | fade | The frame numbers the corner panel shows under the frame's label: a key of the frames' `numbers`, its label, and a d3-format specifier (as `big-number`'s). |
| `labels` | string[] | none | fade | Regions named on the map, at the centroid of their largest polygon, on a halo. |
| `legend` | corner \| `false` | `"bottom-left"` | snap | Where the legend sits (`"bottom-left"`, `"bottom-right"`, `"top-left"`, `"top-right"`), or no legend. |

Layers (`layers.<id>`):

| Key | Meaning |
|---|---|
| `areas` | CSV path: one row per region. Makes the layer a choropleth. |
| `raster` | Raster file path (a JSON: `bounds`, `value`, and a greyscale PNG in `src`, or labelled PNGs in `frames` for a time-lapse). Makes the layer a picture over the land. |
| `points` | CSV path: one row per place. Makes the layer circles over the borders. A layer has exactly one of `areas`, `raster` and `points`. |
| `lon`, `lat` | (`points`, required.) The columns of longitude and latitude, in degrees. |
| `id` | (`points`.) The column that names each point; `highlight` refers to points by it. |
| `size` | (`points`.) The column that sizes each point: radius 18 px × √(value ÷ largest value). Without it every point has a radius of 6 px. |
| `key` | Column naming each row's region, compared as text with the map's `id`. Default: the map's `id`. |
| `value` | Column of values (required). An empty cell, or a region without a row, is hatched. |
| `label` | Title of the layer's legend row. |
| `types` | CSV column types for the loader (`areas` and `points`): declare a key column of codes such as `"07"` as `"string"`. |
| `classes` | (`areas` and value rasters.) Breaks, in increasing order: stepped classes along the sequential palette, labelled `< 5`, `5–10`, …, `≥ 20`. |
| `midpoint` | (`areas` and value rasters.) Splits the diverging palette; with `classes`, one of the breaks. |
| `domain` | (`areas` and value rasters.) `[lo, hi]`: the ends of a continuous ramp, used as given. Default: the values' extent (symmetric about `midpoint`); for a raster, the file's `min` and `max`. |
| `clip` | (Rasters.) Whether the picture is clipped to the land outline. Default `true`; `false` draws every cell whole, for a raster that covers the sea. |
| `color` | A mask's colour, or the colour of `points`: a theme colour role (`accent`, `alert`, `ink`, `muted`, …), default `accent`. For `points`, the name of a column of the CSV instead, when it has one: each distinct value takes a colour of the categorical palette, in order of first appearance. |

Behaviour:
- **Paint order.** The land (`--sd-color-surface`), then the shown `areas` layers, then the shown `raster` layers
  (each kind in the order `layers` declares them), then the borders (`--sd-color-rule`, drawn with `ctx.map.paintBorders`), then the shown `points` layers, then the labels. Each is its own canvas
  layer; the labels are SVG text.
- **Points.** A circle at each row's `lon` and `lat` (a row with neither is an element error), at screen size whatever
  the view, ringed in the background colour. With `size`, its area is true to the value: radius 18 px × √(value ÷
  largest value), so the largest is 18 px and a quarter of its value has half the radius; the larger circles are drawn
  first. The legend row then shows a size key: two circles, the largest value rounded down to two significant figures
  and the round number (1, 2 or 5 × a power of ten) at most a quarter of it (70 gives 70 and 10), with their labels. A `color` that names a column gives each distinct value a colour of the
  categorical palette, with a swatch each in the legend; a row with no value there is `--sd-color-muted` and has no
  swatch. A `color` that is not a column is a theme colour role. A layer with no `size` and a role colour has no legend row.
- **No data.** A region without a value is hatched: lines at 45°, 6 px apart and 1.5 px wide, `--sd-color-dim` over
  `--sd-color-surface`. The legend row then ends with a hatched "no data" swatch (`sin datos` in Spanish).
- **Rasters.** What the file's `value` says decides the look: a value raster (linear or log) takes the scale props as
  `areas` does (the ramp spans the file's `min` to `max` unless `domain` says otherwise); a raster of two or more classes takes the
  categorical palette in order; a raster of one class is a mask, painted in `color`. A value raster or a raster of
  classes hatches the land it has no data for (a land cell without data, and land beyond its bounds) in its own
  canvas, and its legend row adds "no data"; a mask has no no-data and never gets the row. A raster is clipped to the
  land outline (`clip`, default `true`): a coarse cell centred on land stops at the coastline; `clip: false` draws every
  cell whole. A file with `frames` is a
  time-lapse (below). Rasters are drawn at one pixel per CSS pixel and are not dimmed by `highlight`.
- **Time-lapse.** A raster file with `frames` (`[{ src, label, numbers }]`, one PNG each, all with the same bounds and
  `value`) shows the frame `frame` names by its label, the first without it. `frame` is one value for the map, so every
  time-lapse layer on it must have the same labels. While a time-lapse layer is shown, a panel at the top-left (the
  top-right when the inset is there) shows the frame's label in the statement size, tabular figures, and under it the
  `numbers` in the note size, each after its label, formatted with the deck language; each `numbers` key comes from the
  one time-lapse layer whose frames have it. The panel is on the background colour, like the legend: keep the legend
  out of its corner. Frames are decoded for display as they are needed, four ahead of a run, never all at mount.
- **Small regions.** A region under 6 px across in both directions is drawn as a dot of radius 5 px at its centroid,
  in its colour, ringed in the background colour, so a tiny island stays visible.
- **Highlight.** The highlighted regions keep their colour and get an ink outline (a dot's ring turns ink); the other
  regions of a shown areas layer turn `--sd-color-dim`, never faded. A hatched region stays hatched. `highlight` also
  names points, by their `id`: a highlighted point keeps its colour and gets an ink ring, and every other point of a
  shown points layer turns `--sd-color-dim` while anything is highlighted. Region and point ids are one list: an id
  highlights the region and every point that has it, so give points ids no region has.
- **Views.** `view` fits its regions (or its box) to the element, centred, with the same 6% margin as the whole map.
  A view names regions only: a point's id is an error. Lines
  keep their width on screen, points and dots their size; a region too small to see at home becomes an area again
  when the view zooms in enough. A name (`labels`) is drawn only while its region's centre is inside the element.
- **Inset.** The inset shows what the map would at `inset.view` (fitted as `view` is, to the element), smaller: 36% of
  the element's width, with the element's aspect, in the corner `at`, 3% of the element's width in from each of the two
  edges, on the background colour so it hides the map beneath. It has the same layers, colours, highlight and names as
  the map; a name under the inset is left off the map. A box on the map marks the part the inset shows (seen through the map's
  own view, so it follows a flight of either), the inset has an ink border, and two dashed lines (`6 4`) join the box's
  two corners nearest the inset to the matching corners of its border, never crossing either; while the inset covers the
  box there are none. The scale bar sits at the inset's bottom-left: the longest 1, 2 or 5 × 10ⁿ km that fits in 40% of its width, measured
  where the bar starts, labelled `200 km` (`1,000 km` in English, `1.000 km` in Spanish).
- **Legend.** On a panel of the background colour, one row per shown layer: its `label`, then its classes (a swatch
  each, 28 px) or a ramp between its two end values, then the "no data" swatch when a region has no value. Rows stack
  away from the legend's corner. Numbers are written in the deck language (`2,5` in Spanish).
- **Joins.** Keys compare with region ids as text, trimmed. A key column the loader reads as numbers turns `07` into
  `7`, which matches no region `07`: declare it as `"string"` in `types`. A key that matches no region and a region in
  two rows are element errors, never a silently missing value.
- **Motion** (a forward step by one, the map already on screen): a layer that appears or leaves fades over the step's
  duration (`--sd-duration`, or the step's `transition`), with its legend row; labels that come or go fade with it; a
  change to a shown layer's data or scale (a raster's file, scale, `color` or `clip` too) crossfades its colours (a point that stays moves, resizes and changes colour from one to the other; a new point grows,
  one that has gone shrinks); `highlight` tweens the colours over
  `--sd-duration-fast`; a change of `view` flies the map there over twice the step's duration (or the step's
  `transition`), along d3's zoom path (out and in again as far as the distance asks): the land, borders, areas, points
  and names are redrawn at every frame, and a raster crossfades from its picture at the start view to its picture at
  the end view, both moving with the map, the wider one underneath, so it stays filled as the map zooms in or out
  and is sharp when it lands (a long flight that zooms out past both ends can leave a thin margin unfilled at its
  widest moment); an inset that comes or goes fades, with its box and leaders, and a change of `inset.view` flies the inset alone
  in the same way, over twice the step's duration, the box following. A change of `frame` is a **run**: every
  frame from the old one to the new, in the file's order (backward when the new one comes first), each crossfading into
  the next, `pace` ms per frame moved, with the panel's numbers counting linearly from one frame's value to the next and
  its label showing the frame the crossfade heads to once it is half way. A step runs only when it shows a time-lapse
  layer, both steps have the same frame labels and the geometry stays; otherwise the new frame is drawn at once (or
  crossfades with its layer). A step that changes `frame` and other things
  plays them in two phases: everything else first, together, at the old frame (a flight lands), then the run at the end
  view; the first phase lasts twice the step's duration for a flight, once for any other change the map animates, and
  not at all otherwise (`core/map-rules.js` `firstPhase`, which `validate` budgets by too). The engine allows a run more than its usual 10 s (`info.expect`), up to 20 s for both phases together: a longer
  one is an element error (`a run of 20.3 s is longer than 20 s; split it across steps`). A click during a run, a hidden
  page or leaving the slide ends it at once on the step's frame. Jumps,
  backward steps and reduced motion show the end state at once. The map does not own its
  entrance: the engine moves its box in.
- **State on the canvases.** Each canvas layer (`data-layer` `main:base`, `main:areas:<id>`, `main:raster:<id>`, `main:borders`, `main:points:<id>`) carries
  `data-view` (the view of the moment as `k,x,y`, during a flight too), `data-shown`, `data-highlight`, `data-frame` (the label of the frame the map's time-lapse is at, as the panel shows it; empty when no layer the step declares is a time-lapse) and `data-sig` (the signature of what it painted), which
  `dump` and `check --played` compare. An inset has the same canvases, named `inset:base`, `inset:areas:<id>`, `inset:raster:<id>`, `inset:borders` and `inset:points:<id>`, in a
  `div.sd-map-inset-stage`, each with the inset's own `data-view`; they exist only while the inset is on (or fading).
  The panel is `div.sd-map-panel[data-at]`: `div.sd-map-panel-frame` (the label), then a `div.sd-map-panel-number[data-key]`
  per number, holding `span.sd-map-panel-name` and `span.sd-map-panel-value`.
- **Errors** (on the slide): an inset's `view` raises the errors the map's does, and `` `inset` must be `{ view, at, scale }` or null ``,
  ``inset `at` must be "top-right", "top-left", "bottom-right" or "bottom-left"`` and `` inset `scale` must be true or false ``; `region 'X' not found (regions: …)` for `highlight`, `labels` and `view`, and, when a layer has
  points, `'X' not found (regions: …; points: …)` for `highlight`; ``'S4' is a point: `view` names regions only (regions: …)``; `layer 'x' not found (layers: …)` for `shown`;
  `<csv>: row 4 has no lon` (also `lat`, and `size` for a size that is not a number; rows count from 1, not counting the
  header), `<csv>: color 'kinds' is not a column (…) or a theme colour (…)`; `<csv>: key 'X' matches no region`; `<csv>: key 'X' appears twice`;
  `column 'c' not found in <csv> (columns: …)`; and the boundaries' own (`<file>: only Polygon and MultiPolygon
  features are supported (found LineString)`, `<file>: feature 3 has no 'code'`, …). For a time-lapse:
  `frame '1999' not found (frames: 2010, 2011, …)`, `time-lapse layers 'a' and 'b' have different frame labels`,
  `` `numbers` key 'x' is in no time-lapse layer (keys: …) ``, `` `numbers` key 'x' is in time-lapse layers 'a' and 'b' ``,
  `` `numbers` key 'x' needs a `format` (…) ``, `` `pace` must be 100 to 2000 ms a frame ``, `a run of 20.3 s is longer than 20 s; split it across steps`, and
  `data/f/2001.png: 8×7 does not match the first frame (8×6)`.

```js
{ id: "map", region: "main", type: "map",
  props: { boundaries: "data/regions.geojson", id: "code", name: "name",
           layers: { rate: { areas: "data/rates.csv", value: "rate", label: "Cases per 1,000", classes: [5, 10, 15] } } } }
// steps: { set: { map: { shown: ["rate"] } } }, then { only: { map: { highlight: ["W4"], labels: ["W4"] } } }
// a flight there and home again: { set: { map: { view: "W4" } } }, then { set: { map: { view: null } } }
// points instead: layers: { sites: { points: "data/sites.csv", lon: "lon", lat: "lat", id: "id", size: "beds", color: "kind", label: "Beds" } }
// a time-lapse: layers: { years: { raster: "data/years.json", label: "People per km²" } }, shown: ["years"],
//   numbers: [{ key: "people", label: "People", format: ",.0f" }]; then a run: { set: { map: { frame: "2021" } } }
```

The map is a figure: its slide needs a `role: "source"` line. Its pieces are public as `ctx.map` and `ctx.chart`
(`colorScale`, `legendRow`), so a deck component can build a map of its own.
