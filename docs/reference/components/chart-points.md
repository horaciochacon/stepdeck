# chart.points

`chart.points` draws estimates by category from a CSV file: one row per category, each a dot with an optional interval whisker and its value written beside it, against a value axis at the bottom and an optional reference line across every row. It is built for step-by-step stories: the axis stays put across steps, rows can appear one at a time out of the reference line, one row can be emphasized, a row can show a before and after pair, and an empty cell reads "no data" instead of a dot at zero. This page lists every prop and default, what each change does on a forward step, how the chart is laid out, the markup it renders and the errors it raises. It is for anyone writing chart slides by hand or reviewing what an agent wrote.

Sources: [`components/chart.points/schema.json`](../../../engine/components/chart.points/schema.json), [`components/chart.points/index.js`](../../../engine/components/chart.points/index.js), [`components/chart.points/model.js`](../../../engine/components/chart.points/model.js), [`core/chart.js`](../../../engine/core/chart.js), [`core/stepdeck.css`](../../../engine/core/stepdeck.css). For the other components, see the [components reference](index.md).

## Use it

The gallery's example slide (`components/chart.points/example.js`): six regions with a 95% interval against a labelled average, then one region emphasized for a step. It uses the `figure-notes` layout, puts the chart alone in `main` and the source line in `footer`.

```js
{ id: "points", region: "main", type: "chart.points",
  props: { data: "data/points-estimates.csv", x: "region", y: "rate", interval: { lower: "low", upper: "high" },
           reference: { value: 11.7, label: "Average" }, format: { y: ",.1f" }, axes: { y: "Cases per 1,000" } } },
// ...
steps: [
  { id: "all" },
  { id: "focus", only: { points: { highlight: "Eastport" } } },
],
```

```text
region,rate,low,high
Hillcrest,14.2,11.6,16.9
Lakeside,9.1,7.4,10.9
```

Rows brought in one by one, each growing out of the reference line (`test/fixtures/decks/points/slides/shown.js`, a Spanish deck). `shown: null` in `set` deletes the prop, so every row shows:

```js
{ id: "points", region: "main", type: "chart.points",
  props: { data: "data/estimates.csv", x: "region", y: "rate", interval: { lower: "low", upper: "high" },
           reference: { value: 11, label: "Media" }, shown: [], format: { y: ",.1f" } } },
// ...
steps: [
  { id: "none" },
  { id: "one", set: { points: { shown: ["Norte"] } } },
  { id: "three", set: { points: { shown: ["Norte", "Sur", "Este"] } } },
  { id: "all", set: { points: { shown: null } } },
],
```

A second estimate set on a later step (`test/fixtures/decks/points/slides/estimates.js`). `y` and the interval switch together; the axis already covers both, so the dots move and the axis does not:

```js
{ id: "later", set: { points: { y: "rate2", interval: { lower: "low2", upper: "high2" } } } },
```

Before and after, as two steps (`test/fixtures/decks/points/slides/pairs.js`, a Spanish deck). The first step shows each region's earlier value; the second adds `from` and moves `y` to the new column, so each filled dot slides to its new value while a connector grows behind it from the hollow dot left at the old one:

```js
{ id: "points", region: "main", type: "chart.points",
  props: { data: "data/pairs.csv", x: "region", y: "before", format: { y: ",.1f" } } },
// ...
steps: [
  { id: "before" },
  { id: "now", set: { points: { y: "now", from: "before" } } },
],
```

```text
region,before,now
Norte,14.2,10.1
Oeste,,8.3
```

## Props

`data`, `x` and `y` are required. The schema has `additionalProperties: false`, so any other prop is a `validate` error (`unknown-prop`).

