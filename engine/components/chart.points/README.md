# chart.points

Estimates by category from a CSV, one row each: a dot with an optional interval whisker and its value written
beside it, against a value axis and an optional reference line. Built for step-by-step stories: the axis stays put,
rows can appear one by one out of the reference line, one row can be emphasized, a row can show before and after
as a pair, and an empty cell reads "no data". With `id`, a category holds many points instead: a beeswarm strip with
a summary tick, in which one item can be followed across the strips.

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `data` | string | (required) | snap | CSV path relative to the deck root. One row per category (one per point, with `id`). |
| `x` | string | (required) | snap | Category column. Its text labels the row. A category may appear in one row only, unless `id` is set. |
| `y` | string | (required) | tween | Estimate column. A change moves every dot to its new value. An empty cell shows "no data". |
| `from` | string | none | tween | Column with the earlier value of each row: a hollow dot at it, a connector, and the filled dot at `y`. See Pairs. |
| `interval` | `{lower, upper}` | none | tween | Columns of a whisker through each dot (e.g. a 95% interval). A row without both bounds has none. |
| `format` | `{x?, y?}` | see below | snap | d3-format specs, localized by the deck language: `y` for value labels, ticks and the interval text, `x` for numeric categories. |
| `axes` | `{x?, y?}` | none | fade | Axis titles: `x` above the category labels, `y` under the value axis. |
| `types` | `{column: type}` | guessed | snap | CSV column types for the loader (`string`, `number`, `date`). |
| `domain` | `[min, max]` | from every step | tween | Fixed value axis, used as given. An estimate outside it is an error. |
| `shown` | string[] | all categories | draw | Categories to show, by name. A row that appears grows out of the reference line, then draws its whisker. |
| `sort` | `"none"` \| `"value"` \| `"-value"` \| `{by, order?}` \| string[] | `"none"` | tween | Order of the rows: the data order, by `y` (lowest or highest first), by another column, or a list of categories first. See Sorting. |
| `highlight` | string | none | fade | One category emphasized; the other rows turn the theme's dim color (`--sd-color-dim`). Use `only` so it lasts one step. |
| `reference` | number \| `{value, label?}` | none | fade | A dashed line across every row, such as an average or a target, with an optional label above the plot. |
| `id` | string | none | snap | Column naming each point: every row is one point and each category a beeswarm strip. See Strips. |
| `summary` | `"median"` \| `"mean"` \| `"none"` | `"median"` | fade | Strips: the summary tick across each strip, or none. |
| `focus` | string | none | fade | Strips: one id followed across the strips (ringed, raised, joined by a line); the other dots dim. |

Behaviour:
- **Fixed value axis.** With `domain` the axis is exactly that. Without it the axis spans `y`, `from` and both
  interval columns of **every step** of the slide (the props each step resolves to, read from the same data file),
  plus every step's `reference`, rounded outward to tick values. Only what can be drawn counts: a row with an
  empty category is not shown, and a row with no `y` at a step shows "no data", so its `from` and interval bounds
  do not widen the axis. Zero is not forced. So switching `y` between steps moves the dots and never the axis.
- **Pairs.** With `from`, each row with a value in `y` and in `from` draws a hollow dot at `from` (the theme's
  background colour inside, the dot colour as its outline), a thin connector in the muted colour (`--sd-color-dim`
  out of focus) from it to the filled dot at `y`, and the value label of `y` beyond the filled dot, on the side away
  from the hollow one when it fits. A row whose `from` cell is empty shows its end dot alone: no hollow dot and no
  connector, never one at zero. A row whose `y` cell is empty shows "no data" and no pair. The title of a pair row
  reads `North: 14.2 → 10.1`. A `from` outside a given `domain` is an element error, as an estimate is. The story
  is two steps on one slide: the first has `y: "before"`, the second `set: { y: "now", from: "before" }`; played, each
  filled dot slides from its old value to the new one while the connector grows behind it and the hollow dot stays
  where the value was. A pair that appears (in `shown` or in the entrance) grows out of its `from`: the hollow dot
  grows there, the filled dot slides out to `y` and the connector follows it.
