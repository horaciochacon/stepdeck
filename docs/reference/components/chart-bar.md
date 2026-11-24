# chart.bar

`chart.bar` draws one bar per category from a CSV file, horizontal or vertical, with the value written at the end of each bar and an optional interval whisker. It is built for step-by-step reveals: the value axis stays put, categories can appear one at a time, and switching `y` shrinks or grows the bars. With `mode: "waterfall"` the same rows become contributions that add up to a running total, and with `mode: "back-to-back"` two groups' bars extend left and right of a centre rule, as in a population pyramid. This page lists every prop and default, what each change does on a forward step, how the chart is laid out, the markup it renders and the errors it raises. It is for anyone writing chart slides by hand or reviewing what an agent wrote.

Source code (for contributors; deck authors do not need it): [`components/chart.bar/schema.json`](../../../engine/components/chart.bar/schema.json), [`components/chart.bar/index.js`](../../../engine/components/chart.bar/index.js), [`components/chart.bar/modes.js`](../../../engine/components/chart.bar/modes.js), [`components/chart.bar/paint-modes.js`](../../../engine/components/chart.bar/paint-modes.js), [`core/chart.js`](../../../engine/core/chart.js), [`core/stepdeck.css`](../../../engine/core/stepdeck.css). For the other components, see the [components reference](index.md).

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
| `data` | string | (required) | tween | Path to a CSV file, relative to the deck root. One row per category; with `mode: "back-to-back"`, one row per category and group. A change to another file with the same categories tweens the bars like a change of `y` (bars keyed by category); with other categories it snaps. A `.json` file that holds an array of row objects loads too, but `validate` checks column names only in `.csv` files. |
| `x` | string | (required) | snap | Column holding the category of each row. Its text labels the band. Rows with an empty category are skipped. |
| `y` | string | (required) | tween | Column holding the numeric value of each bar. A change tweens every bar to its new length. |
| `interval` | `{ lower, upper }` | none | tween | Columns of a whisker at each bar's end, for example an uncertainty interval. Both keys are required. The whisker is drawn after its bar and moves with it. |
| `format` | `{ x?, y? }` | see [Labels](#labels-and-formats) | snap | d3-format specs, localized by the deck language. `y` formats value labels, ticks and the interval text in each bar's title. `x` formats category labels, and applies only when the category value is a number (for example years). |
| `axes` | `{ x?, y? }` | none | snap | Axis titles. `x` names the category axis and `y` the value axis, whichever way the bars point. |
| `orient` | `"horizontal"` \| `"vertical"` | `"horizontal"` | snap | `horizontal`: categories down the left, bars point right. `vertical`: categories along the bottom, bars point up. |
| `sort` | `"none"` \| `"value"` \| `"-value"` \| `{ by, order? }` \| string[] | `"none"` | tween | Order of the bars. See [Sorting](#sorting). |
| `mode` | `"bars"` \| `"waterfall"` \| `"back-to-back"` | `"bars"` | tween | `bars`: every bar stands on zero. `waterfall`: the bars are contributions that stack into a running total over the shown bars. See [Waterfall](#waterfall). `back-to-back`: two groups' bars left and right of a centre rule, horizontal only. See [Back-to-back](#back-to-back). |
| `total` | boolean \| string | `false` | fade | Waterfall only. A last bar from zero to the sum of the shown bars, labelled `Total` (`true`) or with the string; `false` (or no `total`) adds none. |
| `invert` | boolean | `false` | fade | Waterfall only. Swaps the colours of increases and decreases. |
| `group` | string | none | snap | Back-to-back only. The column naming each row's group: exactly two values, and one row per category and group. |
| `groups` | `[left, right]` | data order | snap | Back-to-back only. The two values of `group`, the left side first. |
| `shown` | string[] | every category | draw | Categories to show, by name. A category that appears grows from zero, then its whisker draws. Hidden categories keep their band. |
| `highlight` | string | none | fade | One category to emphasize. The other bars turn the theme's dim color (`--sd-color-dim`) and their value labels the muted color; the emphasized bar is drawn after (above) the others. In back-to-back it may name a group instead. |
| `domain` | `[min, max]` | from the data | tween | Fixed value axis, used exactly as given (not rounded). See [The value axis](#the-value-axis). In back-to-back each side runs from zero to the larger magnitude of the two. |
| `types` | `{ column: "string" \| "number" \| "date" }` | guessed | snap | CSV column types for the data loader. An undeclared column is a number only when every non-empty value looks like one. |

The transition column is the schema's `x-transition` annotation. It feeds the catalog; the motion itself is written in `index.js` and described in [Motion](#motion).

## Data: one row per category

In `bars` and `waterfall` each category must appear in exactly one row. A second row with the same category fails the element (see [Errors](#errors)). Rows whose category cell is empty are ignored. A back-to-back chart has two rows for each category, one per group: see [Back-to-back](#back-to-back).

A row whose `y` cell is empty or not a number gets a bar of length zero, no value label and no whisker. A whisker is drawn only when the row has a value and both interval bounds.

Keep the values you want to compare in one unit, in separate columns of the same file, and switch `y` between them. That is how `speed.js` shows weeks shrinking to days: both columns are in days.

## Sorting

`sort` decides the order of the bands. Every category is ranked, shown or not, so a bar that `shown` hides keeps its place in the order and appears there.

| `sort` | Order |
| --- | --- |
| `"none"`, or omitted | The data order. |
| `"value"` | By `y`, lowest first. |
| `"-value"` | By `y`, highest first. |
| `{ by: "<column>", order: "asc" \| "desc" }` | By another column of the CSV, ascending unless `order` is `"desc"`. A column with a number in any cell sorts by number, and its other cells (blank, `NA`) come last both ways; any other column is text, compared by code point. |
| `["North", "South"]` | Those categories first, in that order, then the rest in data order. |

Ties keep the data order. A row with no value (an empty or blank cell, which draws a bar of length zero and no label) comes last whichever way the order runs. Sorting changes the order and nothing else: the value axis, the margins and every bar's value are the same.

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

## Waterfall

With `mode: "waterfall"` the rows, in display order (after [`sort`](#sorting)), are contributions, and `y` may be negative. Each bar runs from the running total before it to the running total after it. A bridge from an opening level to a closing one, such as a budget or a population change:

```js
{ id: "bars", region: "main", type: "chart.bar",
  props: { data: "data/flow.csv", x: "item", y: "change", mode: "waterfall", total: true,
           shown: ["Opening", "Prices", "Costs", "Taxes", "Other"], format: { y: ",.0f" } } },
// ...
steps: [
  { id: "start" },
  { id: "growth", set: { bars: { shown: null } } },
],
```

```text
item,change
Opening,40
Growth,12
Prices,6
Costs,-15
Taxes,-7
Other,3
```

| Rule | What it means |
| --- | --- |
| Shown bars only | The running total counts the shown bars. A hidden category keeps its band but adds nothing: it is a point on the running total of its slot, hidden. So the bars and the total always add up what is on screen. At `growth` above, `Growth` appears between `Opening` and `Prices`, and every later base moves up by 12. |
| Connectors | A dotted, quiet line (`line.sd-connector`) joins each shown bar's end to the next shown bar, and the last one to the total. |
| `total` | `true` adds a last bar from zero to the sum, in `--sd-color-ink`, labelled with the engine string `total` (`Total` in English and Spanish). A string labels it with that text. `false`, the default, adds none. The total's band is kept on every step of a slide that shows a total at some step, so it fades in and out without moving the other bars. |
| Colours | Increases take the diverging palette's `high` role colour and decreases its `low` role colour (red for increases and blue for decreases in both built-in themes); a palette without roles gives its last and first colours. `invert: true` swaps them, for a chart where a reduction is the good news. `highlight` dims the other bars and the total. |
| Value labels | Signed: `+12`, `−15`, through `format.y` with a `+` sign (unless the spec names its own sign). The total's label is not signed. Each label goes past its bar's end, else inside the bar against its end, else past its start, whichever fits first (`fit` in `core/chart.js`). The side is chosen at rest and kept through a motion. A waterfall keeps a label's room on both sides of the plot (left and right of a horizontal chart, above and below a vertical one, with the band labels set back by it), so within its axis every label fits past its bar's end, outside the bar. Only a fixed `domain` that cuts bars off can push a label inside. |
| `interval` | Each contribution's whisker sits on its running total, from start + lower to start + upper, so it brackets the bar's end. |
| Value axis | Without `domain`, the axis covers every running total, the total and every whisker of **every waterfall step of the slide**, each step with its own `y`, `sort`, `shown` and `total` (read from `ctx.stepProps`; steps that read another file do not count), plus zero, rounded outward to tick values. Nothing a step shows, hides or re-orders moves the axis. |
| Layout | A slide that is a waterfall at any step lays out like one at every step: the label room, the band axis set back by it, the total's band, and margins wide enough for the axis of every step (plain bars and waterfall). So a `mode` change moves the bars and never the frame. |
| Empty values | Every category needs a value, shown or not. An empty one fails the element with `waterfall needs a value for every category: '<key>' is empty`, rather than being drawn as no change. |

Switching `mode` between `bars` and `waterfall` on a step morphs each bar between standing on zero and floating on its running total. Plain bars keep their own value axis rule (below), so the axis tweens too. Clear `total` and `invert` when you switch back to `bars` (`total: null`): plain bars do not use them, and `validate` warns about them.

## Back-to-back

With `mode: "back-to-back"` the data is long: one row per category (`x`) and group (`group`), the shape demographic data usually comes in. Each category gets one band; the first group's bar extends left of a centre rule and the second group's to the right. A population pyramid with an interval on every bar, which emphasizes one side, then one band, then ranks the bands (`test/fixtures/decks/bar-modes/slides/pyramid-highlight.js`):

```js
{ id: "bars", region: "main", type: "chart.bar",
  props: { data: "data/pyramid.csv", x: "age", y: "share", mode: "back-to-back", group: "group",
           interval: { lower: "low", upper: "high" }, format: { y: ",.1f" } } },
// ...
steps: [
  { id: "plain" },
  { id: "group", only: { bars: { highlight: "Men" } } },
  { id: "category", only: { bars: { highlight: "45-59" } } },
  { id: "sort", set: { bars: { sort: "-value" } } },
],
```

```text
age,group,share,low,high,later,later_low,later_high
0-14,Women,8.1,7.6,8.6,6.9,6.2,7.6
0-14,Men,8.6,8.1,9.1,7.3,6.6,8.0
15-29,Women,9.4,8.9,9.9,8.2,7.5,8.9
15-29,Men,9.8,9.3,10.3,8.6,7.9,9.3
...
```

Women come first in the data, so they are on the left; `groups: ["Men", "Women"]` would swap the sides.

| Rule | What it means |
| --- | --- |
| Groups | `group` needs exactly two values. `groups: [left, right]` puts them on the sides; without it the first value in the data is on the left. Every category needs one row for each group. Rows with an empty category or group are skipped. |
| Centre rule | Both sides grow from `line.sd-centre-rule` (the axis line at zero, in `--sd-color-ink`), over the full height of the plot. |
| Value axis | The ticks run out from the rule on both sides and read as magnitudes: `10 5 0 5 10`. Without `domain` the axis is mirrored, from zero to the largest value or drawn interval bound of **every back-to-back step of the slide** (each with its own `y` and `interval`, read from `ctx.stepProps`, over the same `data`), rounded outward to tick values. With `domain`, each side runs from zero to the larger magnitude of the two. Nothing a step shows, sorts or switches moves the axis. |
| Side titles | Above each side, `text.sd-side-title[data-side]` names its group in the group's colour: the categorical palette's first colour on the left and its second on the right. As text, the colour is darkened (lightened on a dark background) until it reaches 4.5:1 (`textColor` in `core/color.js`), so academic-light's amber title is darker than its bars. The bars use the palette colours as they are. |
| Whiskers | `interval` draws each bar's whisker in ink, as plain bars do, with no halo behind it (a halo would cut a notch in the bar at each end). A whisker needs a value and both bounds. |
| Value labels | Past the bar's end, or its whisker's, on the bar's own side: left of the left bars, right of the right ones. They show magnitudes. An empty `y` cell draws no bar and no label on that side. |
| `highlight` | A category dims every other band on both sides. A group dims the other side, and turns its title `--sd-color-muted`. A name that is both a category and a group is an element error. |
| `sort` | Ranks the bands by the sum of the two sides. `{ by }` sums a number column the same way; a text column (the category itself, for example) counts where the two rows agree. A category with a side missing has no sum and comes last. Both bars of a band slide together with its label. |
| `shown` | Lists categories. A hidden category hides both bars and keeps its band. |
| Values | Every value and drawn interval bound must be zero or more: a bar that crossed the rule would read as the other group. |
| Orientation | Horizontal only: `orient: "vertical"` fails the element, and `validate` reports it (`chart-orient`). |
| Mode changes | A change of `mode` to or from `back-to-back`, or of `group` or `groups`, snaps. The data shapes differ, so there is no bar to morph. |

## The value axis

This section is about plain bars; a waterfall's axis is described under [Waterfall](#waterfall), and a back-to-back axis under [Back-to-back](#back-to-back). With `domain`, the axis is exactly `[min, max]`. Without it, the axis spans:

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
| Waterfall: a category enters or leaves `shown` | Its start and end tween over the whole motion: it grows from the running total before it (or shrinks into it) while every later base moves by its value. Its whisker draws after it, and its label fades with it. |
| Waterfall: `y` or `sort` changes | Every bar, base and connector tweens together; a re-sort slides the bars to their new bands while their bases follow the new order. |
| Waterfall: `total` set or cleared | The total bar fades in or out in its band, with its connector. |
| Waterfall: `invert` changes | The bar colors interpolate, as for `highlight`. |
| `mode` changes between `bars` and `waterfall` | Each bar rises from zero to float on its running total (its whisker with it), or sinks back to zero. Connectors and the total fade; the colors and the axis tween. |
| Back-to-back: a category enters or leaves `shown`, `y` or `sort` changes | As for plain bars, on both sides at once: both bars grow out of the centre rule (or shrink into it), change length, or slide to their new band with the band label. |
| Back-to-back: `highlight` changes | The bars' colors and the side titles' colors interpolate over `--sd-duration-fast`. |
| `mode` changes to or from `back-to-back`, or `group` or `groups` changes | Nothing moves: the new chart is drawn at once. |
| `domain` changes, or the default axis changes with `y` or `interval` | The axis range tweens. Ticks that stay move with it; new ticks fade in and dropped ticks fade out. |
| Plot size or margins change (for example an axis title is added) | The plot area tweens to its new size. |
| The element becomes visible | Its own entrance (`"x-enter": "own"`): in the element's stagger slot, every shown category grows from zero, then draws its whisker, while the box stays still (over the element's own `enter.duration` when set). A waterfall grows out of zero as a whole, so it stays joined while it grows. The bars are at zero the moment the chart shows. With `enter: "fade"`, `"rise"`, `"wipe"` or `"pop"` the box moves instead and the bars are at full length at once; with `enter: "none"` nothing moves. |

Hidden categories keep their band. Bands follow the [sorted](#sorting) order (the data order without `sort`) whether or not a category is shown. A hidden category is laid out at its final length and hidden with `visibility`, together with its whisker, value label and category label, so nothing reflows when it appears.

`highlight` changes color, not opacity, so value labels keep their contrast. The value labels do use an `opacity` attribute, but only while a category grows in or out.

No motion plays, and the new state is drawn at once, when:

- `orient` changes, or
- the set of categories changes (for example `data` or `x` points at different rows). A different order of the same categories, from `sort`, slides, or
- `mode` changes to or from `back-to-back`, or `group` or `groups` changes: the data shapes differ.

The element's own entrance still grows every bar from zero.

Adding `interval` to bars that are already shown makes the whiskers appear at full size at once; only entering categories draw their whisker.

An aborted step (you press next again before the motion ends) snaps to its end state. Every update ends by writing the target state from the props and rows alone, and the component writes attributes only, never inline styles. So the markup after a played step equals the markup after jumping to it, which is what `check --played` compares.

## Layout

| Aspect | Rule |
| --- | --- |
| Bar thickness | 65% of the band, capped at 4 times the label font size (`--sd-font-size-label`, 28px in academic-light, so at most 112px). |
| Bar color | Waterfall: see [Waterfall](#waterfall). Back-to-back: the categorical palette's first color on the left and its second on the right. Otherwise the first color of the categorical palette (blue `#1d4ed8` in `modern`, the default; `#0072b2` in academic-light's `okabe-ito-dark`). If the theme has no categorical palette, `--sd-color-accent`. |
| Dimmed bar color | `--sd-color-dim` (`--sd-color-rule` in a theme without it); dimmed value labels use `--sd-color-muted`. |
| Value labels | Past the bar's end, or past the whisker's end when there is one. On the right of a horizontal bar, above a vertical bar; on the other side for negative values. Weight 600, ink color. |
| Category labels | On the band axis, in ink. Long names wrap. Horizontal: up to about a third of the chart width per line, and as many lines as fit the band. Vertical: the band width, up to 3 lines. A label that does not fit ends with `…`. |
| Ticks and axis titles | Ticks in muted, axis titles in ink. All chart text uses `--sd-font-size-label`, which is at least `--sd-min-audience-font`. |
| Margins | Computed from character counts, not measured text, so they do not depend on font loading. The room kept for value labels comes from the widest formatted value over every numeric column except the category (and the domain ends), not only the current `y`, so switching `y` does not resize the plot. |
| Accessibility | Each bar group has a `<title>` with the category, its value and the interval, formatted like the labels: `Less exposed: 8.5 (6.9 – 10.1)`. A Spanish deck reads `8,5 (6,9 – 10,1)`. |

## Labels and formats

| What | With `format` | Without |
| --- | --- | --- |
| Value labels at the bar ends | `format.y` | The value as precise as the data (d3 format `,.12~r`: every digit the table holds, up to 12 significant ones, with a thousands separator). |
| Tick labels | `format.y` | A fixed number of decimals from the tick step, so ticks of 5 show `0 5 10`, ticks of 2.5 show `0.0 2.5 5.0`. |
| Interval text in `<title>` | `format.y` | Same as value labels. |
| Category labels | `format.x`, only when the category is a number | The category text as it is. |

`format.y` formats the ticks and the value labels alike; omit it to get ticks at a fixed precision from the tick step (whole numbers for a whole step) with labels as precise as the data. Set it when the two should read the same (`",.0f"`, `".1%"`).

Tick labels on a horizontal value axis that would run into each other are thinned: fewer ticks (d3's for a count of 5, then 3, then 2) over the same domain, which never moves. A vertical axis keeps d3's ticks.

A negative bar's value label points away from zero (left of a horizontal bar, under a vertical one). When the axis goes below zero the chart keeps room for it between the plot and the category labels, so the two never overlap.

Formats are localized by the deck language: in an `es` deck the decimal separator is a comma and the thousands separator a dot.

## Colours

Every plain bar takes one colour, the first colour of the theme's categorical palette (`--sd-color-accent` in a theme without one): there is no per-category colour option and no colour column. To single a bar out, use `highlight`, which dims the others; a waterfall colours by sign and back-to-back by group. Bars out of focus turn `--sd-color-dim`.

## Sizing: give the chart a region that fills

The chart reads its width and height from its element box at every update. It takes the height the other elements in its region leave (`core/stepdeck.css` gives it `flex: 1 1 0`), so a source line can share the region. This is the same as [`chart.line`](chart-line.md). A region with no set height, such as `statement` `main`, gives it none. Measured with `dump` on a scratch deck:

```text
speed · step 0 (before)                 (figure-notes, chart alone in main)
  visible  bars    chart.bar  96,218 1096×754  ...
wide · step 0 (a)                       (full-bleed, chart alone in main)
  visible  bars    chart.bar  96,194 1728×790  ...
```

`validate` does not report a collapsed chart. `check` reports it only indirectly: the chart's labels spill out of the zero-height region, so it prints `text-outside-region` for the chart element, and the region's size in that line ends in `×0`. Confirm with `dump` boxes or `shoot` images. See the [Fill rules](../layouts.md#fill-rules) table.

## Markup

Inside its element wrapper (`div.sd-el[data-el][data-type="chart.bar"]`) the component renders one SVG:

```text
svg.sd-chart-bar[data-orient="horizontal|vertical"][data-mode="waterfall|back-to-back"]
  g.sd-plot
    g.sd-axis.sd-axis-value
      g.tick > line.sd-grid-line, text
    g.sd-axis.sd-axis-band
      text.sd-band-label[data-key][data-visible] > tspan (one per wrapped line)
    g.sd-connectors > line.sd-connector[data-key]          (waterfall only)
    g.sd-bars
      g.sd-bar-group[data-key][data-side][data-visible][data-dim]   (data-side: back-to-back only)
        title
        rect.sd-bar
        text.sd-bar-label
        g.sd-whisker > line.sd-whisker-line, line.sd-whisker-cap.sd-whisker-cap-lower, line.sd-whisker-cap.sd-whisker-cap-upper
    line.sd-axis-line[.sd-centre-rule]                         (sd-centre-rule: back-to-back only)
  text.sd-axis-title.sd-axis-title-band
  text.sd-axis-title.sd-axis-title-value
  text.sd-side-title[data-side]                                (back-to-back only, one per side)
```

| Selector | Meaning |
| --- | --- |
| `svg.sd-chart-bar[data-orient]` | The chart; `data-orient` is `horizontal` or `vertical`. A waterfall has `data-mode="waterfall"` and a back-to-back chart `data-mode="back-to-back"`; plain bars have no `data-mode`. |
| `g.sd-bar-group[data-key]` | One category. `data-key` is the category text. |
| `[data-visible="true\|false"]` | Whether the category is shown. `core/stepdeck.css` hides `false` groups and band labels with `visibility: hidden`. |
| `[data-dim="true\|false"]` | `true` when a `highlight` is set and this is not the highlighted category. |
| `rect.sd-bar` | The bar. Its `fill` attribute is the palette color, or the dimmed color. |
| `g.sd-whisker` | Present only for a bar with a value and both interval bounds. |
| `text.sd-bar-label` | The value label. |
| `text.sd-band-label[data-key]` | The category label on the band axis. |
| `g.sd-bar-group[data-key="__total"]` | A waterfall's total bar, with its band label `text.sd-band-label[data-key="__total"]` (set in weight 600). Present on every step of a slide that shows a total at some step; hidden (`data-visible="false"`) where it is off. |
| `line.sd-connector[data-key]` | A waterfall connector, from the end of the bar named by `data-key` to the next shown bar (or the total). Dotted in `--sd-color-muted`. |
| `g.sd-bar-group[data-side]` | Back-to-back: one group per category and side, `data-key` the category and `data-side` `left` or `right`. |
| `line.sd-centre-rule` | Back-to-back: the axis line at zero, both sides growing from it, in `--sd-color-ink`. |
| `text.sd-side-title[data-side]` | Back-to-back: a side's title, the group's name. Its `fill` attribute is the group's color, readable as text. |

Restyle one slide with slide `style` and these classes. Colors are written as `fill` attributes, so to override a bar color use a CSS `fill` rule, which takes precedence over the attribute.

## Errors

Each of these fails the element. The message is recorded as `<slide>/<element>: <message>` in `STEPDECK.errors`, shown on the canvas in the element's box, reported by `check` as `render-error` and listed in `dump` output. A failed element gets no further updates.

| Message | Cause |
| --- | --- |
| ``chart.bar needs a `data` path`` | `data` is missing or empty. |
| `<data> is not a table (use a .csv file)` | `data` points at a file that does not load as a list of rows, for example a JSON object or a .geojson file. |
| ``chart.bar needs `<prop>` (a column name)`` | `x` or `y` is missing or not a non-empty string, or `interval.lower` / `interval.upper` is set but empty or not a string. A missing interval key is reported by `validate` (schema); at render time the whisker is just left out. |
| `column '<c>' not found in <data> (columns: a, b, …)` | A column named by `x`, `y` or `interval` is not in the CSV header. |
| `<data> has no rows` | The CSV has a header and no rows, so its columns cannot be checked. |
| ``\`domain\` must be [min, max] with min < max`` | `domain` is not two finite numbers in increasing order. |
| `category '<k>' appears more than once in <data> (chart.bar needs one row per category)` | Two rows share a category, in `bars` or `waterfall`. Back-to-back has a row per category and group, and reports a repeated group instead (below). |
| ``category '<id>' in `shown` not found in <data> (categories: …)`` | `shown` names a category the data does not have. |
| ``category '<id>' in `highlight` not found in <data> (categories: …)`` | `highlight` names a category the data does not have. |
| `sort column '<c>' not found (columns: a, b, …)` | `sort: { by }` names a column the CSV does not have. |
| ``category '<k>' in `sort` not found (categories: …)`` | A `sort` list names a category the data does not have. |
| `` `sort` must be "none", "value", "-value", { by, order } or a list of categories`` | `sort` is none of those forms. |
| `waterfall needs a value for every category: '<k>' is empty` | `mode: "waterfall"` and a category's `y` cell is empty or not a number, shown or not. |
| `category '__total' in <data> is the name the total bar uses: rename it` | The slide shows a waterfall `total` at some step and the data has a category named `__total`, the key of the total bar. |
| ``chart.bar needs `group` (a column name)`` | `mode: "back-to-back"` without a `group`. |
| `back-to-back bars are horizontal only` | `mode: "back-to-back"` with `orient: "vertical"`. |
| `` `group` column '<g>' has <n> values (back-to-back needs exactly two) `` | The `group` column does not have exactly two values (empty cells aside). |
| `` `groups` must be two different values of the `group` column '<g>' (values: …) `` | `groups` names the same group twice. |
| `category '<k>' has no '<group>' row` | A category lacks the row of one group, or `groups` names a group the data does not have. |
| `category '<k>' has more than one '<group>' row` | A category has two rows for the same group. |
| `` '<name>' in `highlight` is both a category and a group `` | Back-to-back `highlight` names a value that is both. |
| ``category or group '<name>' in `highlight` not found in <data> (categories: …; groups: …)`` | Back-to-back `highlight` names neither a category nor a group. |
| `category '<k>' has <v> in '<column>' for '<group>' (back-to-back needs values of zero or more)` | A back-to-back value, or a bound of a drawn whisker, is below zero. |

The file errors from the data loader also apply, such as `data file not found: <path>`. See [Data and bindings](../../guide/data-and-bindings.md).

`validate` catches only some of these before you open the deck. It checks that `x`, `y`, the `interval` columns and, at a back-to-back step, `group` exist in the CSV header, at every step (rule `missing-column`, with a did-you-mean fix):

```text
squash/bars/agent · missing-column · y = 'agent_day' vs columns of data/speed.csv: task, before_days, agent_days · set y to 'agent_days'
```

The location is `<slide>/<element>/<step>`; a slide without `steps` prints `<slide>/<element>`.

It also gives a misspelt `mode` a did-you-mean (`prop-invalid`, `set mode to "waterfall"`), and warns with `chart-prop-unused` when `invert` or `total` is set on a chart that is not in `mode: "waterfall"`, where they do nothing:

```text
warning: flow/bars/start · chart-prop-unused · `total` does nothing without `mode: "waterfall"` vs `total` together with `mode: "waterfall"` · set `mode: "waterfall"`, or remove `total`
```

A back-to-back chart set vertical is an error (`chart-orient`), as it is at render time:

```text
s/bars/plain · chart-orient · back-to-back bars are horizontal only vs `orient: "horizontal"` with `mode: "back-to-back"` · remove `orient: "vertical"`, or choose another `mode`
```

It does not check `domain` order, the column or the categories that `sort` names (only its form, against the schema: `prop-invalid`), duplicate categories, names in `shown` and `highlight`, empty waterfall values, a back-to-back step that has no `group`, or back-to-back group values and rows (only a `groups` list that repeats a name: `prop-invalid`). Those appear only at render time, at the step where they first occur. Run `check` (or `dump`) to see them:

```text
squash/bars: category 'Nope' in `highlight` not found in data/speed.csv (categories: Clean the data, Write the report)
squash/bars: `domain` must be [min, max] with min < max
```

`chart.bar` is a figure, so its slide also needs an element with `role: "source"` or `validate` reports `figure-source`. See [Rules](../rules.md).

## Gotchas

**A chart in `statement` main has no height.** See [Sizing](#sizing-give-the-chart-a-region-that-fills).

**Switching `y` without `domain` can hide the change.** The default axis rescales to the new column, so set `domain` when the point of the step is that bars got shorter or longer.

**Changing `orient`, or the set of categories, between steps does not animate.** A `data` or `x` that names other rows draws the new chart at once; so does a change to or from `back-to-back`. A `data` file with the same categories and other values tweens.

**`highlight` set with `set` lasts.** It folds into every later step. Use `only` for a one-step emphasis, and clear it with `highlight: null` in `set` if you did use `set`.

**`chart.bar` is stricter than `chart.line`.** An unknown name in `shown` or `highlight` is an element error here; `chart.line` silently ignores unknown names in `series_shown` and dims every series for an unknown `highlight`.

## For agents

The agent-facing summary of this component is in [`skill/references/components.md`](../../../skill/references/components.md). `node cli/index.js catalog chart.bar` prints the same props from the schema.
