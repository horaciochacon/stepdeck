# chart.bar

`chart.bar` draws one bar per category from a CSV file, horizontal or vertical, with the value written at the end of each bar and an optional interval whisker. It is built for step-by-step reveals: the value axis stays put, categories can appear one at a time, and switching `y` shrinks or grows the bars. This page lists every prop and default, what each change does on a forward step, how the chart is laid out, the markup it renders and the errors it raises. It is for anyone writing chart slides by hand or reviewing what an agent wrote.

Sources: [`components/chart.bar/schema.json`](../../../components/chart.bar/schema.json), [`components/chart.bar/index.js`](../../../components/chart.bar/index.js), [`core/chart.js`](../../../core/chart.js), [`core/stepdeck.css`](../../../core/stepdeck.css). For the other components, see the [components reference](index.md).

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
| `shown` | string[] | every category | draw | Categories to show, by name. A category that appears grows from zero, then its whisker draws. Hidden categories keep their band. |
| `highlight` | string | none | fade | One category to emphasize. The other bars and their value labels change color to muted theme colors. |
| `domain` | `[min, max]` | from the data | tween | Fixed value axis, used exactly as given (not rounded). See [The value axis](#the-value-axis). |
| `types` | `{ column: "string" \| "number" \| "date" }` | guessed | snap | CSV column types for the data loader. An undeclared column is a number only when every non-empty value looks like one. |

The transition column is the schema's `x-transition` annotation. It feeds the catalog; the motion itself is written in `index.js` and described in [Motion](#motion).

## Data: one row per category

Each category must appear in exactly one row. A second row with the same category fails the element (see [Errors](#errors)). Rows whose category cell is empty are ignored.

A row whose `y` cell is empty or not a number gets a bar of length zero, no value label and no whisker. A whisker is drawn only when the row has a value and both interval bounds.

Keep the values you want to compare in one unit, in separate columns of the same file, and switch `y` between them. That is how `speed.js` shows weeks shrinking to days: both columns are in days.

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

Every animated change runs as a single `ctx.animate.tween` that lasts twice the theme's `--sd-duration` (800 ms in academic-light), or the step's `transition.duration` when it is set. Everything that changed moves in that one tween:

| Change | What you see |
| --- | --- |
| `y` changes | Every bar, whisker and value label tweens to its new length. |
| A category enters `shown` | The bar grows from zero over the first 60% of the motion, then the whisker draws out of the bar's end over the remaining 40%. The value label follows the bar's end and its opacity rises with the growth. |
| A category leaves `shown` | The reverse: the whisker retracts into the bar's end over the first 40%, then the bar shrinks to zero over the remaining 60% while its label fades. The category is then hidden. |
| `highlight` set, changed or cleared | The bar fill and value label color interpolate between the normal and muted colors. |
| `domain` changes, or the default axis changes with `y` or `interval` | The axis range tweens. Ticks that stay move with it; new ticks fade in and dropped ticks fade out. |
| Plot size or margins change (for example an axis title is added) | The plot area tweens to its new size. |
| The element becomes visible | Every shown category grows from zero, then draws its whisker. |

Hidden categories keep their band. Bands follow the data order whether or not a category is shown. A hidden category is laid out at its final length and hidden with `visibility`, together with its whisker, value label and category label, so nothing reflows when it appears.

`highlight` changes color, not opacity, so value labels keep their contrast. The value labels do use an `opacity` attribute, but only while a category grows in or out.

No motion plays, and the new state is drawn at once, when:

- `orient` changes, or
- the set or order of categories changes (for example `data` or `x` points at different rows).

Adding `interval` to bars that are already shown makes the whiskers appear at full size at once; only entering categories draw their whisker.

An aborted step (you press next again before the motion ends) snaps to its end state. Every update ends by writing the target state from the props and rows alone, and the component writes attributes only, never inline styles. So the markup after a played step equals the markup after jumping to it, which is what `check --played` compares.

## Layout

| Aspect | Rule |
| --- | --- |
| Bar thickness | 65% of the band, capped at 4 times the label font size (`--sd-font-size-label`, 28px in academic-light, so at most 112px). |
| Bar color | The first color of the categorical palette (blue `#1d4ed8` in `modern`, the default; `#0072b2` in academic-light's `okabe-ito-dark`). If the theme has no categorical palette, `--sd-color-accent`. |
| Dimmed bar color | `--sd-color-rule`; dimmed value labels use `--sd-color-muted`. |
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

The chart reads its width and height from its element box at every update, so the element must be given a height by the layout. This is the same requirement as [`chart.line`](chart-line.md).

A chart fills its region only when it is the only element in a region whose layout has an only-child fill rule:

| Layout | Region where a lone chart fills |
| --- | --- |
| `figure-notes` | `main` |
| `halves` | `left`, `right` |
| `title` | `figure` |
| `full-bleed`, `statement` | none |

Anywhere else the chart gets the browser's default SVG height and renders 150px tall. Measured with `dump` on a scratch deck:

```text
speed · step 0 (before)                 (figure-notes, chart alone in main)
  visible  bars    chart.bar  96,218 1096×754  ...
squash · step 0 (a)                     (full-bleed, chart alone in main)
  visible  bars    chart.bar  96,194 1728×150  ...
```

Neither `validate` nor `check` reports a squashed chart. Look at `dump` boxes or `shoot` images. Put the source line in the `footer` region, not next to the chart, or the chart is no longer an only child. See [Layouts](../layouts.md).

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

The file errors from the data loader also apply, such as `data file not found: <path>`. See [Data and bindings](../../guide/data-and-bindings.md).

`validate` catches only some of these before you open the deck. It checks that `x`, `y` and the `interval` columns exist in the CSV header, at every step (rule `missing-column`, with a did-you-mean fix):

```text
squash/bars · missing-column · y = 'agent_day' vs columns of data/speed.csv: task, before_days, agent_days · set y to 'agent_days'
```

It does not check `domain` order, duplicate categories, or names in `shown` and `highlight`. Those appear only at render time, at the step where they first occur. Run `check` (or `dump`) to see them:

```text
squash/bars: category 'Nope' in `highlight` not found in data/speed.csv (categories: Clean the data, Write the report)
squash/bars: `domain` must be [min, max] with min < max
```

`chart.bar` is a figure, so its slide also needs an element with `role: "source"` or `validate` reports `figure-source`. See [Rules](../rules.md).

## Gotchas

**A chart next to another element is 150px tall.** See [Sizing](#sizing-give-the-chart-a-region-that-fills).

**Switching `y` without `domain` can hide the change.** The default axis rescales to the new column, so set `domain` when the point of the step is that bars got shorter or longer.

**Changing `orient`, `data` or `x` between steps does not animate.** The new chart is drawn at once.

**`highlight` set with `set` lasts.** It folds into every later step. Use `only` for a one-step emphasis, and clear it with `highlight: null` in `set` if you did use `set`.

**`chart.bar` is stricter than `chart.line`.** An unknown name in `shown` or `highlight` is an element error here; `chart.line` silently ignores unknown names in `series_shown` and dims every series for an unknown `highlight`.

## For agents

The agent-facing summary of this component is in [`skill/references/components.md`](../../../skill/references/components.md). `node cli/index.js catalog chart.bar` prints the same props from the schema.
