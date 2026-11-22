# From your analysis code to a map slide

This page is for people who make map slides from their own analysis. Most real map slides show admin 1 or admin 2 regions (provinces, districts), and the analysis code that produces their numbers, in R or Python, already holds the boundaries, the region ids and the values. That code makes the map's files. stepdeck draws them and steps through them.

The page draws the line between the two, then gives what crosses it: the files and their exact shapes, writer functions to paste into your code, how to write boundaries, the slide that names the files, and the checks. For every prop of the map itself, see the [`map` reference](../reference/components/map.md).

## Two sides

| Your project's code (R, Python) | stepdeck |
|---|---|
| Picks the boundaries and the admin level, and simplifies them | Reads GeoJSON as `sf` and `geopandas` write it, and fixes the winding |
| Builds the ids and joins its data to them | Joins a values CSV to the boundaries by the id the slide names; errors on keys that match nothing |
| Computes values, classes, rasters and time-lapse frames | Paints them with the theme's colours, legend rows and no-data hatching |
| Writes the files into the deck's `data/` | Steps, flights, inset and runs; played equals jumped |
| Re-runs when the analysis changes | `validate` checks the files; `check --played` checks the motion |

stepdeck never chooses boundaries, matches names to codes, aggregates values or reprojects a raster: your code does, where you can test and re-run it. stepdeck's side is a small, exact hand-off:
- **the file formats** below;
- **two writer functions**, one in R and one in Python, that you copy into your project to write rasters in that format;
- **the `map` component**, which draws the files and steps through them;
- **`validate`**, which checks the files before the slide is shown;
- **`stepdeck boundaries`**, only for a project that has no boundaries of its own.

A deck with a map looks like this. Everything under `data/` comes from your code:

```text
my-talk/
  deck.js
  slides/
    where.js            the slide: names the files, steps through them
  data/
    regions.geojson     boundaries, one feature per region, with an id property
    rates.csv           values, one row per region, keyed by that id
    density.json        a raster: what its grey levels mean, where it lies
    density.png         its grey levels
    years.json          a time-lapse: the same, with one PNG per frame
    years/001.png, years/002.png, …
```

## The files and their exact shapes

Paths in a slide are relative to the deck root (`data/rates.csv`). A raster's image paths are relative to its JSON.

### Boundaries: a GeoJSON file

A FeatureCollection of `Polygon` and `MultiPolygon` features, in longitude and latitude (WGS 84, EPSG:4326, as GeoJSON requires), one feature per region:

```json
{ "type": "FeatureCollection", "features": [
  { "type": "Feature", "properties": { "code": "N1", "name": "North" },
    "geometry": { "type": "Polygon", "coordinates": [[[-14.2, -24.1], [-13.1, -24.3], [-13.6, -25.2], [-14.2, -24.1]]] } }
] }
```

