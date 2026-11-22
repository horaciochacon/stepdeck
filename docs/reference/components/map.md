# map

`map` draws files that your project's own analysis code makes: boundaries as GeoJSON, values as CSV, rasters as a JSON and greyscale PNGs. Where those files come from, their exact shapes, and writer functions for R and Python are in [From your analysis code to a map slide](../../guide/maps-from-your-code.md). This page is about the component that draws them.

`map` draws the regions of a GeoJSON file and, over them, layers of data, and tells a story with them step by step. A layer with `areas` is a choropleth: a CSV joined to the regions by key, each region coloured by its value in the theme's palettes, as stepped classes, a diverging scale or a continuous ramp. A layer with `raster` is a picture over the land from a raster file: a value ramp, classes, or a mask. A layer with `points` puts a circle at the longitude and latitude of each row of a CSV, sized by a column and coloured by a column or a theme role. Steps bring layers in and out (each adds its legend row), highlight regions, put their names on the map, fly the map to a region or a box and back, and play a time-lapse raster through its frames, with a corner panel of the frame's label and its numbers. A region, or land a raster has no data for, is hatched, never a colour of the scale, and a region too small to see is drawn as a dot. This page lists every prop and default, what each change does on a forward step, the markup the map renders and the errors it raises. It is for anyone writing map slides by hand or reviewing what an agent wrote.

Sources: [`components/map/schema.json`](../../../engine/components/map/schema.json), [`components/map/index.js`](../../../engine/components/map/index.js), [`components/map/areas.js`](../../../engine/components/map/areas.js), [`components/map/raster.js`](../../../engine/components/map/raster.js), [`components/map/points.js`](../../../engine/components/map/points.js), [`components/map/stage.js`](../../../engine/components/map/stage.js), [`components/map/inset.js`](../../../engine/components/map/inset.js), [`components/map/legend.js`](../../../engine/components/map/legend.js), [`components/map/panel.js`](../../../engine/components/map/panel.js), [`components/map/lapse.js`](../../../engine/components/map/lapse.js), [`core/map-rules.js`](../../../engine/core/map-rules.js), [`core/map.js`](../../../engine/core/map.js), [`core/map-paint.js`](../../../engine/core/map-paint.js), [`core/chart-scale.js`](../../../engine/core/chart-scale.js), [`core/stepdeck.css`](../../../engine/core/stepdeck.css). For the other components, see the [components reference](index.md).

## Use it

The gallery's example slide (`components/map/example.js`): the regions of a fictional country, then their rates in four classes, then the region with the highest rate (Ironridge) and the one with the lowest on the mainland (Eastport; only the island of Little Holm is lower) named and highlighted for one step. The map fills `main` of a `full-bleed` slide, with the source line under it.

```js
export default {
  id: "map-example",
  layout: "full-bleed",
  title: "Ironridge is highest, Eastport lowest on the mainland",
  elements: [
    { id: "map", region: "main", type: "map",
      props: { boundaries: "data/map/regions.geojson", id: "code", name: "name",
               layers: { rate: { areas: "data/map/rates.csv", value: "rate", label: "Cases per 1,000", classes: [5, 10, 15] } } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "regions" },
    { id: "rates", set: { map: { shown: ["rate"] } } },
    { id: "ends", only: { map: { highlight: ["W4", "E1"], labels: ["W4", "E1"] } } },
  ],
};
```

`data/map/regions.geojson` has a `code` and a `name` property on every feature; `data/map/rates.csv` has the columns `code` and `rate`, one row per region, with one region left out. The files of this example are in [`site/gallery/data/map/`](../../../site/gallery/data/map/), made by a seeded script there.

## Props

`boundaries` is required. The schema has `additionalProperties: false`, so any other prop is a `validate` error (`unknown-prop`).