| Prop | Type | Default | Transition | Meaning |
| --- | --- | --- | --- | --- |
| `data` | string | (required) | snap | Path to a CSV file, relative to the deck root. One row per category. |
| `x` | string | (required) | snap | Column holding the category of each row. Its text labels the row. Rows with an empty category are skipped. |
| `y` | string | (required) | tween | Column holding the estimate of each row. A change moves every dot to its new value. An empty cell shows "no data" (see [Missing values](#missing-values)). |
| `from` | string | none | tween | Column holding the earlier value of each row, for a pair. See [Pairs](#pairs-before-and-after). |
| `interval` | `{ lower, upper }` | none | tween | Columns of a whisker through each dot, for example a 95% interval. Both keys are required. A row without both bounds has no whisker. |
| `format` | `{ x?, y? }` | see [Labels](#labels-and-formats) | snap | d3-format specs, localized by the deck language. `y` formats value labels, ticks and the interval text in each row's title. `x` formats category labels, and applies only when the category value is a number. |
| `axes` | `{ x?, y? }` | none | fade | Axis titles. `x` sits above the category labels, `y` under the value axis. |
| `types` | `{ column: "string" \| "number" \| "date" }` | guessed | snap | CSV column types for the data loader. An undeclared column is a number only when every non-empty value looks like one. |
| `domain` | `[min, max]` | from every step | tween | Fixed value axis, used exactly as given (not rounded). See [The value axis](#the-value-axis). |
| `shown` | string[] | every category | draw | Categories to show, by name. A row that appears grows out of the origin (its `from`, for a pair), then draws its whisker. Hidden rows keep their place. |
| `sort` | `"none"` \| `"value"` \| `"-value"` \| `{ by, order? }` \| string[] | `"none"` | tween | Order of the rows. See [Sorting](#sorting). |
| `highlight` | string | none | fade | One category to emphasize. The other rows' dots and whiskers turn the theme's dim color (`--sd-color-dim`) and their value labels the muted color. |
| `reference` | number \| `{ value, label? }` | none | fade | A dashed line across every row at `value`, with `label` above the plot when it is set. |

The transition column is the schema's `x-transition` annotation. It feeds the catalog; the motion itself is written in `index.js` and described in [Motion](#motion).

## Data: one row per category

Each category must appear in exactly one row. A second row with the same category fails the element (see [Errors](#errors)). Rows whose category cell is empty are ignored.

### Missing values

A row whose `y` cell is empty keeps its row and its category label, and shows the engine string "no data" (`sin datos` in a Spanish deck) in `--sd-color-muted`, with no dot, no whisker and no value label. A missing value is never drawn as zero, and it does not reach the axis as zero. A row with a value but an empty interval bound has a dot and no whisker.

## Pairs: before and after

`from` names a column with the earlier value of each row. A row that has a value in both `y` and `from` draws, back to front:

1. a thin connector from `from` to `y`, in `--sd-color-muted` (`--sd-color-dim` out of focus);
2. a hollow dot at `from`: the theme's background colour inside, the dot colour as its outline;
3. the filled dot at `y`, with its value label beyond it, on the side away from the hollow dot when that fits.

An empty `from` cell leaves the row with its end dot alone: no hollow dot and no connector, and never a dot at zero. An empty `y` cell reads "no data" and draws no pair, whatever `from` holds. In a row's `<title>` a pair reads `Norte: 14,2 → 10,1`. A `from` outside a given `domain` fails the element, as an estimate does (see [Errors](#errors)).

The axis covers `from` at every step, like `y` and the interval columns (see [The value axis](#the-value-axis)), so the two steps of the story above share one axis, and `from` and `y` need not be in the same step to be counted. The `interval` whisker, when there is one, runs through the filled dot.

On the played step that adds `from` and changes `y`, each filled dot slides from its old value to the new one and the connector grows behind it; the hollow dot is where the old value was from the first frame. A pair that appears, in `shown` or in the chart's entrance, grows out of its `from`: the hollow dot grows there, the filled dot slides out to `y` and the connector follows it. Removing `from` on a later step folds the pair into the dot. See [Motion](#motion).

## Sorting

`sort` decides the order of the rows down the plot. Every category is ranked, shown or not, so a row that `shown` hides keeps its place in the order and appears there.

| `sort` | Order |
| --- | --- |
| `"none"`, or omitted | The data order. |
| `"value"` | By `y`, lowest first. |
| `"-value"` | By `y`, highest first. |
| `{ by: "<column>", order: "asc" \| "desc" }` | By another column of the CSV, ascending unless `order` is `"desc"`. A text column compares by code point. |
| `["North", "South"]` | Those categories first, in that order, then the rest in data order. |

Ties keep the data order. A row with no value (an empty cell, which reads "no data") comes last whichever way the order runs. Sorting changes the order and nothing else: the axis, the margins and every row's values are the same.

```js
{ id: "points", region: "main", type: "chart.points",
  props: { data: "data/estimates.csv", x: "region", y: "rate" } },
// ...
steps: [
  { id: "data" },
  { id: "ranked", set: { points: { sort: "-value" } } },
],
```

On a played step, a change of `sort` slides every row, with its category label, from its old place to its new one in one motion. A row that appears on the same step is already at its final place while it grows, and the others slide to make room. `sort` and `y` can change together: the dots move along the axis while the rows change places.

The errors are the ranking's own. An unknown column fails the element with `sort column '<c>' not found (columns: a, b, …)`, an unknown category in a list with ``category '<k>' in `sort` not found (categories: …)``, and any other form with `` `sort` must be "none", "value", "-value", { by, order } or a list of categories``.

## The value axis

With `domain`, the axis is exactly `[min, max]`. Without it, the axis spans every number in `y`, `from` and both interval columns of **every step** of the slide, plus every step's `reference` value, rounded outward to tick values (d3 `nice` with about 5 ticks). Only what the chart can draw counts: a row with an empty category is not shown, and a row with no `y` at a step shows "no data", so its `from` and its interval bounds do not widen the axis at that step; a lone bound without the other is not drawn either. The steps counted are the props each step of the slide resolves to (`ctx.stepProps`); a step that reads another data file does not count. Zero is not forced: estimates between 60 and 80 get an axis around them.

So the axis is the same at every step of the slide: switching `y` moves the dots and never the axis, and a reference that appears later already has its place. The axis moves only when the data file changes or when a step sets a different `domain`, and then it tweens; the plot keeps its size, because the room for every step's tick labels is kept from the start.

An estimate outside a given `domain` fails the element. An interval bound past it is not an error: the whisker is cut at the axis end. A `reference` past it is not drawn.

The value axis has about 5 ticks with grid lines, and an axis line under the rows.

## Motion

The engine animates only a forward move of exactly one step, in a live presentation with motion on. A jump, a backward move, the first render and capture mode (used by `shoot` and `check`) draw the target state directly. See [Animation and motion](../../guide/animation-and-motion.md).

Every animated change runs as a single `ctx.animate.tween` that lasts twice the theme's `--sd-duration` (800 ms in both built-in themes), or the step's `transition.duration` when it is set, with the theme's `--sd-easing`. Colors run in their own tween over `--sd-duration-fast`.

The origin of a growing row is the reference value when it is inside the axis, else 0 when it is inside the axis, else the start of the axis.

| Change | What you see |
| --- | --- |
| `y` or `interval` changes | Every dot, whisker and value label moves to its new place. A whisker that appears draws out of its dot; one that goes retracts into it. |
| `from` is added while `y` changes | Each filled dot slides from its old value to the new one while the connector grows behind it, from the hollow dot, which is at `from` from the first frame. A row with an empty `from` has no hollow dot and no connector. When `from` is removed, the hollow dot shrinks and the connector retracts into the dot. |
| `sort` changes | Every row and its category label slide from the old place to the new one, in one motion. |
| A category enters `shown` | Over the first 60% of the motion the dot slides out of the origin (out of its `from`, for a pair, where the hollow dot grows) as it grows; over the remaining 40% the whisker draws outward from the dot. The value label follows the dot and its opacity rises with it. |
| A category leaves `shown` | The reverse: the whisker retracts, then the dot shrinks back into the origin. The row is then hidden. |
| A value becomes empty, or an empty one gets a value | The dot shrinks (or grows) where it is, never through zero, while "no data" fades in (or out). |
| `highlight` set, changed or cleared | Dot fill, whisker stroke and value label color interpolate in RGB over `--sd-duration-fast`. |
| `domain` changes | The axis range tweens. Ticks that stay move with it; new ticks fade in and dropped ticks fade out. |
| `reference` set, changed or cleared | The line and its label fade in or out. A new value or label fades in at its place while the old one fades out. |
| An axis title set, changed or cleared | It fades in or out, or the new text fades in over the old one. The plot keeps its size: room for a title is kept at every step that has one. |
| The element becomes visible | Its own entrance (`"x-enter": "own"`): in the element's stagger slot, every shown row grows out of the origin (its `from`, for a pair) and draws its whisker, while the box stays still and the axis, labels and reference show at once (over the element's own `enter.duration` when set). With `enter: "fade"`, `"rise"`, `"wipe"` or `"pop"` the box moves instead and the rows are drawn at once; with `enter: "none"` nothing moves. |

No motion plays, and the new state is drawn at once, when the set of categories changes (for example `data` or `x` points at different rows).

An aborted step (you press next again before the motion ends) snaps to its end state. Every update ends by writing the target state from the props and rows alone, and the component writes attributes only, never inline styles. So the markup after a played step equals the markup after jumping to it, which is what `check --played` compares.

## Layout

| Aspect | Rule |
| --- | --- |
| Rows | One band per category, in the [sorted](#sorting) order (data order without `sort`), down the plot. A hidden row keeps its band and is hidden with `visibility`, together with its category label. |
| Pair | A hollow dot of the same radius as the filled one, at `from`, with a 3px connector in `--sd-color-muted` behind both dots. The value label sits past the whole pair and whisker, on the far side of the filled dot from the hollow one when it fits. |
| Dot | Radius 0.35 × the label font size (`--sd-font-size-label`, 28px, so about 10px), smaller in narrow bands. The first color of the categorical palette, or `--sd-color-accent` without one. The theme outlines it in the background color. |
| Whisker | Ink, 3px, with end caps, on a 9px background halo so it reads over grid lines and the reference. Dimmed rows use `--sd-color-dim`. |
| Value labels | Weight 600, ink (muted when dimmed), on a background halo. Past the upper end of the whisker (or of the dot, without one) when the label fits inside the chart; else past the lower end, left of the whisker; only when neither fits, inside the whisker against its upper end. The side is chosen from the row where it ends (where it starts, for a row that leaves) and kept through a motion: the label follows its mark and never jumps to the other side part-way. |
| Category labels | Left of the plot, in ink, right-aligned. Long names wrap: up to about a third of the chart width per line, and as many lines as fit the band. A label that does not fit ends with `…`. |
| Reference | `--sd-color-muted`, dashed, from the top to the bottom of the plot. Its label sits above the plot, right of the line when it fits, else left of it. |
| Margins | Computed from character counts, not measured text, and from every step of the slide (its titles, its reference label, the tick labels of its own axis), so nothing that appears later resizes the plot. Each side keeps half of the widest tick label inside the chart; a value label near the right edge moves to the left of its whisker instead. |
| Sizing | The chart takes the height the other elements in its region leave (`flex: 1 1 0`), like [`chart.bar`](chart-bar.md#sizing-give-the-chart-a-region-that-fills). In `statement` `main` it has no height. |
| Accessibility | Each row has a `<title>` with the category, its value and the interval, formatted like the labels: `Norte: 12,4 (9,8 – 15,1)` in a Spanish deck, or `Oeste: sin datos`. |

## Labels and formats

| What | With `format` | Without |
| --- | --- | --- |
| Value labels | `format.y` | The value as precise as the data (d3 format `,~r`). |
| Tick labels | `format.y` | A fixed number of decimals from the tick step. |
| Interval text in `<title>` | `format.y` | Same as value labels. |
| Category labels | `format.x`, only when the category is a number | The category text as it is. |

Formats are localized by the deck language: in an `es` deck the decimal separator is a comma and the thousands separator a dot.

## Markup

Inside its element wrapper (`div.sd-el[data-el][data-type="chart.points"]`) the component renders one SVG:

```text
svg.sd-chart-points
  g.sd-plot
    g.sd-axis.sd-axis-value
      g.tick > line.sd-grid-line, text
    line.sd-axis-line
    g.sd-references
      g.sd-reference > line.sd-rule, text.sd-rule-label
    g.sd-points-labels
      text.sd-points-label[data-key][data-visible] > tspan (one per wrapped line)
    g.sd-points-rows
      g.sd-points-row[data-key][data-visible][data-dim]
        title
        g.sd-whisker > line.sd-halo-under, line.sd-whisker-line, line.sd-whisker-cap.sd-whisker-cap-lower, line.sd-whisker-cap.sd-whisker-cap-upper
        path.sd-pair-connector              (a row with a `from` value)
        circle.sd-dot.sd-dot-hollow         (a row with a `from` value)
        circle.sd-dot
        text.sd-points-value.sd-halo        (a row with a value)
        text.sd-no-data.sd-halo             (a row without one)
  text.sd-axis-title.sd-axis-title-band
  text.sd-axis-title.sd-axis-title-value
```

| Selector | Meaning |
| --- | --- |
| `g.sd-points-row[data-key]` | One category, placed by its `transform`. `data-key` is the category text. |
| `[data-visible="true\|false"]` | Whether the category is shown. `core/stepdeck.css` hides `false` rows and category labels with `visibility: hidden`. |
| `[data-dim="true\|false"]` | `true` when a `highlight` is set and this is not the highlighted category. |
| `g.sd-whisker` | Present only for a row with a value and both interval bounds. Its `stroke` attribute colors its lines. |
| `circle.sd-dot` | The estimate. Its `fill` attribute is the palette color, or the dimmed color. A pair's hollow dot is `circle.sd-dot.sd-dot-hollow` (its `stroke` attribute is that color) and is not matched by `circle.sd-dot:not(.sd-dot-hollow)`. |
| `path.sd-pair-connector` | The line from the hollow dot to the filled one, present for a row with a `from` value. Its `stroke` attribute is the muted color, or the dimmed one. |
| `text.sd-points-value` | The value label. |
| `text.sd-no-data` | "no data", for a row whose `y` cell is empty. |
| `g.sd-reference` | The reference line and its label, present while `reference` is set. |
| `text.sd-points-label[data-key]` | The category label. |

Restyle one slide with slide `style` and these classes. Colors are written as attributes, so to override a dot color use a CSS `fill` rule, which takes precedence over the attribute.

## Errors

Each of these fails the element. The message is recorded as `<slide>/<element>: <message>` in `STEPDECK.errors`, shown on the canvas in the element's box, reported by `check` as `render-error` and listed in `dump` output. A failed element gets no further updates.

| Message | Cause |
| --- | --- |
| ``chart.points needs a `data` path`` | `data` is missing or empty. |
| `<data> is not a table (use a .csv file)` | `data` points at a file that does not load as a list of rows. |
| ``chart.points needs `<prop>` (a column name)`` | `x` or `y` is missing or not a non-empty string, or an `interval` key is empty or not a string. |
| `column '<c>' not found in <data> (columns: a, b, …)` | A column named by `x`, `y`, `from` or `interval` is not in the CSV header. |
| ``\`domain\` must be [min, max] with min < max`` | `domain` is not two finite numbers in increasing order. |
| ``category '<k>' appears more than once in <data> (chart.points needs one row per category, or `id` for strips)`` | Two rows share a category. |
| ``category '<k>' in `shown` not found in <data> (categories: …)`` | `shown` names a category the data does not have. |
| ``category '<k>' in `highlight` not found in <data> (categories: …)`` | `highlight` names a category the data does not have. |
| `sort column '<c>' not found (columns: a, b, …)` | `sort: { by }` names a column the CSV does not have. |
| ``category '<k>' in `sort` not found (categories: …)`` | A `sort` list names a category the data does not have. |
| `` `sort` must be "none", "value", "-value", { by, order } or a list of categories`` | `sort` is none of those forms. |
| ``estimate '<k>' (<value>) is outside `domain` [<a>, <b>]`` | A given `domain` stops short of an estimate (the first one, in data order). |
| ``\`from\` of '<k>' (<value>) is outside `domain` [<a>, <b>]`` | A given `domain` stops short of the `from` value of a row that has an estimate. |

`validate` checks that `x`, `y`, `from` and the `interval` columns exist in the CSV header, at every step (rule `missing-column`, with a did-you-mean fix). It does not check `domain`, `sort`, duplicate categories, or names in `shown` and `highlight`. Those appear only at render time, at the step where they first occur. Run `check` (or `dump`) to see them:

```text
domain-error/points: estimate 'Norte' (12.4) is outside `domain` [0, 10]
```

`chart.points` is a figure, so its slide also needs an element with `role: "source"` or `validate` reports `figure-source`. See [Rules](../rules.md).

## Gotchas

**A chart in `statement` main has no height.** See [Sizing](chart-bar.md#sizing-give-the-chart-a-region-that-fills) on the `chart.bar` page; the same holds here.

**`highlight` set with `set` lasts.** It folds into every later step. Use `only` for a one-step emphasis.

**A value label near the right edge moves.** The right margin is kept small, so a label that does not fit past its whisker sits left of it. That is expected, not overflow.

**Steps that read another file do not widen the axis.** The fixed axis counts every step's columns in the current data file only. If a step switches `data`, set `domain` on both steps to keep the axis.

## For agents

The agent-facing summary of this component is in [`skill/references/components.md`](../../../skill/references/components.md). `node cli/index.js catalog chart.points` prints the same props from the schema.