- **An id property on every feature.** The slide's `id` names it (`id: "code"`); without `id`, the feature's own `id` member is used. Ids are read as text, must be unique, and are what `highlight`, `labels`, `view` and a values CSV refer to. Build them in your code, with the codes your data already uses.
- **A name property**, optionally, for the names on the map (`name: "name"`). A feature without one is labelled with its id.
- **Either winding.** Files written by `sf` and `geopandas` (RFC 7946, outer rings counter-clockwise) and files with the opposite winding both work: stepdeck reverses the rings of any polygon that would otherwise cover more than half the globe. Do not rewind it yourself.
- **Limits.** At most 5,000 regions and 250,000 coordinate positions (every ring of every polygon counts). Simplify first (see [Writing boundaries](#writing-boundaries)); a talk needs far fewer points than an analysis.

### Values: a CSV, one row per region

```csv
code,rate
N1,14.4
N2,7.8
E1,2.6
```

- **The key column** names each row's region (the layer's `key`, by default the map's `id` name). Keys are compared with the region ids as text, trimmed.
- **A key that matches no region is an error**, and so is a region in two rows. A mismatch never shows up as a quietly missing value: the slide fails and names the key.
- **A region with no row, or with an empty cell, has no value.** It is hatched and the legend adds "no data". Leave the cell empty; never write a 0 or a sentinel for "unknown".
- **Codes with leading zeros.** The CSV loader reads a column of digits as numbers, so `07` becomes `7`. Declare the key column as text in the layer: `types: { code: "string" }`.
- **Classes are the slide's.** Write the values; the layer's `classes`, `midpoint` or `domain` turn them into colours. If your analysis defines the breaks, copy them into `classes`.

A points layer reads a CSV too, one row per place: a longitude and a latitude column in degrees, and optionally an id, a size and a colour column (see [Points layers](../reference/components/map.md#points-layers)).

### Rasters: a JSON file and a greyscale PNG

A raster layer names one JSON file. It says where the raster lies, what its grey levels mean and which image holds them:

```json
{
  "bounds": [-19, -31, -10, -23],
  "value": { "scale": "linear", "min": 0, "max": 800, "unit": "people per km²" },
  "src": "density.png"
}
```

- **`bounds`** is `[west, south, east, north]` in degrees: the outer edges of the edge cells (pixel-is-area), as `terra::ext` and rasterio's `dataset.bounds` give them. Each pixel covers an equal share of the box. If your grid is a table of cell centres, the bounds are the outermost centres plus half a cell on each side. West must be less than east: a raster cannot cross the antimeridian.
- **Longitude and latitude only.** The grid's rows are parallels and its columns meridians (EPSG:4326). Reproject a raster in another projection first (`terra::project(r, "EPSG:4326")`, `rasterio.warp.reproject`). The map then lines it up with the boundaries in any projection.
- **Rows run north to south, columns west to east**, so the image's top-left pixel is the north-west cell.
- **The PNG** is 8-bit greyscale (colour type 0), or 8-bit greyscale with alpha (type 4) where some cells have no data. Alpha is 0 for no data and 255 for data; the map reads alpha below 128 as no data, and the grey under it does not matter. The image is not interlaced, has no colour chunks (`gAMA`, `cHRM`, `iCCP`, `sRGB`), so every browser decodes it to the same bytes, and has at most 2,000 × 2,000 pixels. A general image library (a plot device, Pillow, ImageMagick) easily writes colour, a colour profile or 16 bits; the writer functions below write exactly this format.
- **No data is transparency only**: there is no reserved level. On the map, land a value raster has no data for is hatched, and the legend adds "no data".

**`value`** says what a grey level *g* (0 to 255) means:

| `value` | Level *g* means | Your code writes the value *v* as |
|---|---|---|
| `{ "scale": "linear", "min", "max" }` | *min + g/255 × (max − min)* | *g* = floor((*v* − *min*) / (*max* − *min*) × 255 + 0.5) |
| `{ "scale": "log", "min", "max" }`, *min* > 0 | *min × (max/min)^(g/255)* | *g* = floor(ln(*v* / *min*) / ln(*max* / *min*) × 255 + 0.5) |
| `{ "classes": ["Forest", "Cropland", "Urban"] }` | class number *g*, counted from 0 | *g* = the class's place in the list |

Every level is a value, so the 256 levels cover the range from *min* to *max*, and a value is stored within half a level of itself. Other keys, such as `unit`, are kept in the file; the map does not read them. A list of one class is a **mask**: its pixels are drawn in one colour, the others stay clear. A raster of classes can have at most as many classes as the theme's categorical palette has colours (six in both built-in themes).

### Time-lapses: frames in place of `src`

A raster file with `frames` is a time-lapse, one PNG per frame:

```json
{
  "bounds": [-19, -31, -10, -23],
  "value": { "scale": "linear", "min": 0, "max": 800, "unit": "people per km²" },
  "frames": [
    { "src": "years/001.png", "label": "2010", "numbers": { "people": 71599478 } },
    { "src": "years/002.png", "label": "2011", "numbers": { "people": 73588533 } }
  ]
}
```

- **Every frame shares `bounds` and `value`**, so a colour means the same in every frame. Compute one range over all the frames, not one per frame.
- **`label`** is required and unique. The slide's `frame` names a frame by it, and the map shows it large while the frames play.
- **`numbers`** is optional: figures for the corner panel, such as a total, with the same keys in every frame. They count from one frame's value to the next as the frames crossfade.
- **Up to 200 frames, all of one size.**

## Writer functions

Two files hold the writers. Copy the one for your language into your project and call it at the end of the code that makes your maps:
- [`maps/stepdeck-map.R`](maps/stepdeck-map.R): `write_stepdeck_grid` needs the `png` and `jsonlite` packages; `write_stepdeck_raster` wraps it for a `terra` `SpatRaster`.
- [`maps/stepdeck_map.py`](maps/stepdeck_map.py): `write_stepdeck_grid` needs only the Python standard library (3.9 or later), so no Pillow and no NumPy, though it takes NumPy arrays; `write_stepdeck_raster` wraps it for rasterio datasets.

Each writes the JSON and its PNGs exactly as above: it rescales the values to the 256 levels with the formulas of the table, writes no data as transparent, adds no colour chunks, and puts a time-lapse's frames in a folder named after the JSON (`years.json`, `years/001.png`, …). Their output passes `validate`, and decodes to exactly the levels the formulas give; the stepdeck repository tests both on every run where R and Python are installed. The `terra` and rasterio wrappers are written to those packages' documented interfaces but are not tested there.

The grid is a matrix (R) or rows of cells (Python: nested lists, or a NumPy array), rows north to south, with `NA` (R) or `None` or `NaN` (Python) for no data. For classes, the cells hold class names, compared as text (a class named `1` matches a cell `1`). A time-lapse is a list of grids of one size, one per frame. `bounds` is `c(west, south, east, north)` or `[west, south, east, north]`.

| Argument | Meaning |
|---|---|
| `value` | What the levels mean. Without it: linear over the data's range, all frames together. `list(scale = "linear", min = 0, max = 800)` / `{"scale": "linear", "min": 0, "max": 800}` fixes the range (a value outside it is written as the nearer end); `scale = "log"` takes a log scale (every value above 0); `classes = c(…)` / `{"classes": […]}` names the classes. `min` and `max` may be left out, and are then the data's; other fields, such as `unit`, are written as given. |
| `labels` | A time-lapse's frame labels, one per frame, unique. In R they default to `names(m)`. |
| `numbers` | A time-lapse's panel figures, one value per frame and key: `list(people = c(…))` or a data frame in R, `{"people": […]}` in Python. |

In R:

```r
source("R/stepdeck-map.R")   # the file you copied into your project

# `density` is a matrix from your model: rows north to south, NA for no data; `bounds` its outer edges
write_stepdeck_grid(density, c(-19, -31, -10, -23), "my-talk/data/density.json",
                    value = list(scale = "linear", min = 0, max = 800, unit = "people per km²"))

# a time-lapse: one matrix per year, one fixed range for all of them, the yearly totals for the panel
years <- lapply(2010:2021, function(year) density_in(year))   # your code
write_stepdeck_grid(years, c(-19, -31, -10, -23), "my-talk/data/years.json",
                    value = list(scale = "linear", min = 0, max = 800),
                    labels = 2010:2021, numbers = list(people = totals))

# a mask: one class name where the class is, NA elsewhere
write_stepdeck_grid(ifelse(near_well, "Near a well", NA), c(-19, -31, -10, -23), "my-talk/data/wells.json",
                    value = list(classes = "Near a well"))

# from terra, one layer per frame (reproject to longitude and latitude first)
r <- terra::project(terra::rast("density.tif"), "EPSG:4326")
write_stepdeck_raster(r, "my-talk/data/density.json")
```

In Python:

```python
from stepdeck_map import write_stepdeck_grid, write_stepdeck_raster   # the file you copied into your project

# `density` is rows of cells from your model (lists or a NumPy array): north to south, None or NaN for no data
write_stepdeck_grid("my-talk/data/density.json", density, [-19, -31, -10, -23],
                    value={"scale": "linear", "min": 0, "max": 800, "unit": "people per km²"})

# a time-lapse: one grid per year, one fixed range for all of them, the yearly totals for the panel
years = [density_in(year) for year in range(2010, 2022)]   # your code
write_stepdeck_grid("my-talk/data/years.json", years, [-19, -31, -10, -23],
                    value={"scale": "linear", "min": 0, "max": 800},
                    labels=[str(year) for year in range(2010, 2022)], numbers={"people": totals})

# from rasterio, every band a frame (in EPSG:4326)
import rasterio
with rasterio.open("density.tif") as ds:
    write_stepdeck_raster("my-talk/data/density.json", ds)
```

The writers check everything before they write anything, and refuse what `validate` would reject: `bounds` that are not a box in degrees (west < east, south < north), frames of different sizes, cells that are not finite numbers (`Inf` is an error, not no data), a log scale over values at or below 0, a range that is not finite or has *min* at or above *max* (a grid of one value needs `value` with both), class names that are empty, repeated or not in the list, labels missing or repeated, `numbers` that are not one finite number per frame. A mistake stops your script with a message that names the cell or argument, and leaves no file behind, never a file that fails later. The R and Python writers give the same message for the same mistake.

## Writing boundaries

The boundaries come from your project, at the admin level your data is at, with the ids your data uses. Before writing them for a slide:

1. **Transform to longitude and latitude**: `sf::st_transform(regions, 4326)`, `regions.to_crs(4326)`.
2. **Keep the id and the name**, and drop the other columns: they only make the file larger.
3. **Simplify.** Analysis boundaries hold far more detail than a slide shows. A slide 1,920 pixels wide never needs more than a few thousand points per region, and usually much fewer. Simplify with a tool that keeps shared borders shared, so neighbouring regions do not open gaps or overlap: `rmapshaper::ms_simplify` in R, or the `mapshaper` command line. `GeoDataFrame.simplify` simplifies each region on its own, so shared borders can drift apart; use it only for regions that do not touch, or with a small tolerance.
4. **Round the coordinates.** Four decimals (about 10 m) are plenty for a slide and make the file several times smaller.

In R, with `sf` and `rmapshaper`:

```r
library(sf)
regions <- st_read("admin1.gpkg") |>
  st_transform(4326) |>
  rmapshaper::ms_simplify(keep = 0.05, keep_shapes = TRUE)   # keep 5% of the points, never drop a region
regions <- regions[, c("code", "name")]                       # the id your data uses, and the name
st_write(regions, "my-talk/data/regions.geojson", layer_options = "COORDINATE_PRECISION=4", delete_dsn = TRUE)
```

In Python, with `geopandas`:

```python
import geopandas as gpd

regions = gpd.read_file("admin1.gpkg").to_crs(4326)
regions["geometry"] = regions.simplify(0.005, preserve_topology=True)   # in degrees; see the note on shared borders
regions[["code", "name", "geometry"]].to_file("my-talk/data/regions.geojson", driver="GeoJSON", COORDINATE_PRECISION=4)
```

Or simplify a GeoJSON your code wrote with the `mapshaper` command line, which keeps shared borders too:

```sh
mapshaper admin1.geojson -simplify 5% keep-shapes -o precision=0.0001 my-talk/data/regions.geojson
```

`COORDINATE_PRECISION` is the GDAL GeoJSON driver's option for decimals; `sf` and `geopandas` pass it through. The winding they write is fine as it is (see [Boundaries](#boundaries-a-geojson-file)). These snippets use the packages' documented options; the stepdeck repository does not run them.

## A project with no boundaries: `stepdeck boundaries`

When a project has no boundaries of its own, `stepdeck boundaries` fetches one country's open admin boundaries from [geoBoundaries](https://www.geoboundaries.org/) into the deck, once, when you author it:

```sh
node cli/index.js boundaries URY ADM1 --deck my-talk
```

It writes `data/ury-adm1.geojson`, already simplified, with coordinates rounded to four decimals, and next to it `data/ury-adm1.source.json`, which keeps the boundary's source and licence. It prints the licence and a source line for the slide. Each region keeps geoBoundaries' properties, `shapeName`, `shapeISO`, `shapeID`, `shapeGroup` and `shapeType`, so the slide names one as its `id` (`id: "shapeISO", name: "shapeName"`) and your code joins its data to the same one. Licences differ from country to country; keep the credit the source line gives. Every option is in the [CLI reference](../reference/cli.md#boundaries).

Use it only when you have nothing better. Boundaries your analysis already uses are the right ones: their ids are the ones your data joins on, and their level and vintage are the ones your numbers describe. This is the only command that needs the network; presenting never does.

## The slide

The slide names the files and says what each step shows. This one opens on the bare regions, colours them by rate, zooms into one region in an inset, swaps the rates for a population surface, and then flies to that region and plays the surface through its years there:

```js
export default {
  id: "where",
  layout: "full-bleed",
  title: "Where people live",
  elements: [
    { id: "map", region: "main", type: "map",
      props: { boundaries: "data/regions.geojson", id: "code", name: "name",
               layers: {
                 rate: { areas: "data/rates.csv", value: "rate", label: "Cases per 1,000", classes: [5, 10, 15], types: { code: "string" } },
                 density: { raster: "data/density.json", label: "People per km²" },
                 years: { raster: "data/years.json", label: "People per km²" },
               },
               numbers: [{ key: "people", label: "People", format: ",.0f" }] } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "regions" },
    { id: "rates", set: { map: { shown: ["rate"] } } },
    { id: "zoom", set: { map: { inset: { view: "W4" } } } },
    { id: "density", set: { map: { shown: ["density"], inset: null } } },
    { id: "years", set: { map: { shown: ["years"], view: "W4", frame: "2021" } } },
  ],
};
```

- The `rate` layer joins `data/rates.csv` to the regions by `code` (the map's `id`), as text.
- `inset: { view: "W4" }` shows region `W4` close up in a corner, with a box where it is on the map and two leader lines.
- The last step plays in two phases: first the time-lapse comes in at its first frame while the map flies to `W4`, then the frames run to `2021`, one every 700 ms, while the panel counts `people`.
- A map is a figure, so the slide has a `role: "source"` line. For boundaries from `stepdeck boundaries`, use the source line it printed.

The props, the steps a map understands and what each change looks like are in the [`map` reference](../reference/components/map.md). The gallery's map slides draw on the same kind of files, made by a seeded script for a fictional country, in [`site/gallery/data/map/`](../../site/gallery/data/map/).

## Checking

Run the checks after every run of your code, as after every edit of the slide:

```sh
node cli/index.js validate my-talk --slide where
node cli/index.js check my-talk --slide where --played
```

`validate` runs in Node, in about a second. For a map it checks, at every step: the props against the schema; that every file the props name exists; that `shown` names layers that exist (`map-layer`); every raster file and every PNG it names against the format above (`map-raster`); that `frame` is a label of the time-lapse and that its layers agree (`map-frame`); that a run fits in 20 s (`map-run`); and that the columns a layer names are in its CSV (`missing-column`). It warns about `frame` or `pace` without a time-lapse, and a `numbers` key no frame has (`map-prop-unused`). It does not draw the map, so it does not join the CSV to the regions.

`check` draws every step in headless Chrome, which is where the join happens: a key that matches no region, an id in `highlight`, `labels` or `view` that is not a region, and boundaries over the limits fail the element, and `check` reports them as `render-error`. `check --played` also plays every step forward and compares it with a jump to the same step, canvas pixels included.

When something fails, the message says which side to fix:

| Message | Fix it in |
|---|---|
| `data/rates.csv: key '7' matches no region`, where the file says `07` | The slide: the CSV loader read the codes as numbers. Declare the key column as text, `types: { code: "string" }`. |
| `data/rates.csv: key '07' matches no region` | Your code: the boundaries have no region `07`. Write the ids the boundaries have. |
| `data/rates.csv: key 'N1' appears twice` | Your code: one row per region. |
| `data/regions.geojson: region 'N1' appears twice` | Your code: one feature per region (dissolve the parts into a MultiPolygon). |
| `data/regions.geojson: 6,000 regions is more than 5,000`, `… points is more than 250,000` | Your code: simplify, or map a coarser level. |
| `map-raster`: `data/density.png: color type 2 is not 0 (grey) or 4 (grey with alpha)` | Your code: write the raster with a writer function. |
| `map-frame`: `frame '1999' not found (frames: 2010, 2011, …)` | The slide: use a label the file has. |
| `map-layer`, `map-run`, `region 'Nowhere' not found` | The slide: the layer ids, the `pace` or the split of a run, the ids in `highlight`, `labels` and `view`. |

Every rule is in [Rules](../reference/rules.md), and every map error in the [`map` reference](../reference/components/map.md#errors).

## See also

- [`map`](../reference/components/map.md): every prop, layer key, motion and error.
- [CLI: `boundaries`](../reference/cli.md#boundaries): fetching open boundaries into a deck.
- [Data and bindings](data-and-bindings.md): data files, paths and CSV column types.
- [Checking a deck](checking-a-deck.md): `validate`, `check`, `shoot` and `dump`.
- [Writing a custom component](custom-components.md#build-a-map-from-the-engines-pieces): a map of your own from the engine's pieces.