| Prop | Type | Default | Transition | Meaning |
| --- | --- | --- | --- | --- |
| `boundaries` | string | (required) | snap | Path to a GeoJSON FeatureCollection of Polygon and MultiPolygon features, relative to the deck root: the regions, drawn as land in `--sd-color-surface` with borders in `--sd-color-rule`. |
| `id` | string | the feature's own `id` | snap | The feature property that identifies a region, read as text. `highlight`, `labels` and a layer's `key` column refer to regions by it. |
| `name` | string | the id | snap | The feature property that labels show. A feature without it is labelled with its id. |
| `projection` | `"equal-earth"` \| `"natural-earth"` \| `"mercator"` \| `"conic-equal-area"` | `"equal-earth"` | snap | Rotated to the regions' centre longitude and fitted to the element with a margin of 6% of its smaller side. The conic's two parallels sit a sixth of the regions' latitude span in from each end. |
| `layers` | `{ <id>: layer }` | none | fade | The layers of data, keyed by an id. See [Layers](#layers). An object, not a list, so a step's `set` can change one layer. |
| `shown` | string[] | none | fade | The layers on screen, by id. Without it the map shows the regions alone. |
| `highlight` | string[] | none | fade | Regions and points to emphasize, by id. They get an ink outline; every other region of a shown areas layer and every other point turns `--sd-color-dim`. |
| `view` | region id \| string[] \| `{ bounds: [west, south, east, north] }` \| `null` | `null` | tween | Where the map looks: fitted to a region or a list of regions, or to a box in degrees; `null` is the whole map. See [Views and flights](#views-and-flights). |
| `inset` | `{ view, at, scale }` \| `null` | none | fade | A zoomed second view of the same layers in a corner. See [Inset](#inset). |
| `frame` | string \| number | the first frame | tween | The time-lapse frame on screen, by its label (compared as text). See [Time-lapse](#time-lapse). |
| `pace` | number, 100 to 2000 | `700` | snap | How long a run spends on each frame it moves, in ms. |
| `numbers` | `{ key, label, format }[]` | none | fade | The frame numbers the corner panel shows under the frame's label. |
| `labels` | string[] | none | fade | Regions to name, by id: each region's `name` at the centroid of its largest polygon, on a halo. |
| `legend` | `"bottom-left"` \| `"bottom-right"` \| `"top-left"` \| `"top-right"` \| `false` | `"bottom-left"` | snap | The corner the legend sits in, or no legend. |

The transition column is the schema's `x-transition` annotation. It feeds the catalog; the motion itself is written in `index.js` and described in [Motion](#motion).

## Layers

A layer is an object with exactly one kind key: `areas`, `raster` or `points`. The `areas` kind is a choropleth:

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `areas` | string | (required) | Path to a CSV, relative to the deck root, with one row per region. |
| `key` | string | the map's `id` | The column that names each row's region. |
| `value` | string | (required) | The column whose values colour the regions. |
| `label` | string | none | The title of the layer's legend row. |
| `types` | `{ column: "string" \| "number" \| "date" }` | guessed | CSV column types for the data loader. |
| `classes` | number[] | none | Class breaks, in increasing order. See [Colour scales](#colour-scales). |
| `midpoint` | number | none | Where the diverging palette changes hue. |
| `domain` | `[lo, hi]` | the values' extent | The ends of a continuous ramp. |

**The join.** Each row's `key` is compared with the region ids as text, trimmed. A row whose key matches no region, and a region with two rows, are element errors that name the key: a mismatch never shows up as a quietly missing value. A key column the loader reads as numbers turns `07` into `7`, which does not match a region `07`; declare such a column as `"string"` in `types`. A region with no row, or with an empty cell, has no value.

**Paint order.** The land comes first, then the shown `areas` layers, then the shown `raster` layers, each kind in the order `layers` declares them, then the borders (so they stay crisp over a raster), then the shown `points` layers, then the labels. Two shown layers of one kind overlap: the later one covers the earlier, so show one at a time.

### Raster layers

A `raster` layer names a raster file: a JSON that gives the `bounds` (west, south, east, north, the outer edges of the edge cells), what the grey levels mean in `value`, and the greyscale PNG in `src` (a path relative to the JSON), or, for a time-lapse, a list of PNGs in `frames` (see [Time-lapse](#time-lapse)). The picture is drawn from the file's pixels, each canvas pixel taking the colour of the cell under it, so the cells stay square and sharp.

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `raster` | string | (required) | Path to the raster JSON, relative to the deck root. |
| `label` | string | none | The title of the layer's legend row. |
| `classes`, `midpoint`, `domain` | as for `areas` | none | The scale of a value raster (see [Colour scales](#colour-scales)). Without `domain` the ramp spans the file's `min` to `max` (made symmetric about `midpoint`). A raster of classes ignores them. |
| `color` | a theme colour role | `"accent"` | The colour of a mask. `accent`, `alert`, `ink`, `muted`, … any `--sd-color-<role>` the theme defines. |
| `clip` | boolean | `true` | Whether the picture is clipped to the land outline. With `false` every cell is drawn whole. A change crossfades. |

What the file's `value` makes of the layer:

- **A value raster** (`{ scale: "linear" | "log", min, max }`): level *g* (0 to 255) is the value *min + g/255 × (max − min)* (for `log`, *min × (max/min)^(g/255)*), coloured by the scale: a continuous ramp over the file's range, stepped `classes`, or a diverging palette around `midpoint`.
- **A raster of classes** (`{ classes: ["Forest", "Cropland", "Urban"] }`): level *g* is class *g*, one colour each from the categorical palette in order, and one legend swatch per class.
- **A mask** (one class): the pixels that have data are painted in `color`; the others stay clear. One swatch in the legend.

**Clipped to the land.** A raster is clipped to the land outline by default: a coarse cell whose centre is on land stops at the coastline instead of sticking out over the sea, whatever the cell holds (data or hatch), for a value raster, a raster of classes and a mask alike. A pixel is land when the regions cover all of it, so a coastal pixel the regions cover only in part is clear. Set `clip: false` to draw every cell whole, for a raster that covers the sea as well (a sea surface, say); changing `clip` on a forward step crossfades between the two pictures. A raster laid over land that the boundaries do not outline (so nothing is land under it) needs `clip: false`, or it is all clear.

A file with `frames` shows the frame `frame` names (see [Time-lapse](#time-lapse)). Rasters are not dimmed by `highlight`. A raster is a picture of the whole map's size, so it is drawn at one pixel per CSS pixel on any screen.

### Points layers

A `points` layer puts a circle at each row of a CSV, over the borders, at screen size whatever the view.

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `points` | string | (required) | Path to a CSV, relative to the deck root, with one row per place. |
| `lon`, `lat` | string | (required) | The columns of longitude and latitude, in degrees. A row where either is empty or not a number is an element error. |
| `id` | string | none | The column that names each point, as text. `highlight` refers to points by it. |
| `size` | string | none | The column that sizes each point. A row where it is empty, not a number or negative is an element error. |
| `color` | string | `"accent"` | A column of the CSV if it has one of that name, else a theme colour role (`accent`, `alert`, `ink`, `muted`, …). |
| `label` | string | none | The title of the layer's legend row. |
| `types` | `{ column: "string" \| "number" \| "date" }` | guessed | CSV column types for the data loader. |

**Size.** Without `size` every point has a radius of 6 px. With it the area is true to the value: the radius is 18 px × √(value ÷ largest value), so the largest point has a radius of 18 px, a point with a quarter of its value has half its radius and a point of zero is not drawn. The larger circles are drawn first, so a small point is never under a large one.

**Colour.** A `color` that names a column gives each distinct value a colour of the categorical palette, in order of first appearance, and the legend row one swatch each; a row with no value in the column is `--sd-color-muted` and has no swatch. A `color` that is not a column is a theme colour role, as for a mask. A name that is neither a column nor a role is an element error that lists both.

**The size key.** A layer with `size` adds two circles to its legend row, outlined in `--sd-color-muted`: the largest value rounded down to two significant figures (142 gives 140, 70 gives 70), and the round number (1, 2 or 5 × a power of ten) at most a quarter of it (140 gives 20, 70 gives 10), each at the radius that value has on the map and labelled with it. A layer with no `size` and a role colour has no legend row.

Each point is ringed in 1.5 px of the background colour, so points that overlap stay apart. A row whose point the projection cannot place is not drawn.

## Colour scales

The colours come from the theme's palettes (`ctx.palette`), the same scales a chart uses (`ctx.chart.colorScale`).

- **Classes** (`classes: [5, 10, 20]`): four classes, sampled evenly along the sequential palette, labelled `< 5`, `5–10`, `10–20` and `≥ 20` in the legend. A value equal to a break is in the class above it. With `midpoint` (which must be one of the breaks) the classes below it take the first half of the diverging palette and those above it the second.
- **A continuous ramp** (no `classes`): from the lowest to the highest value, or over `domain`, used as given. A value past an end takes the end colour. With `midpoint` the ramp is diverging, and a domain read from the values is made symmetric about the midpoint, so the midpoint takes the palette's neutral middle.
- **Numbers in the legend** are written in the deck language with no fixed decimals: `2.5` reads `2,5` in a Spanish deck.

## Regions without a value, and small regions

A region without a value is **hatched**: lines at 45°, 6 px apart and 1.5 px wide, in `--sd-color-dim` over `--sd-color-surface`. The layer's legend row then ends with a hatched swatch labelled "no data" (`sin datos` in Spanish), the CSS class `.sd-legend-nodata`. The hatch is never a colour of the scale.

A value raster or a raster of classes hatches **land it has no data for**, inside its own canvas: a land cell (one whose centre is on land) with no data, and land beyond the raster's bounds. Its data pixels cover the hatch, so it shows exactly where the land is missing, and the sea stays clear (so does the sea under a cell that reaches past the coast, unless `clip` is `false`). The legend row gets the "no data" swatch when some land is missing. A mask has no "no data": the cells that are not the class are simply clear, and its row never has the swatch.

A region whose box is under 6 px across in both directions is drawn as a **dot**: a disc of radius 5 px at the centroid of its largest polygon, in the region's colour (the land colour on the bare map, the hatch for no data), ringed with 1.5 px of the background colour. An island of a few pixels stays visible this way.

## Highlight and labels

`highlight` outlines its regions in ink (3 px; a dot's ring turns ink) and turns every other region of a shown areas layer to `--sd-color-dim`. Regions dim by colour, never by opacity. A hatched region stays hatched. It also names points, by the `id` column of their layer: a highlighted point keeps its colour and gets a 1.5 px ink ring, and while anything is highlighted every other point of a shown points layer turns `--sd-color-dim`, whether the highlight names a region or a point. Rasters are not dimmed. Use `only` so a highlight lasts one step.

Region ids and point ids are one namespace for `highlight`: an id highlights the region that has it and every point that has it. So give points ids no region has (`S01` for a site, not `N1`), or highlighting a region also rings a point.

`labels` writes each region's name in the note size (`--sd-font-size-note`) in ink, centred on the centroid of its largest polygon, on a 4 px halo of the background colour. Labels are not moved apart: name regions whose centres are far enough apart for their names. A name is drawn only while that centre is inside the element, so a view that zooms in leaves out the names of the regions it leaves out.

## Views and flights

`view` says where the map looks. Without it, or with `null`, the map shows all its regions, fitted to the element. A region id, or a list of them, fits those regions instead, and `{ bounds: [west, south, east, north] }` fits a box of longitude and latitude in degrees (west greater than east crosses the antimeridian). Either is centred and fitted with the same margin as the whole map, 6% of the element's smaller side. A view is a scale and a move of the same projection, never a new projection: lines keep their width on screen, points and dots keep their size, and a region too small to see at home (a dot) becomes an area again once the view makes it large enough.

```js
steps: [
  { id: "country" },
  { id: "west", set: { map: { view: "W4" } } },                         // one region
  { id: "coast", set: { map: { view: ["W4", "S1"] } } },                // the box around two regions
  { id: "bay", set: { map: { view: { bounds: [-15, -28, -12, -25] } } } }, // a box in degrees
  { id: "back", set: { map: { view: null } } },                         // the whole map again
]
```

A view names regions only. A point's id, or an id that is not a region, is an element error.

On a forward step a change of `view` is a **flight**: the map moves along d3's zoom path (`d3.interpolateZoom`), which zooms out and in again as far as the distance asks, over twice the step's duration. The land, the borders, the areas, the points and the names are redrawn at every frame through the view of the moment. A raster crossfades between two pictures, the one made at the start view and the one made at the end view, both moving with the map. The wider of the two is drawn underneath at full strength and the other blends over it, so the raster stays filled as the map zooms in or out, and is sharp, one cell per pixel, when it lands. A long flight whose path zooms out past both ends can leave a thin unfilled margin at its widest moment, where neither picture reaches. A raster's hatch moves with its picture during the flight.

Zooming out, the wider picture is the end view's, so it is underneath at full strength from the first frame of the flight and the start view's picture fades out over it. Where the start picture is clear (a cell with no data, the sea beyond a clipped coast, or land outside the start view) and the end picture has data, that data shows at full strength from the start of the flight instead of fading in.

Each view needs, for each raster, a table from the element's pixels to the raster's cells. The map builds the tables of every view its slide names, its insets' included, when it mounts (for up to 2 s; any left over are built when first needed), so no flight waits for one. No table or picture is ever made for a view in between.

## Inset

`inset` adds a second, zoomed view of the same shown layers in a corner of the element, so a story can keep the whole map in sight while it looks closely at a place.

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `view` | as the map's `view` | (required) | Where the inset looks: a region id or a list of them, `{ bounds }`, or `null` for the whole map. |
| `at` | `"top-right"` \| `"top-left"` \| `"bottom-right"` \| `"bottom-left"` | `"top-right"` | The corner of the element the inset sits in. |
| `scale` | boolean | `true` | Whether the inset has a scale bar. |

```js
steps: [
  { id: "country" },
  { id: "west", set: { map: { inset: { view: "W4" } } } },                       // an inset on one region
  { id: "coast", set: { map: { inset: { view: ["W4", "S1"] } } } },              // the inset flies there; the map stays
  { id: "low", set: { map: { inset: { view: ["W4", "S1"], at: "bottom-right", scale: false } } } },
  { id: "gone", set: { map: { inset: null } } },
]
```

**What it shows.** The inset is a second stage inside the element, not another component: it draws the same prepared layers, colours, highlight and names as the map (the `shown` layers, the `highlight` and the `labels`), through its own view. It shows what the whole map would at that view, fitted as `view` is, only smaller: 36% of the element's width, with the element's aspect, in the corner `at`, 3% of the element's width in from each of the two edges. It sits on `--sd-color-background`, so it hides the map beneath it, and has an ink border. A region's name under the inset is left off the map. The inset and the legend are placed independently: an inset in the legend's corner (`at: "bottom-left"` with the default legend) overlaps the legend, so put them in different corners.

**Box and leaders.** A box on the map marks the part the inset shows, seen through the map's own view. Two dashed lines (`6 4`, in `--sd-color-muted`) join the two corners of the box nearest the inset to the matching corners of its border, and cross neither; while the inset covers the box (they overlap) there are none. When the map flies, the box moves with it, and when the inset flies, the box does.

**Scale bar.** At the inset's bottom-left, 16 px in from its edges: a bar of the longest round length (1, 2 or 5 × 10ⁿ km) that fits in 40% of the inset's width, with its label (`200 km`, `1,000 km`) above it, in the deck language. The length is measured on the sphere at the bar's start, as the great-circle distance of one pixel, so it follows the view. `scale: false` leaves it out.

**Motion.** An inset that comes or goes fades over the step's duration (its box and leaders with it). A change of `inset.view` between two steps that both have an inset flies the inset alone, over twice the step's duration, along the same zoom path as the map's flights; the map does not move. Jumped, backward or aborted, the end state is drawn at once. Changing `at` or `scale` is drawn at once.

The lookup tables the rasters need for the inset's views, at the inset's size, are built at mount with the map's own (see [Views and flights](#views-and-flights)).

## Time-lapse

A raster file with `frames` in place of `src` is a time-lapse: one PNG per frame, each with a unique `label` and, optionally, `numbers` (the same keys in every frame). All frames share the file's `bounds` and `value`, so a colour means the same in every frame.

```json
{
  "bounds": [-19, -31, -10, -23],
  "value": { "scale": "linear", "min": 0, "max": 800 },
  "frames": [
    { "src": "years/2010.png", "label": "2010", "numbers": { "people": 49848391 } },
    { "src": "years/2011.png", "label": "2011", "numbers": { "people": 51316062 } }
  ]
}
```

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `frame` | string \| number | the first frame | The frame on screen, by its label, compared as text (`2015` and `"2015"` are one frame). One value for the whole map: every time-lapse layer the step declares must have the same labels, in the same order. |
| `pace` | number, 100 to 2000 | `700` | How long a run spends on each frame it moves, in ms. |
| `numbers` | `{ key, label, format }[]` | none | The numbers the panel shows: `key` is a key of the frames' `numbers`, found in exactly one time-lapse layer of the map; `label` is its label in the deck's language (without it, the number alone); `format` is a d3-format specifier, localized by the deck language, as `big-number`'s. |

```js
props: { boundaries: "data/regions.geojson", id: "code",
         layers: { years: { raster: "data/years.json", label: "People per km²" } },
         shown: ["years"], numbers: [{ key: "people", label: "People", format: ",.0f" }] },
steps: [
  { id: "start" },                                            // 2010, the first frame
  { id: "run", set: { map: { frame: "2021" } } },             // 11 frames at 700 ms: 7.7 s
  { id: "zoom", set: { map: { view: "W4", frame: "2015" } } }, // a flight to W4, then back to 2015 there
]
```

**The panel.** While a time-lapse layer is shown, a panel sits at the top-left of the element, or at the top-right when the inset is at the top-left. It shows the label of the frame on screen in the statement size (`--sd-font-size-statement`), in tabular figures so the digits hold still, and under it each of `numbers` in the note size, its label in `--sd-color-muted` before its value. It is on a panel of the background colour, like the legend: keep the legend (and the inset) out of its corner. It fades with its layer; numbers that `numbers` gains or loses fade in or out.

**A run.** On a forward step that changes `frame`, the map runs through every frame from the old one to the new one in the file's order, backward when the new frame comes first, each crossfading into the next: the frame after the one on screen is drawn over it, more opaque as the run goes, so the picture is always whole. The run lasts frames moved × `pace` (from 2010 to 2021 at 700 ms: 11 × 700 = 7.7 s), and it is linear in time. During it the panel's numbers count linearly from one frame's value to the next, and its label (and the canvases' `data-frame`) shows the frame the crossfade is heading to once it is half way there. A step runs only when it shows a time-lapse layer, both steps have the same frame labels and the map keeps its `boundaries`, `id`, `name` and `projection`; otherwise the new frame is drawn at once (or crossfades with its layer, when the layer's file changes), so hiding a time-lapse while moving `frame` back plays no run.

**Two phases.** A step that changes `frame` and other things plays them in order: first everything else together (layers fading in or out, a highlight, labels, a flight of the map or the inset), at the frame the step starts from; then the run, at the end view. The audience sees the map go somewhere, then the frames play there; frames never crossfade during a flight. The first phase lasts twice the step's duration when `view` changes, or `inset.view` on a step that keeps its inset; the step's duration when anything else the map animates changes (the layers in `shown`, `highlight`, `labels`, `numbers`, an inset coming or going, the definition of a layer that was shown); and nothing otherwise (`frame`, `pace`, `legend`, a hidden layer's definition, the inset's `at` or `scale`). Every played step's motion lasts that long, a run or not. `validate` budgets a step's run by the same rule (`stepRun` and `firstPhase` in `core/map-rules.js`).

**Long runs.** An update normally has 10 s to settle. A run tells the engine how long it will be (`info.expect`, with both phases together), so a run of 12.6 s (18 frames at 700 ms) plays out. Both phases together may last at most 20 s: a longer step is an element error, `a run of 20.3 s is longer than 20 s; split it across steps`. Lower `pace`, or move `frame` over two steps.

**Decoding.** A frame is decoded when it is first needed: the step's own frame, and during a run the next four frames ahead of the one on screen, in the run's direction. A raster keeps its 12 most recently used frames decoded. The map never decodes every frame at mount for display; it reads the frames once when the layer is first shown or declared (stopping at the first gap it finds) to decide whether the legend needs a "no data" row.

**Ending a run early.** A jump, a backward step, reduced motion and capture show the step's frame and its numbers at once. A click during a run ends it on its frame and applies the next step; hiding the page or leaving the slide ends it at once.

## Legend

The legend sits in the corner `legend` names, 16 px in from the edges, on a panel of the background colour (`--sd-color-background`) so its text keeps its contrast over coloured regions. It holds one row per shown layer that has data: its `label` as a title (note size), then a 28 px swatch per class with its label, or a gradient between the two end values for a ramp, then the hatched "no data" swatch when some region, or some land under a raster, has no value; a points layer adds its size key, two circles with their labels, after its swatches. Rows stack away from the corner, in the order the layers are painted. A layer that appears brings its row; one that leaves takes it away.

## Motion

The engine animates only a forward move of exactly one step, in a live presentation with motion on. A jump, a backward move, the first render and capture mode (used by `shoot` and `check`) draw the target state directly. See [Animation and motion](../../guide/animation-and-motion.md).

| Change | Played (a forward step by one) | Jumped, backward, capture, preview |
| --- | --- | --- |
| `view` changes | The map flies there over twice the theme's `--sd-duration` (800 ms in both built-in themes), or the step's `transition.duration`. See [Views and flights](#views-and-flights). | The end view. |
| A layer enters or leaves `shown` | It fades in or out over the theme's `--sd-duration` (400 ms in both built-in themes), or the step's `transition.duration`, with its legend row. | At once. |
| A shown layer's data or scale changes (a raster's file, scale, `color` or `clip` too) | Its colours crossfade from the old picture to the new over the same time. Points that stay move, resize and change colour from one to the other; new points grow and points that are gone shrink away. | At once. |
| `highlight` set, changed or cleared | The regions' and points' colours and the ink outlines tween over `--sd-duration-fast`. | At once. |
| `inset` set or cleared | The inset fades in or out over the theme's `--sd-duration`, with its box and leaders. | At once. |
| `inset.view` changes | The inset flies there over twice `--sd-duration`, as `view` flies the map; the map stays, and the box follows. | The end view. |
| `labels` changes | Labels that come fade in, labels that go fade out. | At once. |
| `frame` changes | A run through every frame in between, `pace` ms per frame moved, the panel's numbers counting (`info.expect` gives the engine its length). See [Time-lapse](#time-lapse). | The step's frame and its numbers. |
| `frame` and other things change | The other changes first, together; then the run, at the end view. | The end state. |
| `numbers` changes | Rows of the panel that come fade in, rows that go fade out. | At once. |
| `boundaries`, `id`, `name`, `projection`, `legend`, `pace` change | Drawn at once. | At once. |
| The element becomes visible | The engine moves its box in (`map` does not own its entrance), already showing that step's layers. | Shown at once. |
| The page is hidden (a covered or minimized window) | Nothing moves; motion in flight snaps to its end state. | — |
| A click during a run | The run snaps to its end and the next step applies, as any motion does. | — |
| Leaving the slide during a run | The run stops at once. | — |

All of it runs as one `ctx.animate.tween` bound to the step's signal (a run is a second one, after it), so an aborted step (you press next again) snaps to its end state. Every update ends by painting the target state from the props alone, so the markup and the pixels after a played step equal those after jumping to it, which is what `check --played` compares.

## Markup

Inside its element wrapper (`div.sd-el[data-el][data-type="map"]`) the map renders canvas layers, an SVG and the legend:

```text
canvas.sd-canvas-layer[data-layer="main:base"]          the land
canvas.sd-canvas-layer[data-layer="main:areas:<id>"]    one per layer any step declares, cleared while not shown
canvas.sd-canvas-layer[data-layer="main:raster:<id>"]   one per raster layer any step declares, after the areas
canvas.sd-canvas-layer[data-layer="main:borders"]       the borders and the highlight outlines (ctx.map.paintBorders)
canvas.sd-canvas-layer[data-layer="main:points:<id>"]   one per points layer any step declares, over the borders (ctx.map.paintPoints)
div.sd-map-inset-stage                                   only while the inset is on (or fading): left, top, width, height in px
  canvas.sd-canvas-layer[data-layer="inset:<part>"]      the canvases above, named inset:base, inset:areas:<id>, inset:raster:<id>, inset:borders, inset:points:<id>
  svg.sd-map-labels                                      the names in the inset
    text.sd-map-label[data-region]
    g.sd-map-scale                                       the scale bar (line, path.sd-map-scale-caps, its label), with `scale`
svg.sd-map-labels
  text.sd-map-label[data-region]                         one per entry of `labels` whose region's centre is in view
  g.sd-map-inset                                         with the inset: two leaders, rect.sd-map-inset-box, rect.sd-map-inset-frame
div.sd-map-panel[data-at]                                with a time-lapse layer shown: top-left, or top-right when the inset is top-left
  div.sd-map-panel-frame                                 the label of the frame on screen
  div.sd-map-panel-number[data-key]                      one per entry of `numbers`
    span.sd-map-panel-name + span.sd-map-panel-value     its label (when it has one) and its value
div.sd-map-legend[data-at]                               the corner, when a shown layer has a legend
  div.sd-legend-row[data-layer]                          from ctx.chart.legendRow
    span.sd-legend-item > svg.sd-legend-circle + label   a size key's circles, after the swatches
```

Every canvas carries the state it shows, which `dump` prints and `check --played` compares without reading pixels: `data-view` (the view as `k,x,y`, `1.000,0.000,0.000` for the whole map, the view of the moment during a flight), `data-shown` (the layers painted), `data-highlight` (the highlighted regions and points), `data-frame` (the label of the frame the map's time-lapse is at, as the panel shows it; empty when no layer the step declares is a time-lapse) and `data-sig`, the signature of what was painted (empty for a cleared layer); the inset's canvases say the same, with the inset's own `data-view`. A signature covers the geometry too (the boundaries file, the projection and the element's size), so a step that changes `projection` changes it. The element fills the room its region leaves, like a chart.

## Errors

Each of these fails the element. The message is recorded as `<slide>/<element>: <message>` in `STEPDECK.errors`, shown on the canvas in the element's box, reported by `check` as `render-error` and listed in `dump` output. A failed element gets no further updates.

| Message | Cause |
| --- | --- |
| ``map needs a `boundaries` path`` | `boundaries` is missing or empty. |
| `data file not found: <path>` | A file `boundaries` or a layer names is not in the deck. |
| `<file>: not a FeatureCollection` | `boundaries` names a file that is not a GeoJSON FeatureCollection. |
| `<file>: feature 3 has no 'code'` | A feature lacks the `id` property (features count from 1). |
| `<file>: region 'N1' appears twice` | Two features share an id. |
| `<file>: only Polygon and MultiPolygon features are supported (found LineString)` | A feature of another geometry type. |
| `<file>: 6,000 regions is more than 5,000`, `<file>: 300,000 points is more than 250,000` | The boundaries are larger than a map draws; simplify them first. |
| `region 'Nowhere' not found (regions: E1, I1, I2, N1, N2, …)` | `highlight`, `labels` or `view` names a region the boundaries do not have. The first five ids are listed, sorted. |
| ``'S4' is a point: `view` names regions only (regions: E1, I1, I2, N1, N2, …)`` | `view` names a point of a layer the step declares. |
| `` `view` must be a region id, a list of them, `{ bounds: [west, south, east, north] }` or null `` | `view` is neither (`validate` reports it too). |
| `'Nowhere' not found (regions: E1, I1, I2, N1, N2, …; points: S1, S2, S3, S4, S5, …)` | `highlight` names an id that is neither a region nor a point of a layer the step declares. Written when a layer has points; `labels` keeps the message above. |
| ``` `inset` must be `{ view, at, scale }` or null ``` | `inset` is neither an object nor `null`. `validate` reports it too. |
| ``inset `at` must be "top-right", "top-left", "bottom-right" or "bottom-left"`` | `inset.at` is none of the four corners. `inset.view` raises the errors `view` does. |
| ``inset `scale` must be true or false`` | `inset.scale` is not a boolean. `validate` reports it too. |
| `layer 'pop' not found (layers: rate)` | `shown` names a layer that `layers` does not have. |
| ``layer 'pop' needs `areas`, `raster` or `points` `` | A layer without a kind key. |
| `data/sites.csv: row 4 has no lon` | A row's longitude is empty or not a number; also `lat`, and `size` for a size that is not a number (`has a negative size` for a negative one). Rows count from 1, not counting the header. |
| `data/sites.csv: color 'kinds' is not a column (id, lon, lat, beds, kind) or a theme colour (background, surface, …)` | A points layer's `color` is neither a column of its CSV nor a theme colour role. |
| `data/density.json: …` | The raster file or its image is not usable: not found, a sidecar without `bounds` or `value`, an image that is not an 8-bit greyscale PNG, over 2,000 × 2,000 pixels. The message starts with the file's path. |
| `data/mask.json: color 'teal' is not a theme colour (background, surface, …)` | A mask's `color` names a role the theme has no `--sd-color-<role>` for. |
| `frame '1999' not found (frames: 2010, 2011, 2012, 2013, 2014, …)` | `frame` names a label the time-lapse files do not have. The first five labels are listed. |
| `time-lapse layers 'years' and 'rain' have different frame labels` | Two time-lapse layers the step declares have different label lists. |
| `data/years/2011.png: 8×7 does not match the first frame (8×6)` | A frame's PNG is another size than the first frame's. |
| `a run of 20.3 s is longer than 20 s; split it across steps` | A played step's first phase and run together last more than 20 s. |
| ``\`numbers\` key 'pop' is in no time-lapse layer (keys: people)`` | A `numbers` key no time-lapse layer of the step has. |
| ``\`numbers\` key 'people' is in time-lapse layers 'years' and 'rain'`` | A `numbers` key two time-lapse layers have. |
| ``\`numbers\` key 'people' needs a \`format\` (a d3-format string such as ",.0f")`` | An entry of `numbers` without a `format`. |
| ``\`pace\` must be 100 to 2000 ms a frame`` | `pace` is outside its range (`validate` reports it too). |
| `3 categories but the palette has 2 colours` | A raster of more classes, or a points `color` column of more distinct values, than the categorical palette has colours. |
| `column 'rat' not found in data/rates.csv (columns: code, rate)` | `key`, `value`, `lon`, `lat`, `id` or `size` names a column the CSV does not have. |
| ``map needs `key` (a column name)`` | A layer has no `key` and the map has no `id` to default to. |
| `data/rates.csv: key '07' matches no region` | A row's key is not a region id. |
| `data/rates.csv: key 'N1' appears twice` | Two rows name the same region. |
| ``\`midpoint\` must be one of \`classes\` (5, 10, 20)`` | `midpoint` and `classes` together, with a midpoint that is not a break. |

`validate` checks the schema and that every file the props name exists, and catches much of the rest before the map is shown: the ids in `shown` (`map-layer`), `frame` and the labels and `numbers` keys of the time-lapse files (`map-frame`, `map-prop-unused`), the raster files and their images (`map-raster`), the columns a layer names (`missing-column`) and the length of a run (`map-run`). It does not join the rows to the regions or check the ids in `highlight`, `labels` and `view`: those are checked when the slide renders. Run `check` (or `dump`) to see them:

```text
areas/map: data/rates.csv: key '07' matches no region
```

`map` is a figure, so its slide also needs an element with `role: "source"` or `validate` reports `figure-source`. See [Rules](../rules.md).

## Gotchas

**A map in `statement` main has no height.** Like a chart, it fills the room its region leaves, and that region has none. Use `full-bleed`, `figure-notes` or a `halves` half.

**`highlight` set with `set` lasts.** It folds into every later step. Use `only` for a one-step emphasis.

**Codes with leading zeros.** A key column of numbers loses its zeros (`07` becomes `7`) unless `types` declares it a string.

**Two shown layers of one kind.** The later one covers the earlier. Switch `shown` from one to the other to compare them.

**A legend at the top.** The time-lapse panel sits at the top-left (the top-right when the inset is at the top-left). A legend in that corner covers it: keep the legend at the bottom.

**A run longer than 20 s.** Split it across steps (`frame: "2005"`, then `frame: "2018"`), or lower `pace`.

**An inset of the whole map from a step.** A step's `set` is a merge patch, where `null` deletes a key, so `set: { map: { inset: { view: null } } }` leaves an inset without a `view`, and `validate` reports `'view' missing`. Give such an inset in the element's own props, or in a `replace`; from a step, an inset can look at regions or a `{ bounds }` box.

**An inset in the legend's corner.** The two do not move apart: keep them in different corners.

**A region and a point with one id.** `highlight` treats them as one: give points ids no region has.

## For agents

The agent-facing summary of this component is in [`skill/references/components.md`](../../../skill/references/components.md). `node cli/index.js catalog map` prints the same props from the schema. A deck component that needs a map the built-in does not draw can use the same pieces: `ctx.map` (boundaries, projection, views, painters) and `ctx.chart.colorScale` and `ctx.chart.legendRow`, described in the [Component contract](../component-contract.md#ctxmap).

## See also

- [From your analysis code to a map slide](../../guide/maps-from-your-code.md): where the files come from, their exact shapes, writer functions for R and Python, and `stepdeck boundaries`.
- [Components](index.md): the rules every component shares.
- [Component contract](../component-contract.md#ctxmap): `ctx.map`, the geography the map is built from.
- [Data and bindings](../../guide/data-and-bindings.md): CSV column types and paths.
