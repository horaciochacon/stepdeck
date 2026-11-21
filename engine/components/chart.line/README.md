# chart.line

A line chart of one or more series over a numeric x, labelled directly at the end of each line.
Built for step-by-step reveals: series draw in, one series can be highlighted for a step,
annotations fade in, changing `y` morphs every line point by point, and point markers and a dotted forecast segment fade in.

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `data` | string | (required) | snap | CSV path relative to the deck root. |
| `x` | string | (required) | snap | Numeric x column. |
| `y` | string | (required) | tween | Numeric y column. A change morphs the lines (keyed by series and x) and rescales the y axis. |
| `series` | string | none | snap | Column naming each row's series. Without it there is one line, keyed `all`. |
| `series_shown` | string[] | all series | draw | Series to draw. Newly shown series draw along their length; removed ones fade out. |
| `highlight` | string | none | fade | Series to emphasize; the others' lines and bands turn the theme's dim color (`--sd-color-dim`, opacity stays 1), sit below it, and their labels turn the muted text color. The change tweens over `--sd-duration-fast`. Use `only` so it lasts one step. |
| `annotate` | `{x, label}`[] | `[]` | fade | Vertical dashed rules with a label. |
| `axes` | `{x?, y?}` | (required) | snap | Axis titles: x under the axis, y above the plot. |
| `format` | `{x?, y?}` | step precision | snap | d3-format specs for tick labels, localized by the deck language. |
| `types` | `{column: type}` | guessed | snap | CSV column types for the loader (`string`, `number`, `date`). |
| `interval` | `{lower, upper}` | none | tween | Shaded band between two columns around each series. |
| `points` | boolean | `false` | fade | A dot on every data point of every shown series; dots after `forecast.from` are hollow and slightly larger. |
| `forecast` | `{from, label?}` | none | fade | From the x value `from` on, each line is dotted, its points hollow and its band lighter; the plot from there to its end is shaded, with a labelled divider (`label`, default the deck language's "Forecast"). |

Behaviour:
- **Idempotent.** Every `update` ends by writing the target state straight from props, so the DOM
  after `settled()` is identical whether the state was jumped to or played step by step.
- **Entrance.** The chart builds its own entrance (`"x-enter": "own"` in its schema): when the element appears on
  an animated step, its lines draw along their length over 2 × `--sd-duration` or the element's `enter.duration`,
  while its box stays still; axes, labels, bands and annotations show at once. It waits for its stagger slot like
  any entering element, and the lines are undrawn the moment it shows. With `enter: "none"`, or a box motion such
  as `enter: "rise"`, the chart is drawn at once (the box moves instead).
- **Morph** (spec §6.3): the component's own keyed join. Series are keyed by name, points by
  series and x, ticks by value, annotations by x. With `info.animate` it interpolates from the
  previous state; all motion runs through `ctx.animate` bound to `info.signal`, so an aborted
  step snaps to its end state.
- **Scales.** The y domain covers every series in the data (not only the shown ones) and includes 0,
  so the axis does not jump when a series appears. It changes only when `y` changes.
- **Forecast and points.** `forecast.from` cuts every series at that x. When it falls between two data points the cut
  adds a boundary point (interpolated, including the band), shared by both parts, so the solid line ends exactly where
  the dotted one starts; a data point exactly at `from` is observed and is not drawn twice. Before the first x the whole
  line is forecast; at or after the last x there is no forecast part and no shaded region. `points` and `forecast` add
  markup only while they are set, and both fade in and out. The region's color is `--sd-color-forecast` when the theme
  sets it, else a faint mix of `--sd-color-ink` and the background.
- **Colors** come from `ctx.palette("categorical")` in order of first appearance in the data, so a
  series keeps its color at every step. Palette colors promise 3:1 against the background (enough
  for lines); a series label is text, so it is drawn in its series color darkened (lightened on a
  dark background) until it reaches the 4.5:1 that `check` requires. Neutral colors and text sizes come from theme tokens;
  tick, label and axis text use `--sd-font-size-label` (at least `--min-audience-font`).
- **Errors.** A column that the data does not have fails the element with
  `column '<name>' not found in <data> (columns: …)`, shown on the slide.
- `anchor("series:<name>")` returns the canvas-pixel box `{x, y, w, h}` of a shown series, else `null`.

Markup: `svg.sd-chart-line`; each line is `path.sd-line[data-series="<name>"]`, ticks are
`g.tick > text`, annotations `g.sd-annotation`, labels `text.sd-series-label[data-label]`. With `points`: `g.sd-points` holding
`circle.sd-dot[data-series]` (`.sd-dot-hollow` after the forecast start). With `forecast`: `g.sd-forecast` holding
`rect.sd-forecast-region`, `g.sd-forecast-divider` (the rule and its label) and `path.sd-forecast-line[data-forecast]`;
the band's forecast part is `path.sd-band.sd-band-forecast`.

See `example.js` for a slide that uses it.
