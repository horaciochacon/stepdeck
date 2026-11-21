# chart.bar

`chart.bar` draws one bar per category from a CSV file, horizontal or vertical, with the value written at the end of each bar and an optional interval whisker. It is built for step-by-step reveals: the value axis stays put, categories can appear one at a time, and switching `y` shrinks or grows the bars. This page lists every prop and default, what each change does on a forward step, how the chart is laid out, the markup it renders and the errors it raises. It is for anyone writing chart slides by hand or reviewing what an agent wrote.

Sources: [`components/chart.bar/schema.json`](../../../engine/components/chart.bar/schema.json), [`components/chart.bar/index.js`](../../../engine/components/chart.bar/index.js), [`core/chart.js`](../../../engine/core/chart.js), [`core/stepdeck.css`](../../../engine/core/stepdeck.css). For the other components, see the [components reference](index.md).

## Use it

Two slides from the kit example deck (`examples/kit`). Both use the `figure-notes` layout, put the chart alone in `main` and the source line in `footer`.

Bars that shrink when `y` switches columns, with a fixed `domain` so the shrink is visible (`examples/kit/slides/speed.js`):

```js
{ id: "bars", region: "main", type: "chart.bar",
  props: { data: "data/speed.csv", x: "task", y: "before_days", domain: [0, 30], format: { y: ",.0f" },
           axes: { y: "Days, before" } } },
// ...
steps: [
  { id: "before" },
  { id: "agent", set: { bars: { y: "agent_days", axes: { y: "Days, with an agent" } } } },
],
```

```text
task,before_days,agent_days
Clean the data,25,3
Write the report,18,3
```

Estimates with a 95% interval, revealed one category at a time (`examples/kit/slides/estimate.js`):

```js
{ id: "bars", region: "main", type: "chart.bar",
  props: { data: "data/estimate.csv", x: "group", y: "per100", interval: { lower: "low", upper: "high" },
           shown: ["Less exposed"], format: { y: ",.1f" }, axes: { y: "Cases per 100" } } },
// ...
steps: [
  { id: "one" },
  { id: "both", set: { bars: { shown: ["Less exposed", "More exposed"] } } },
],
```

```text
group,per100,low,high
Less exposed,8.5,6.9,10.1
More exposed,16,13.9,18.1
```

To emphasize one bar for a single step, set `highlight` in the step's `only`, so it does not carry over to later steps:

```js
{ id: "focus", only: { bars: { highlight: "Clean the data" } } }
```

## Props

`data`, `x` and `y` are required. The schema has `additionalProperties: false`, so any other prop is a `validate` error (`unknown-prop`).

