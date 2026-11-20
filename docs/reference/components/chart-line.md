# chart.line

`chart.line` draws one or more lines from a CSV file over a numeric x. Each line is labelled directly at its end, and the chart is built for step-by-step reveals: series draw in, one series can be highlighted for a step, vertical annotations fade in, and changing `y` morphs every line point by point. This page lists every prop, its default and transition, how the scales and colors are chosen, when the chart animates, how big it renders, the `anchor()` API, the markup, and the mistakes that are easy to make. It is for deck authors and for authors of custom components that mount a `chart.line` and need `anchor()`.

Sources: [`components/chart.line/schema.json`](../../../components/chart.line/schema.json), [`components/chart.line/index.js`](../../../components/chart.line/index.js), [`core/chart.js`](../../../core/chart.js), [`core/kit.js`](../../../core/kit.js), [`core/stepdeck.css`](../../../core/stepdeck.css). For the other components, see the [components reference](index.md).

## Use it

The chart slide of the starter deck (`templates/talk/slides/chart.js`) builds a figure over four steps on the `figure-notes` layout: one series, then two, then an annotation, then a one-step highlight.

```js
export default {
  id: "chart",
  layout: "figure-notes",
  title: "Group B overtakes Group A after 2020",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/series.csv", x: "year", y: "value", series: "group",
               series_shown: ["Group A"],
               axes: { x: "Year", y: "Indicator per 1,000" },
               format: { x: "d", y: ",.0f" } } },
    { id: "note", region: "notes", type: "text", from: "mark",
      props: { role: "note", text: "From 2020 on, Group B rises three times faster than before." } },
    { id: "latest", region: "notes", type: "big-number", from: "latest",
      props: { value: "{{data/summary.json#/latest_b}}", format: ",.1f", label: "Group B in 2024, per 1,000" } },
    { id: "source", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic example data (data/make-data.mjs)." } },
  ],
  steps: [
    { id: "base", notes: "Start with one series." },
    { id: "compare", set: { chart: { series_shown: ["Group A", "Group B"] } } },
    { id: "mark", set: { chart: { annotate: [{ x: 2020, label: "2020" }] } } },
    { id: "latest", only: { chart: { highlight: "Group B" } }, notes: "Land on the figure." },
  ],
};
```

The CSV is long format, one row per series and x value:

```text
year,group,value
2015,Group B,22
2015,Group A,24
2016,Group B,22.9
2016,Group A,25.1
```

To morph the lines, change `y` in a later step. The `trend` slide of `examples/spike` does this at its last step:

```js
{ id: "total", set: { chart: { y: "rate", axes: { y: "Responders per 1,000" } } } },
```

Use `only` for `highlight`, as above, so the emphasis lasts one step and the next step returns to the plain chart. See [The step model](../../guide/step-model.md).

## Props

| Prop | Type | Required | Default | Transition | Meaning |
| --- | --- | --- | --- | --- | --- |
| `data` | string | yes | | snap | Path to a CSV file, relative to the deck root. One row per series and x value. |
| `x` | string | yes | | snap | Column holding the numeric x value. |
| `y` | string | yes | | tween | Column holding the numeric y value. Changing it morphs each line point by point (keyed by series and x) while the y axis rescales. |
| `axes` | `{ x?, y? }` | yes | | snap | Axis titles: `x` is drawn under the x axis, `y` above the plot. Both keys are optional, but the object is required (`{}` gives no titles). |
| `series` | string | no | none | snap | Column naming the series of each row. Without it the chart draws one line, keyed `all`, and no series labels. |
| `series_shown` | string[] | no | every series | draw | Series to draw, by name. A series that appears is drawn along its length; one that leaves fades out. |
| `highlight` | string | no | none | fade | Series to emphasize. Every other series' line and band drop to opacity 0.25, and their labels switch to the muted text color. |
| `annotate` | `{ x, label? }[]` | no | none | fade | Vertical dashed rules at the given x values, each with an optional short label. |
| `format` | `{ x?, y? }` | no | precision from the tick step | snap | d3-format specs for the tick labels, localized by the deck language. Without one, ticks use fixed precision derived from the tick step (`d3.precisionFixed`), so a step of 0.5 gives one decimal. |
| `types` | `{ <column>: "string" \| "number" \| "date" }` | no | guessed | snap | CSV column types passed to the data loader. An undeclared column is a number only when every non-empty value looks like one. |
| `interval` | `{ lower, upper }` | no | none | tween | A shaded band between two columns around each series, such as an uncertainty interval. Both keys are required. The band morphs with the lines. |

