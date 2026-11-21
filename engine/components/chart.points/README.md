# chart.points

Estimates by category from a CSV, one row each: a dot with an optional interval whisker and its value written
beside it, against a value axis and an optional reference line. Built for step-by-step stories: the axis stays put,
rows can appear one by one out of the reference line, one row can be emphasized, and an empty cell reads "no data".

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `data` | string | (required) | snap | CSV path relative to the deck root. One row per category. |
| `x` | string | (required) | snap | Category column. Its text labels the row. A category may appear in one row only. |
| `y` | string | (required) | tween | Estimate column. A change moves every dot to its new value. An empty cell shows "no data". |
| `interval` | `{lower, upper}` | none | tween | Columns of a whisker through each dot (e.g. a 95% interval). A row without both bounds has none. |
| `format` | `{x?, y?}` | see below | snap | d3-format specs, localized by the deck language: `y` for value labels, ticks and the interval text, `x` for numeric categories. |
| `axes` | `{x?, y?}` | none | fade | Axis titles: `x` above the category labels, `y` under the value axis. |
| `types` | `{column: type}` | guessed | snap | CSV column types for the loader (`string`, `number`, `date`). |
| `domain` | `[min, max]` | from every step | tween | Fixed value axis, used as given. An estimate outside it is an error. |
| `shown` | string[] | all categories | draw | Categories to show, by name. A row that appears grows out of the reference line, then draws its whisker. |
| `highlight` | string | none | fade | One category emphasized; the other rows turn the theme's dim color (`--sd-color-dim`). Use `only` so it lasts one step. |
| `reference` | number \| `{value, label?}` | none | fade | A dashed line across every row, such as an average or a target, with an optional label above the plot. |

Behaviour:
- **Fixed value axis.** With `domain` the axis is exactly that. Without it the axis spans `y` and both interval
  columns of **every step** of the slide (the props each step resolves to, read from the same data file), plus every
  step's `reference`, rounded outward to tick values. Zero is not forced. So switching `y` between steps moves the
  dots and never the axis.
- **Rows keep their place.** Rows follow the data order whether or not they are shown; a hidden row is laid out
  where it will be and hidden with `visibility` (dot, whisker, value label and category label). The room for an
  axis title, a labelled reference or the tick labels of a step's own `domain` is kept at every step of the slide,
  so the plot never resizes.
- **Missing values.** A row whose `y` cell is empty keeps its category label and shows "no data" (`sin datos` in a
  Spanish deck) in the muted color, with no dot, whisker or value label: never a dot at zero.
- **Entrance.** The chart builds its own entrance (`"x-enter": "own"` in its schema): when the element appears on
  an animated step, every shown dot grows out of the origin and then draws its whisker outward, over 2 ×
  `--sd-duration` or the element's `enter.duration`, while its box stays still and the axis, labels and reference
  show at once. The origin is the reference value when it is inside the axis, else 0 when it is inside the axis,
  else the axis start. With `enter: "none"`, or a box motion such as `enter: "rise"`, the rows are drawn at once.
- **Motion** (forward by exactly one step only; any other move renders directly):
  - a changed `y`, `interval` or `domain` tweens the dots, whiskers and value labels, and the axis (ticks that stay
    move, new ones fade in, dropped ones fade out);
  - a row that appears grows out of the origin, as in the entrance; a row that leaves does the reverse;
  - a value that becomes empty shrinks where it is while "no data" fades in, and the reverse;
  - `highlight` tweens the other rows' dots and whiskers to `--sd-color-dim` and their value labels to
    `--sd-color-muted` over `--sd-duration-fast`. Opacity is never used, so label contrast does not drop;
  - `reference` and the axis titles fade in, out, or across to a new value or text.
  - Motion goes through `ctx.animate.tween` bound to `info.signal`: an aborted step snaps to its end state.
- **Idempotent.** Every `update` ends by writing the target state from props and rows alone; the component writes
  attributes only (never inline styles), so the markup after playing equals the markup after jumping.
- **Labels.** A value label sits past the upper end of its whisker (or its dot) when it fits inside the chart, else
  past the lower end; only when neither fits does it sit inside the whisker. Each has a background halo.
  Without `format.y` value labels show the value as it is, and ticks use a fixed precision from the tick step.
  Category labels sit left of the plot and wrap. Everything is at least `--sd-min-audience-font` (it uses
  `--sd-font-size-label`). Margins come from character counts, not measured text.
- **Layout.** The chart fills the room its region leaves (like `chart.line` and `chart.bar`), so a source line can
  share the region.
- **Colors.** Dots use the first color of `ctx.palette("categorical")`; whiskers and value labels the ink color.
  Out of focus, dots and whiskers use `--sd-color-dim` (`--sd-color-rule` in a theme without it) and value labels
  `--sd-color-muted`.
- **Errors.** Each of these fails the element with a message that names it, shown on the slide: a column the data
  lacks (`column '<name>' not found in <data> (columns: …)`), a category that appears in two rows, a category in
  `shown` or `highlight` that the data does not have, an estimate outside a given `domain`
  (``estimate '<k>' (<value>) is outside `domain` [<a>, <b>]``), and a `domain` that is not `[min, max]` with
  min < max. `validate` also checks the columns `x`, `y` and `interval` name, at every step. An interval bound
  past a given `domain` is not an error: the whisker is cut at the axis end. A `reference` past it is not drawn.
- **Accessibility.** Each row carries a `<title>` with its category, value and interval, formatted like the labels
  (so a Spanish deck reads `12,4 (9,8 – 15,1)`), or "no data".

Markup: `svg.sd-chart-points`; each category is `g.sd-points-row[data-key][data-visible][data-dim]` (placed by
`transform`) holding `title`, `g.sd-whisker` (its line on a `.sd-halo-under` copy), `circle.sd-dot` and
`text.sd-points-value`, or `text.sd-no-data`; the category labels are `g.sd-points-labels > text.sd-points-label[data-key]`;
the value axis is `g.sd-axis-value > g.tick`; the reference is `g.sd-references > g.sd-reference` (`line.sd-rule`,
`text.sd-rule-label`).

See `example.js` for a slide that uses it.