| Prop | Type | Default | Transition | Meaning |
| --- | --- | --- | --- | --- |
| `data` | string | (required) | snap | Path to a CSV file, relative to the deck root. One row per category. |
| `x` | string | (required) | snap | Column holding the category of each row. Its text labels the band. Rows with an empty category are skipped. |
| `y` | string | (required) | tween | Column holding the numeric value of each bar. A change tweens every bar to its new length. |
| `interval` | `{ lower, upper }` | none | tween | Columns of a whisker at each bar's end, for example an uncertainty interval. Both keys are required. The whisker is drawn after its bar and moves with it. |
| `format` | `{ x?, y? }` | see [Labels](#labels-and-formats) | snap | d3-format specs, localized by the deck language. `y` formats value labels, ticks and the interval text in each bar's title. `x` formats category labels, and applies only when the category value is a number (for example years). |
| `axes` | `{ x?, y? }` | none | snap | Axis titles. `x` names the category axis and `y` the value axis, whichever way the bars point. |
| `orient` | `"horizontal"` \| `"vertical"` | `"horizontal"` | snap | `horizontal`: categories down the left, bars point right. `vertical`: categories along the bottom, bars point up. |
| `sort` | `"none"` \| `"value"` \| `"-value"` \| `{ by, order? }` \| string[] | `"none"` | tween | Order of the bars. See [Sorting](#sorting). |
| `shown` | string[] | every category | draw | Categories to show, by name. A category that appears grows from zero, then its whisker draws. Hidden categories keep their band. |
| `highlight` | string | none | fade | One category to emphasize. The other bars turn the theme's dim color (`--sd-color-dim`) and their value labels the muted color; the emphasized bar is drawn after (above) the others. |
| `domain` | `[min, max]` | from the data | tween | Fixed value axis, used exactly as given (not rounded). See [The value axis](#the-value-axis). |
| `types` | `{ column: "string" \| "number" \| "date" }` | guessed | snap | CSV column types for the data loader. An undeclared column is a number only when every non-empty value looks like one. |

The transition column is the schema's `x-transition` annotation. It feeds the catalog; the motion itself is written in `index.js` and described in [Motion](#motion).

## Data: one row per category

Each category must appear in exactly one row. A second row with the same category fails the element (see [Errors](#errors)). Rows whose category cell is empty are ignored.

A row whose `y` cell is empty or not a number gets a bar of length zero, no value label and no whisker. A whisker is drawn only when the row has a value and both interval bounds.

Keep the values you want to compare in one unit, in separate columns of the same file, and switch `y` between them. That is how `speed.js` shows weeks shrinking to days: both columns are in days.

## Sorting

`sort` decides the order of the bands. Every category is ranked, shown or not, so a bar that `shown` hides keeps its place in the order and appears there.

| `sort` | Order |
| --- | --- |
| `"none"`, or omitted | The data order. |
| `"value"` | By `y`, lowest first. |
| `"-value"` | By `y`, highest first. |
| `{ by: "<column>", order: "asc" \| "desc" }` | By another column of the CSV, ascending unless `order` is `"desc"`. A text column compares by code point. |
| `["North", "South"]` | Those categories first, in that order, then the rest in data order. |

Ties keep the data order. A row with no value (an empty cell, which draws a bar of length zero and no label) comes last whichever way the order runs. Sorting changes the order and nothing else: the value axis, the margins and every bar's value are the same.

```js
{ id: "bars", region: "main", type: "chart.bar",
  props: { data: "data/values.csv", x: "group", y: "score" } },
// ...
steps: [
  { id: "data" },
  { id: "ranked", set: { bars: { sort: "-value" } } },
],
```

On a played step, a change of `sort` slides every bar, with its category label, whisker and value label, from its old band to its new one in one motion. A bar that appears on the same step is already in its final band while it grows, and the others slide to make room. `sort` and `y` can change together: the bars change length while they change places.

The errors are the ranking's own. An unknown column fails the element with `sort column '<c>' not found (columns: a, b, …)`, an unknown category in a list with ``category '<k>' in `sort` not found (categories: …)``, and any other form with `` `sort` must be "none", "value", "-value", { by, order } or a list of categories``.

## The value axis

With `domain`, the axis is exactly `[min, max]`. Without it, the axis spans:

```text
[ min(0, every value), max(0, every value) ]
```

over every row of the data, shown or not, counting the current `y` column and, when `interval` is set, both interval columns. Zero is always included. The range is then rounded outward to tick values (d3 `nice` with about 5 ticks). If every value is zero (or there are no numeric values), the range becomes [0, 1] before rounding.

The axis does not depend on `shown`, so it never moves while categories appear. It moves only when `y`, `interval`, `domain` or the data values change (for example `data` or `types` pointing at the same categories with other values), and then it tweens. If `y` changes between steps and you want the change in length to stay visible, set `domain`: otherwise the axis rescales to the new column and the bars may look the same length.

The value axis has about 5 ticks with grid lines, plus a baseline at zero.

## Motion

The engine animates only a forward move of exactly one step, in a live presentation with motion on. A jump, a backward move, the first render and capture mode (used by `shoot` and `check`) draw the target state directly. See [Animation and motion](../../guide/animation-and-motion.md).

Every animated change runs as a single `ctx.animate.tween` that lasts twice the theme's `--sd-duration` (800 ms in both built-in themes), or the step's `transition.duration` when it is set, with the theme's `--sd-easing`. Everything that changed moves in that one tween, except colors: a `highlight` change tweens the bar fill and label colors in their own tween over `--sd-duration-fast` (or the step's `transition.duration`), beside the geometry:

| Change | What you see |
| --- | --- |
| `y` changes | Every bar, whisker and value label tweens to its new length. |
| `sort` changes | Every bar, with its category label, whisker and value label, slides from its old band to its new one, in the same motion. |
| A category enters `shown` | The bar grows from zero over the first 60% of the motion, then the whisker draws out of the bar's end over the remaining 40%. The value label follows the bar's end and its opacity rises with the growth. |
| A category leaves `shown` | The reverse: the whisker retracts into the bar's end over the first 40%, then the bar shrinks to zero over the remaining 60% while its label fades. The category is then hidden. |
| `highlight` set, changed or cleared | The bar fill and value label color interpolate in RGB over `--sd-duration-fast`. |
| `domain` changes, or the default axis changes with `y` or `interval` | The axis range tweens. Ticks that stay move with it; new ticks fade in and dropped ticks fade out. |
| Plot size or margins change (for example an axis title is added) | The plot area tweens to its new size. |
| The element becomes visible | Its own entrance (`"x-enter": "own"`): in the element's stagger slot, every shown category grows from zero, then draws its whisker, while the box stays still (over the element's own `enter.duration` when set). The bars are at zero the moment the chart shows. With `enter: "fade"`, `"rise"`, `"wipe"` or `"pop"` the box moves instead and the bars are at full length at once; with `enter: "none"` nothing moves. |

Hidden categories keep their band. Bands follow the [sorted](#sorting) order (the data order without `sort`) whether or not a category is shown. A hidden category is laid out at its final length and hidden with `visibility`, together with its whisker, value label and category label, so nothing reflows when it appears.

`highlight` changes color, not opacity, so value labels keep their contrast. The value labels do use an `opacity` attribute, but only while a category grows in or out.

No motion plays, and the new state is drawn at once, when:

- `orient` changes, or
- the set of categories changes (for example `data` or `x` points at different rows). A different order of the same categories, from `sort`, slides.

The element's own entrance still grows every bar from zero.

Adding `interval` to bars that are already shown makes the whiskers appear at full size at once; only entering categories draw their whisker.

An aborted step (you press next again before the motion ends) snaps to its end state. Every update ends by writing the target state from the props and rows alone, and the component writes attributes only, never inline styles. So the markup after a played step equals the markup after jumping to it, which is what `check --played` compares.

## Layout

| Aspect | Rule |
| --- | --- |
| Bar thickness | 65% of the band, capped at 4 times the label font size (`--sd-font-size-label`, 28px in academic-light, so at most 112px). |
| Bar color | The first color of the categorical palette (blue `#1d4ed8` in `modern`, the default; `#0072b2` in academic-light's `okabe-ito-dark`). If the theme has no categorical palette, `--sd-color-accent`. |
| Dimmed bar color | `--sd-color-dim` (`--sd-color-rule` in a theme without it); dimmed value labels use `--sd-color-muted`. |
| Value labels | Past the bar's end, or past the whisker's end when there is one. On the right of a horizontal bar, above a vertical bar; on the other side for negative values. Weight 600, ink color. |
| Category labels | On the band axis, in ink. Long names wrap. Horizontal: up to about a third of the chart width per line, and as many lines as fit the band. Vertical: the band width, up to 3 lines. A label that does not fit ends with `…`. |
| Ticks and axis titles | Ticks in muted, axis titles in ink. All chart text uses `--sd-font-size-label`, which is at least `--sd-min-audience-font`. |
| Margins | Computed from character counts, not measured text, so they do not depend on font loading. The room kept for value labels comes from the widest formatted value over every numeric column except the category (and the domain ends), not only the current `y`, so switching `y` does not resize the plot. |
| Accessibility | Each bar group has a `<title>` with the category, its value and the interval, formatted like the labels: `Less exposed: 8.5 (6.9 – 10.1)`. A Spanish deck reads `8,5 (6,9 – 10,1)`. |

## Labels and formats

| What | With `format` | Without |
| --- | --- | --- |
| Value labels at the bar ends | `format.y` | The value as precise as the data (d3 format `,~r`). |
| Tick labels | `format.y` | A fixed number of decimals from the tick step, so ticks of 5 show `0 5 10`, ticks of 2.5 show `0.0 2.5 5.0`. |
| Interval text in `<title>` | `format.y` | Same as value labels. |
| Category labels | `format.x`, only when the category is a number | The category text as it is. |

Formats are localized by the deck language: in an `es` deck the decimal separator is a comma and the thousands separator a dot.

## Sizing: give the chart a region that fills

The chart reads its width and height from its element box at every update. It takes the height the other elements in its region leave (`core/stepdeck.css` gives it `flex: 1 1 0`), so a source line can share the region. This is the same as [`chart.line`](chart-line.md). A region with no set height, such as `statement` `main`, gives it none. Measured with `dump` on a scratch deck:

```text
speed · step 0 (before)                 (figure-notes, chart alone in main)
  visible  bars    chart.bar  96,218 1096×754  ...
wide · step 0 (a)                       (full-bleed, chart alone in main)
  visible  bars    chart.bar  96,194 1728×790  ...
```

Neither `validate` nor `check` reports a collapsed chart. Look at `dump` boxes or `shoot` images. See the [Fill rules](../layouts.md#fill-rules) table.

## Markup

Inside its element wrapper (`div.sd-el[data-el][data-type="chart.bar"]`) the component renders one SVG:

```text
svg.sd-chart-bar[data-orient="horizontal|vertical"]
  g.sd-plot
    g.sd-axis.sd-axis-value
      g.tick > line.sd-grid-line, text
    g.sd-axis.sd-axis-band
      text.sd-band-label[data-key][data-visible] > tspan (one per wrapped line)
    g.sd-bars
      g.sd-bar-group[data-key][data-visible][data-dim]
        title
        rect.sd-bar
        text.sd-bar-label
        g.sd-whisker > line.sd-whisker-line, line.sd-whisker-cap.sd-whisker-cap-lower, line.sd-whisker-cap.sd-whisker-cap-upper
    line.sd-axis-line
  text.sd-axis-title.sd-axis-title-band
  text.sd-axis-title.sd-axis-title-value
```

| Selector | Meaning |
| --- | --- |
| `svg.sd-chart-bar[data-orient]` | The chart; `data-orient` is `horizontal` or `vertical`. |
| `g.sd-bar-group[data-key]` | One category. `data-key` is the category text. |
| `[data-visible="true\|false"]` | Whether the category is shown. `core/stepdeck.css` hides `false` groups and band labels with `visibility: hidden`. |
| `[data-dim="true\|false"]` | `true` when a `highlight` is set and this is not the highlighted category. |
| `rect.sd-bar` | The bar. Its `fill` attribute is the palette color, or the dimmed color. |
| `g.sd-whisker` | Present only for a bar with a value and both interval bounds. |
| `text.sd-bar-label` | The value label. |
| `text.sd-band-label[data-key]` | The category label on the band axis. |

Restyle one slide with slide `style` and these classes. Colors are written as `fill` attributes, so to override a bar color use a CSS `fill` rule, which takes precedence over the attribute.

## Errors

Each of these fails the element. The message is recorded as `<slide>/<element>: <message>` in `STEPDECK.errors`, shown on the canvas in the element's box, reported by `check` as `render-error` and listed in `dump` output. A failed element gets no further updates.

| Message | Cause |
| --- | --- |
| ``chart.bar needs a `data` path`` | `data` is missing or empty. |
| `<data> is not a table (use a .csv file)` | `data` points at a file that does not load as a list of rows, for example a JSON object or a .geojson file. |
| ``chart.bar needs `<prop>` (a column name)`` | `x` or `y` is missing or not a non-empty string, or `interval.lower` / `interval.upper` is set but empty or not a string. A missing interval key is reported by `validate` (schema); at render time the whisker is just left out. |
| `column '<c>' not found in <data> (columns: a, b, …)` | A column named by `x`, `y` or `interval` is not in the CSV header. |
| ``\`domain\` must be [min, max] with min < max`` | `domain` is not two finite numbers in increasing order. |
| `category '<k>' appears more than once in <data> (chart.bar needs one row per category)` | Two rows share a category. |
| ``category '<id>' in `shown` not found in <data> (categories: …)`` | `shown` names a category the data does not have. |
| ``category '<id>' in `highlight` not found in <data> (categories: …)`` | `highlight` names a category the data does not have. |
| `sort column '<c>' not found (columns: a, b, …)` | `sort: { by }` names a column the CSV does not have. |
| ``category '<k>' in `sort` not found (categories: …)`` | A `sort` list names a category the data does not have. |
| `` `sort` must be "none", "value", "-value", { by, order } or a list of categories`` | `sort` is none of those forms. |

The file errors from the data loader also apply, such as `data file not found: <path>`. See [Data and bindings](../../guide/data-and-bindings.md).

`validate` catches only some of these before you open the deck. It checks that `x`, `y` and the `interval` columns exist in the CSV header, at every step (rule `missing-column`, with a did-you-mean fix):

```text
squash/bars · missing-column · y = 'agent_day' vs columns of data/speed.csv: task, before_days, agent_days · set y to 'agent_days'
```

It does not check `domain` order, `sort`, duplicate categories, or names in `shown` and `highlight`. Those appear only at render time, at the step where they first occur. Run `check` (or `dump`) to see them:

```text
squash/bars: category 'Nope' in `highlight` not found in data/speed.csv (categories: Clean the data, Write the report)
squash/bars: `domain` must be [min, max] with min < max
```

`chart.bar` is a figure, so its slide also needs an element with `role: "source"` or `validate` reports `figure-source`. See [Rules](../rules.md).

## Gotchas

**A chart in `statement` main has no height.** See [Sizing](#sizing-give-the-chart-a-region-that-fills).

**Switching `y` without `domain` can hide the change.** The default axis rescales to the new column, so set `domain` when the point of the step is that bars got shorter or longer.

**Changing `orient`, `data` or `x` between steps does not animate.** The new chart is drawn at once.

**`highlight` set with `set` lasts.** It folds into every later step. Use `only` for a one-step emphasis, and clear it with `highlight: null` in `set` if you did use `set`.

**`chart.bar` is stricter than `chart.line`.** An unknown name in `shown` or `highlight` is an element error here; `chart.line` silently ignores unknown names in `series_shown` and dims every series for an unknown `highlight`.

## For agents

The agent-facing summary of this component is in [`skill/references/components.md`](../../../skill/references/components.md). `node cli/index.js catalog chart.bar` prints the same props from the schema.
