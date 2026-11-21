# chart.line

A line chart of one or more series over a numeric x, labelled directly at the end of each line.
Built for step-by-step reveals: series draw in, one series can be highlighted for a step,
annotations fade in, changing `y` morphs every line point by point, point markers and a dotted forecast segment fade in, `until` sweeps the lines along the x axis behind a cursor with a counting ticker, and `draws` paints a fan of uncertainty draws under the lines that grows and shrinks with `draws.shown`.

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
| `until` | number | none | tween | Shows lines, bands, points and the forecast only up to this x, cut exactly there; the x axis never changes. Played forward, the lines sweep from the old value to the new one (extending, or retracting when `until` is lowered) behind a vertical cursor; a jump or a backward move snaps. |
| `ticker` | boolean | `false` | snap | With `until`, a large label of the current x (`format.x`) in the plot's upper left, counting through the sweep and resting on `until`. Without `until` it does nothing (`validate` warns). |
| `draws` | `{data, id, shown, seed?}` | none | tween | A fan of uncertainty draws from the CSV `data` (the chart's `x`, `y`, `series` columns and the draw column `id`): the first `shown` of a fixed order of the ids (`seed`, default 1), painted on a canvas under the lines in their series' color and cut at `until`. A played change of `shown` fades draws in and out. |

Behaviour:
- **Idempotent.** Every `update` ends by writing the target state straight from props, so the DOM
  after `settled()` is identical whether the state was jumped to or played step by step.
- **Entrance.** The chart builds its own entrance (`"x-enter": "own"` in its schema): when the element appears on
  an animated step, its lines draw along their length over 2 × `--sd-duration` or the element's `enter.duration`,
  while its box stays still; axes, labels, bands and annotations show at once. It waits for its stagger slot like
  any entering element, and the lines are undrawn the moment it shows. With `enter: "none"`, or a box motion such
  as `enter: "rise"`, the chart is drawn at once (the box moves instead).
- **Morph**: the component's own keyed join. Series are keyed by name, points by
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
- **Sweep.** `until` cuts every line, band, dot and forecast part at that x (the last segment interpolated; a data point on it
  is shown once). Before the first x nothing is drawn and there is no error; after the last x the whole chart is. A line or band
  of fewer than two points draws nothing. A played forward change of `until` runs one morph: each frame cuts the tweened points at
  the sweep's position, from the old `until` (the x axis's end when there is none) to the new one, and draws
  `line.sd-sweep-cursor` there; it exists only during the motion. The ticker, `text.sd-ticker`, shows `format.x` of the position,
  and of `until` at rest, in `--sd-font-size-heading`. Series labels sit after each line's visible end (in the right margin once
  it reaches the plot's end), and a label that would start under the ticker moves below it. With a forecast, the shaded region
  runs from the divider to the cut.
- **Draw fan.** `draws` paints the first `draws.shown` ids of `drawOrder(ids, seed)` (`core/chart.js`), so raising `shown` keeps
  the draws already shown and adds more, and the same props always paint the same draws. Each draw is a line on a canvas layer
  under the SVG, in its series' color (the ink without `series`; `--sd-color-dim` with the series under `highlight`), cut at
  `until`; an empty value breaks it. Its opacity is `clamp(1.9 / √n, 0.06, 0.85)` and its width a fixed multiple of the line's
  stroke width (0.5 for n ≤ 20, 0.4 for n ≤ 200, 0.3 above) for n draws shown, and the summary lines sit on a narrow halo. The y
  domain also covers every draw of every draws file a step of the slide with the same `y` names (`ctx.stepProps`), so the axis
  does not move when the fan appears. A played change is one morph that repaints the canvas each frame: new draws fade in from 0, kept draws go to
  the new opacity and width, removed draws fade out; the end state is painted from props, so it equals a jump pixel for pixel.
  At most 2000 draws and 500 x values per series. The canvas carries `data-draws`, `data-until`, `data-seed` and
  `data-signature` (`paintLines`' signature of what is painted).
- **Colors** come from `ctx.palette("categorical")` in order of first appearance in the data, so a
  series keeps its color at every step. Palette colors promise 3:1 against the background (enough
  for lines); a series label is text, so it is drawn in its series color darkened (lightened on a
  dark background) until it reaches the 4.5:1 that `check` requires. Neutral colors and text sizes come from theme tokens;
  tick, label and axis text use `--sd-font-size-label` (at least `--min-audience-font`).
- **Errors.** A column that the data does not have fails the element with
  `column '<name>' not found in <data> (columns: …)`, shown on the slide; so does a column the draws file lacks. A fan
  fails with `` `draws.shown` is <n> but <data> has only <m> draws ``, `<data> has <m> draws (at most 2000)` or
  `<data> has <k> x values for series '<s>' (at most 500)`.
- `anchor("series:<name>")` returns the canvas-pixel box `{x, y, w, h}` of a shown series, else `null`.

Markup: `svg.sd-chart-line`; each line is `path.sd-line[data-series="<name>"]`, ticks are
`g.tick > text`, annotations `g.sd-annotation`, labels `text.sd-series-label[data-label]`. With `points`: `g.sd-points` holding
`circle.sd-dot[data-series]` (`.sd-dot-hollow` after the forecast start). With `forecast`: `g.sd-forecast` holding
`rect.sd-forecast-region`, `g.sd-forecast-divider` (the rule and its label) and `path.sd-forecast-line[data-forecast]`;
the band's forecast part is `path.sd-band.sd-band-forecast`. With `ticker`: `text.sd-ticker`; while a sweep plays: `line.sd-sweep-cursor`.
With `draws`: `canvas.sd-canvas-layer` as the element's first child (before the SVG), and a `.sd-halo-under` copy just before
each `path.sd-line` and `path.sd-forecast-line`.

See `example.js` for a slide that uses it.