The schema has `additionalProperties: false` at every level, so any other prop (or any other key inside `axes`, `format`, `interval` or an `annotate` entry) is a `validate` error. The transition column is the schema's `x-transition` annotation: it documents what the component code does; the engine does not read it.

Rows whose x or y cell is empty are left out of the line; the line joins the points on either side. The band is broken where `lower` or `upper` is empty. `annotate` entries whose `x` is not a finite number are dropped.

## Scales and ticks

- **x domain**: the extent of the x column over every row. Rows with an x but an empty y still widen the x domain, so a trailing x with no y stretches the axis past the end of the line. If all x values are equal, the domain is widened to `[x, x + 1]`.
- **y domain**: covers every `y` value in the data, plus every `interval.lower` and `interval.upper` value, for every series, shown or not. It always includes 0, and is rounded out with `nice(5)`. Because hidden series count, the y axis does not jump when a series appears; it changes only when `y`, `interval` or the data change.
- **Ticks**: 5 y ticks and 6 x ticks (d3 tick counts, so the exact number can differ by one or two). Y ticks carry horizontal grid lines.
- **Margins** are computed from character counts, not measured text, so the layout never depends on font loading. The left margin fits the longest y tick label; the right margin fits the longest shown series name.

## Colors

Series colors come from the theme's categorical palette (`ctx.palette("categorical")`), assigned in order of first appearance in the data. A series therefore keeps its color at every step, whichever series are shown. With more series than palette colors, the colors repeat.

Palette colors promise 3:1 contrast against the background, which is enough for a line. A series label is text, so it is drawn in its series color mixed toward black (toward white on a dark background) until it reaches 4.5:1, the contrast `check` requires of text. When `highlight` dims a series, its label uses `--sd-color-muted` instead of being faded.

Neutral colors and sizes come from theme tokens through `core/stepdeck.css`: ticks, axis titles, series labels and annotation labels use `--sd-font-size-label` (28px in academic-light); axis text and tick labels are `--sd-color-muted`; grid lines are `--sd-color-rule`; axis titles and annotation labels are `--sd-color-ink`. Lines are 5px wide; bands use 15% fill opacity. See [Themes](../themes.md).

## Motion

The chart animates only when the engine asks for it: you moved forward exactly one step, in a live presentation with motion on. Every other move (a jump, a backward move, the first render, capture mode for `shoot` and `check`) renders the target state at once. See [Animation and motion](../../guide/animation-and-motion.md).

| What changed | What plays |
| --- | --- |
| The element just became visible | The chart is drawn in its final state, then every line draws along its length. |
| `y` (or anything that moves points) | A keyed morph: each point, keyed by `series\|x`, moves from its old position to its new one while the y axis domain, ticks and plot origin interpolate. Bands morph with the lines. |
| `series_shown` adds a series | Its line draws along its length; its label and band fade in. |
| `series_shown` removes a series | Its line, label and band fade out. |
| `highlight` set or cleared | Line and band opacity tween between 1 and 0.25. Label colors switch at once. |
| `annotate` | New annotations fade in; removed ones fade out. Ticks that enter or leave fade the same way. |

Motion lasts twice `--sd-duration` (400 ms in academic-light, so 800 ms). A step's `transition.duration` replaces it as is (it is not doubled). An aborted step snaps to its end state. Every update ends by writing the target state from props and clearing inline styles and opacities, so the markup after a played step equals the markup after jumping to it.

A point with no previous position (a new x value) starts at its final position rather than flying in.

## Sizing

The chart measures its element's width and height on every update and fills that box. It needs a region that gives it height. In the built-in layouts that happens only when the chart is the **only element** in one of these regions, which carry a `> .sd-el:only-child { flex: 1 1 0; min-height: 0 }` rule:

| Layout | Region |
| --- | --- |
| `figure-notes` | `main` |
| `halves` | `left`, `right` |
| `title` | `figure` |

Anywhere else, including `full-bleed` and `statement`, or when a source line shares `main` with the chart, the chart renders about 150px tall. Measured with `dump`: alone in `figure-notes` main it is 1096 x 754; in `full-bleed` main it is 1728 x 150. No `validate` or `check` rule flags a squashed chart, so check the `box` in `dump` output or a `shoot` image. Put the source line in `footer`.

To place a chart outside these regions, give the element a `box` (`{ x, y, w, h }` in canvas pixels), which sizes it directly. See [Layouts](../layouts.md).

## anchor(): series boxes for custom components

`chart.line` is the only built-in component with `anchor()`. A custom component that mounts a chart with `ctx.mount` can ask it where a series is drawn, for example to place a callout next to it:

```js
const child = await ctx.mount("chart.line", host, props);
await child.update(props, info); // mount() alone renders nothing, so anchor() would return null
const box = child.instance.anchor("series:Group B"); // { x, y, w, h } or null
```

`info` is the parent's own `update` info; pass it on so the child gets the parent's `signal` and `animate`. `ctx.mount` only calls the child's `mount()`, so the child has no state until its first `update` finishes. Call `anchor()` again after each awaited `child.update` to get the new state.

- The ref must be `series:<name>`, with `<name>` the series name (`all` when `series` is absent).
- The result is the bounding box of the series' points, in canvas pixels (1920 x 1080 space, independent of the shell's scale), measured from the canvas origin. It covers the line, not the series label. A flat line has `h: 0`.
- It returns `null` for any other ref, for a series that is not shown or has no points, and before the first update has finished.
- It reflects the last state the chart finished rendering, not the one being animated toward.

The component contract and `ctx.mount` are covered in [Custom components](../../guide/custom-components.md).

## Markup

Inside its element wrapper (`div.sd-el[data-el][data-type="chart.line"]`) the component renders one SVG:

| Selector | What it is |
| --- | --- |
| `svg.sd-chart-line` | The chart, sized in pixels with a matching `viewBox`. |
| `g.sd-plot` | The plot area, translated by the margins. |
| `g.sd-axis.sd-axis-y > g.tick.sd-tick-y` | A y tick: `line.sd-grid-line` and `text`. |
| `g.sd-axis.sd-axis-x > g.tick.sd-tick-x` | An x tick: `text`. `line.sd-axis-line` is the x baseline. |
| `path.sd-line[data-series="<name>"]` | One line per shown series. |
| `path.sd-band[data-band="<name>"]` | One band per shown series, only with `interval`. |
| `text.sd-series-label[data-label="<name>"]` | A direct label at the end of each line, only with `series`. |
| `g.sd-annotation` | An annotation: `line.sd-annotation-rule` and `text.sd-annotation-label`. |
| `text.sd-axis-title.sd-axis-title-x`, `.sd-axis-title-y` | The axis titles. |

A dimmed series' line and band carry an `opacity="0.25"` attribute. Use slide `style` with these classes to restyle one slide.

## Errors

These fail the element: the message is shown on the slide, recorded in `STEPDECK.errors` as `<slide>/<element>: <message>`, and reported by `check` as `render-error`. They are shared with `chart.bar` (`core/chart.js`).

| Message | Cause |
| --- | --- |
| ``chart.line needs a `data` path`` | `data` is missing or empty. |
| `<data> is not a table (use a .csv file)` | `data` points to a JSON file. |
| ``chart.line needs `<prop>` (a column name)`` | `x`, `y`, `series` (if given) or `interval.lower`/`upper` (when `interval` is set) is not a non-empty string. An empty `series: ""` fails here. |
| `column '<c>' not found in <data> (columns: a, b, ...)` | `x`, `y`, `series`, `interval.lower` or `interval.upper` names a column the CSV lacks. |

`validate` catches a missing column before you open the deck, with a did-you-mean fix:

```text
chart/chart/base · missing-column · y = 'vaule' vs columns of data/series.csv: year, group, value · set y to 'value'
```

A CSV that does not parse is `data-invalid`; a missing file is `file-missing`. A slide with a `chart.line` must also have an element with `role: "source"`, or `validate` reports `figure-source`. See the [CLI reference](../cli.md).

## Gotchas

**Unknown series names are ignored silently.** A name in `series_shown` that is not in the data is skipped, and an unknown `highlight` dims every series. Neither is an error at runtime or in `validate`. `chart.bar` throws for the same mistakes in `shown` and `highlight`, so the two charts differ here. Check series names against the CSV, including case and spaces.

**`highlight` set with `set` stays.** `set` folds, so the highlight lasts until a later step clears it with `null`. Use `only` for a one-step emphasis.

**The y axis counts hidden series.** If one series is much larger than the rest, the others look flat even while the large one is hidden. Filter the CSV, or use a separate chart.

**A source line in `main` squashes the chart.** See [Sizing](#sizing).

**`format` replaces the default precision.** With `format: { y: ",.0f" }` every y tick is rounded to an integer, even when the ticks step by 0.5.

## For agents

The agent-facing summary is in [`skill/references/components.md`](../../../skill/references/components.md). `node cli/index.js catalog chart.line` prints the props from the schema, and `--json` adds the README and the example path.
