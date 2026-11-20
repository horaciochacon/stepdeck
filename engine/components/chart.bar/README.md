# chart.bar

Horizontal or vertical bars from a CSV, one per category, with the value written at the end of each bar.
Built for step-by-step reveals: the value axis stays put, categories can appear one by one, switching `y`
shrinks or grows the bars, and an optional interval whisker is drawn after its bar.

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `data` | string | (required) | snap | CSV path relative to the deck root. One row per category. |
| `x` | string | (required) | snap | Category column. Its text labels the band. A category may appear in one row only. |
| `y` | string | (required) | tween | Numeric value column. A change tweens every bar to its new length. |
| `interval` | `{lower, upper}` | none | tween | Columns of a whisker at each bar's end (e.g. an uncertainty interval). Drawn after its bar. |
| `format` | `{x?, y?}` | see below | snap | d3-format specs, localized by the deck language: `y` for value labels, ticks and the interval text, `x` for numeric categories. |
| `axes` | `{x?, y?}` | none | snap | Axis titles: `x` names the category axis, `y` the value axis, whichever way the bars point. |
| `orient` | `"horizontal"` \| `"vertical"` | `"horizontal"` | snap | Categories down the left (bars point right) or along the bottom (bars point up). |
| `shown` | string[] | all categories | draw | Categories to show, by name. A category that appears grows from zero, then draws its whisker. |
| `highlight` | string | none | fade | One category emphasised; the other bars turn the theme's dim color (`--sd-color-dim`) and sit below it. Use `only` so it lasts one step. |
| `domain` | `[min, max]` | from the data | tween | Fixed value axis, used as given. |
| `types` | `{column: type}` | guessed | snap | CSV column types for the loader (`string`, `number`, `date`). |

Behaviour:
- **Fixed value axis** (spec §10.4). With `domain` the axis is exactly that. Without it the axis spans
  `[min(0, every y and interval value), max(...)]` over **every row** of the data, shown or not, rounded outward to
  tick values. It moves only when `y`, `interval` or `domain` change, and then it tweens. For "weeks shrinking to
  days", keep both durations in one unit in two columns, switch `y` between them and set `domain` so the shrink is visible.
- **Hidden categories keep their band.** Bands follow the data order whether or not a category is shown; a hidden
  category is laid out at its final length and hidden with `visibility` (bar, whisker, value label and its category
  label), so nothing reflows between steps.
- **Entrance.** The chart builds its own entrance (`"x-enter": "own"` in its schema): when the element appears on
  an animated step, every shown bar grows from zero and then draws its whisker, over 2 × `--sd-duration` or the
  element's `enter.duration`, while its box stays still. It waits for its stagger slot like any entering element,
  and the zero-length bars are in place the moment it shows. With `enter: "none"`, or a box motion such as
  `enter: "rise"`, the bars are at full length at once (the box moves instead).
- **Motion** (forward by exactly one step only; any other move renders directly):
  - a category that appears grows from zero, then its whisker is drawn out of the bar's end, and its label follows
    the bar; a category that leaves does the reverse;
  - a changed value tweens the bar, its whisker and its label;
  - `highlight` tweens the colors of the other bars to `--sd-color-dim` (and their value labels to `--sd-color-muted`)
    over `--sd-duration-fast`, and draws the emphasised bar after (above) the others. Opacity is never used, so label
    contrast does not drop.
  - Motion goes through `ctx.animate.tween` bound to `info.signal`: an aborted step snaps to its end state.
- **Idempotent.** Every `update` ends by writing the target state from props and rows alone; the component writes
  attributes only (never inline styles), so the markup after playing equals the markup after jumping.
- **Labels.** Value labels sit past the bar's end (past the whisker when there is one). Without `format.y` they show
  the value as it is, and ticks use a fixed precision from the tick step. Category labels sit on the band axis; long
  names wrap inside it. Everything is at least `--sd-min-audience-font` (it uses `--sd-font-size-label`). Margins come
  from character counts, not measured text; the room kept for value labels comes from the widest label over every
  numeric column but the category (and the domain ends), not from the current `y`, so switching `y` never resizes the plot.
- **Colors.** Bars use the first color of `ctx.palette("categorical")`. Dimmed bars use `--sd-color-dim` (`--sd-color-rule` in a
  theme without it), dimmed labels `--sd-color-muted`; ink, grid and axis colors are theme tokens.
- **Errors.** Each of these fails the element with a message that names it, shown on the slide: a column the data
  lacks (`column '<name>' not found in <data> (columns: …)`), a category that appears in two rows, a category in
  `shown` or `highlight` that the data does not have, and a `domain` that is not `[min, max]` with min < max.
  `validate` also checks the columns `x`, `y` and `interval` name, at every step.
- **Accessibility.** Each bar carries a `<title>` with its category, value and interval, formatted like the labels
  (so a Spanish deck reads `12,5 (10,5 – 14,5)`).

Markup: `svg.sd-chart-bar[data-orient]`; each category is `g.sd-bar-group[data-key][data-visible][data-dim]`
holding `rect.sd-bar`, `g.sd-whisker` and `text.sd-bar-label`; the value axis is `g.sd-axis-value > g.tick`, the
category labels `text.sd-band-label[data-key]`.

See `example.js` for a slide that uses it.