- **Strips.** With `id` each row of the data is one point (`id` names it) and a category's rows are a strip in its
  band: the dots are packed as a beeswarm (`swarm` in `core/chart.js`, over the dots' x pixels, with slots of one
  dot's diameter and offsets at most half the band less a radius), so points with close values sit apart, never on
  top of each other while the band has room. A summary tick (`line.sd-summary`, ink) runs across the strip at the
  median of all its values, or the mean (`summary: "mean"`); `"none"` draws none. A single row is a one-dot strip
  with its tick on it; equal values stack in the band; a strip with no value reads "no data". A row with an empty
  value is not drawn (never at zero) and a row with an empty id is skipped. Ids are unique within a category; the
  same id in several categories is one item. `sort` ranks the strips by their summary (the median with `"none"`), and
  `{ by }` reduces that column the same way (numerically: a text column ranks as empty). With a given `domain`, the
  points outside it are not drawn and a box at that end of the row counts them (`‹ 3` left of the plot, `3 ›` right
  of it, muted, in a frame; the margins keep room for the widest at every step, so the plot never resizes). The
  summary still counts every value, but its tick is drawn only inside the domain. `focus` follows one id: its dots
  get class `sd-focus` (an ink ring) and are raised to the end of their strip, a thin ink line on a halo
  (`path.sd-focus-join`) joins them from strip to strip in row order, skipping a strip without the item or with it
  outside the domain, and every other dot turns `--sd-color-dim` (never faded). `from` and `interval` are not drawn
  in strips, and do not widen the axis there. The strip's `<title>` reads `Norte: 22 (n = 40)`.
- **Sorting.** `sort` orders the rows (`rank` in `core/chart.js`): `"none"` keeps the data order; `"value"` runs by
  `y`, lowest first, and `"-value"` highest first; `{ by, order }` orders by another column (ascending unless
  `order` is `"desc"`); a list puts those categories first, in that order, and the rest after in data order. Ties
  keep data order, rows without a value come last whichever way it runs, and text compares by code point. Every
  category is ranked, shown or not, so a hidden row keeps its place in the order. The axis, margins and values do
  not change with `sort`. An unknown column or category fails the element with `rank`'s message.
- **Rows keep their place.** Rows follow the sorted order (the data order without `sort`) whether or not they are shown; a hidden row is laid out
  where it will be and hidden with `visibility` (dot, whisker, value label and category label). The room for an
  axis title, a labelled reference or the tick labels of a step's own `domain` is kept at every step of the slide,
  so the plot never resizes.
- **Missing values.** A row whose `y` cell is empty keeps its category label and shows "no data" (`sin datos` in a
  Spanish deck) in the muted color, with no dot, whisker or value label: never a dot at zero.
- **Entrance.** The chart builds its own entrance (`"x-enter": "own"` in its schema): when the element appears on
  an animated step, every shown dot grows out of the origin and then draws its whisker outward (strips fade in from
  left to right, each mark in turn by its place on the axis, and the focus line last), over 2 ×
  `--sd-duration` or the element's `enter.duration`, while its box stays still and the axis, labels and reference
  show at once. The origin is the reference value when it is inside the axis, else 0 when it is inside the axis,
  else the axis start. With `enter: "none"`, or a box motion such as `enter: "rise"`, the rows are drawn at once.
- **Motion** (forward by exactly one step only; any other move renders directly):
  - a changed `y`, `interval` or `domain` tweens the dots, whiskers and value labels, and the axis (ticks that stay
    move, new ones fade in, dropped ones fade out);
  - a row that appears grows out of the origin, as in the entrance (out of its `from`, for a pair); a row that
    leaves does the reverse;
  - a step that adds `from` while `y` changes slides each filled dot to its new value while the connector grows
    behind it; the hollow dot is at `from` from the first frame; one that removes it folds the pair into the dot;
  - a changed `sort` slides every row, with its category label, from its old place to its new one in the same motion;
    a row that appears at the same step is already at its final place while it grows;
  - a value that becomes empty shrinks where it is while "no data" fades in, and the reverse;
  - `highlight` tweens the other rows' dots and whiskers to `--sd-color-dim` and their value labels to
    `--sd-color-muted` over `--sd-duration-fast`. Opacity is never used, so label contrast does not drop;
  - `reference` and the axis titles fade in, out, or across to a new value or text.
  - strips: every point slides from its place to its new one, value and swarm offset alike (a point that comes or
    goes fades where it is); a strip that appears fades in from left to right, one that leaves fades out; a changed
    `summary` fades its tick across (the same statistic slides); `focus` rings and raises the item at once while the
    other dots tween to `--sd-color-dim` over `--sd-duration-fast` and the join fades in or out; overflow boxes fade
    in and out and their counts change at once.
  - Motion goes through `ctx.animate.tween` bound to `info.signal`: an aborted step snaps to its end state.
- **Idempotent.** Every `update` ends by writing the target state from props and rows alone; the component writes
  attributes only (never inline styles), so the markup after playing equals the markup after jumping.
- **Labels.** A value label sits past the upper end of its whisker (or its dot) when it fits inside the chart, else
  past the lower end; only when neither fits does it sit inside the whisker. Each has a background halo. The side
  is chosen from the row at rest (where it ends; where it started, for a row that leaves) and kept through a
  motion, so a label follows its mark and never jumps to the other side part-way.
  Without `format.y` value labels show the value as it is, and ticks use a fixed precision from the tick step.
  Category labels sit left of the plot and wrap. Everything is at least `--sd-min-audience-font` (it uses
  `--sd-font-size-label`). Margins come from character counts, not measured text; the left one keeps half of the widest tick label inside the chart.
- **Layout.** The chart fills the room its region leaves (like `chart.line` and `chart.bar`), so a source line can
  share the region.
- **Colors.** Dots (the hollow one too, as its outline) use the first color of `ctx.palette("categorical")`;
  whiskers and value labels the ink color; a pair's connector the muted color.
  Out of focus, dots, whiskers and connectors use `--sd-color-dim` (`--sd-color-rule` in a theme without it) and value labels
  `--sd-color-muted`.
- **Errors.** Each of these fails the element with a message that names it, shown on the slide: a column the data
  lacks (`column '<name>' not found in <data> (columns: …)`), a category that appears in two rows (without `id`), an
  id twice in one category (`id '<id>' appears more than once in category '<k>' of <data>`), a `focus` id the data
  does not have (`` `focus` id '<id>' not found in <data> ``; without `id` every `focus` is unknown), a category in
  `shown` or `highlight` that the data does not have, an estimate outside a given `domain`
  (``estimate '<k>' (<value>) is outside `domain` [<a>, <b>]``; the same for a `from`, ``\`from\` of '<k>' (<value>) is outside `domain` [<a>, <b>]``), and a `domain` that is not `[min, max]` with
  min < max. `validate` also checks the columns `x`, `y`, `id`, `from` and `interval` name, at every step. An interval bound
  past a given `domain` is not an error: the whisker is cut at the axis end. A `reference` past it is not drawn. In
  strips a value past it is not an error either: it is counted in the overflow box.
- **Accessibility.** Each row carries a `<title>` with its category, value and interval, formatted like the labels
  (so a Spanish deck reads `12,4 (9,8 – 15,1)`), or "no data".

Markup: `svg.sd-chart-points`; each category is `g.sd-points-row[data-key][data-visible][data-dim]` (placed by
`transform`) holding `title`, `g.sd-whisker` (its line on a `.sd-halo-under` copy), `path.sd-pair-connector` and `circle.sd-dot-hollow` (only a pair with a `from` value), `circle.sd-dot` and
`text.sd-points-value`, or `text.sd-no-data`; a strip row holds `g.sd-strip` (`circle.sd-dot[data-id]` in data order,
`line.sd-summary`, then the followed item's `circle.sd-dot.sd-focus`) and `g.sd-overflow[data-side="low"|"high"]`
(`rect.sd-overflow-box`, `text.sd-overflow-count`) instead of the estimate's marks; the category labels are
`g.sd-points-labels > text.sd-points-label[data-key]`; the value axis is `g.sd-axis-value > g.tick`; the reference is
`g.sd-references > g.sd-reference` (`line.sd-rule`, `text.sd-rule-label`); the focus join is
`g.sd-focus-joins > path.sd-focus-join` (on a `.sd-halo-under` copy), above every row.

See `example.js` for a slide that uses it.
