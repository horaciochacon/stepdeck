# chart.bar

Horizontal or vertical bars from a CSV, one per category, with the value written at the end of each bar.
Built for step-by-step reveals: the value axis stays put, categories can appear one by one, switching `y`
shrinks or grows the bars, and an optional interval whisker is drawn after its bar. With `mode: "waterfall"` the
same rows are contributions that add up to a running total (see Waterfall); with `mode: "back-to-back"` two groups'
bars extend left and right of a centre rule, as in a population pyramid (see Back-to-back).

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `data` | string | (required) | snap | CSV path relative to the deck root. One row per category. |
| `x` | string | (required) | snap | Category column. Its text labels the band. A category may appear in one row only. |
| `y` | string | (required) | tween | Numeric value column. A change tweens every bar to its new length. |
| `interval` | `{lower, upper}` | none | tween | Columns of a whisker at each bar's end (e.g. an uncertainty interval). Drawn after its bar. |
| `format` | `{x?, y?}` | see below | snap | d3-format specs, localized by the deck language: `y` for value labels, ticks and the interval text, `x` for numeric categories. |
| `axes` | `{x?, y?}` | none | snap | Axis titles: `x` names the category axis, `y` the value axis, whichever way the bars point. |
| `orient` | `"horizontal"` \| `"vertical"` | `"horizontal"` | snap | Categories down the left (bars point right) or along the bottom (bars point up). |
| `sort` | `"none"` \| `"value"` \| `"-value"` \| `{by, order?}` \| string[] | `"none"` | tween | Order of the bars: the data order, by `y` (lowest or highest first), by another column, or a list of categories first. See Sorting. |
| `mode` | `"bars"` \| `"waterfall"` \| `"back-to-back"` | `"bars"` | tween | `bars`: every bar stands on zero. `waterfall`: the bars stack into a running total over the shown bars. See Waterfall. A change between the two morphs each bar. `back-to-back`: two groups left and right of a centre rule (horizontal only); a change to or from it snaps. See Back-to-back. |
| `total` | `true` \| string | none | fade | Waterfall only: a last bar from zero to the sum, labelled "Total" (`true`) or with the string. |
| `invert` | boolean | `false` | fade | Waterfall only: swaps the colours of increases and decreases. |
| `group` | string | none | snap | Back-to-back only: the column naming each row's group. Exactly two values, one row per category and group. |
| `groups` | `[left, right]` | data order | snap | Back-to-back only: the two values of `group`, left side first. |
| `shown` | string[] | all categories | draw | Categories to show, by name. A category that appears grows from zero, then draws its whisker. |
| `highlight` | string | none | fade | One category emphasised; the other bars turn the theme's dim color (`--sd-color-dim`) and sit below it. Use `only` so it lasts one step. Back-to-back: a category or a group. |
| `domain` | `[min, max]` | from the data | tween | Fixed value axis, used as given. Back-to-back: each side runs from zero to the larger magnitude of the two. |
| `types` | `{column: type}` | guessed | snap | CSV column types for the loader (`string`, `number`, `date`). |

Behaviour:
- **Fixed value axis.** With `domain` the axis is exactly that. Without it the axis spans
  `[min(0, every y and interval value), max(...)]` over **every row** of the data, shown or not, rounded outward to
  tick values. It moves only when `y`, `interval` or `domain` change, and then it tweens. (A waterfall's axis covers
  its running totals instead: see Waterfall.) For "weeks shrinking to
  days", keep both durations in one unit in two columns, switch `y` between them and set `domain` so the shrink is visible.
- **Sorting.** `sort` orders the bands (`rank` in `core/chart.js`): `"none"` keeps the data order; `"value"` runs by
  `y`, lowest first, and `"-value"` highest first; `{ by, order }` orders by another column (ascending unless `order`
  is `"desc"`); a list of categories puts those first, in that order, and the rest after them in data order. Ties
  keep the data order and a bar with no value comes last whichever way it runs. `sort` changes the order and nothing
  else: the value axis and the margins do not change with it. An unknown column or category fails the element with
  `rank`'s message.
- **Hidden categories keep their band.** Bands follow the sorted order (the data order without `sort`) whether or not a
  category is shown: every category is ranked, then the hidden ones are hidden. A hidden category is laid out at its
  final length and hidden with `visibility` (bar, whisker, value label and its category label), so nothing reflows
  between steps.
- **Waterfall** (`mode: "waterfall"`). The rows, in display order (after `sort`), are contributions; `y` may be
  negative. Each bar runs from the running total before it to the running total after it, counting **shown bars
  only**: a hidden category keeps its band but adds nothing (it is a point on the running total of its slot, hidden),
  so the bars and the total always add up what is on screen, and when an earlier category appears the later bars'
  bases move to make room for it.
  - Dotted connectors (`line.sd-connector`, quiet) join each shown bar's end to the next shown bar, and the last one to
    the total.
  - `total: true` adds a last bar from zero to the sum, in `--sd-color-ink`, labelled with the engine string `total`
    ("Total", also in Spanish); `total: "<label>"` labels it with that text. Its band is kept on every step of a slide
    that shows a total at some step, so it fades in and out without moving the other bars.
  - Increases take the diverging palette's `high` role colour and decreases its `low` role colour (its last and first
    colours in a palette without roles); `invert: true` swaps them, for a chart where a reduction is the good news.
    `highlight` dims the other bars and the total.
  - Value labels are signed (`+12`, `−15`) through the same format (`format.y` with a `+` sign, unless it names its
    own sign); the total's label is not. Each label sits past its bar's end, or inside the bar against its end, or past
    its start, whichever fits first (`fit` in `core/chart.js`); the side is chosen at rest and kept through a motion.
    A waterfall keeps a label's room on both sides of the plot (left and right of it, or above and below it, with the
    band labels set back by that room), so within its axis every label fits past its bar's end, outside the bar.
  - The value axis covers every running total, the total and the whiskers of **every waterfall step of the slide**
    (each with its own `y`, `sort`, `shown` and `total`, from `ctx.stepProps`, over the same `data`), with zero, rounded
    outward to tick values; `domain` overrides it. So nothing a step shows or re-orders moves the axis.
  - `interval` draws each contribution's whisker on its running total: from start + lower to start + upper.
  - Every category needs a value, shown or not: an empty one fails the element with
    `waterfall needs a value for every category: '<key>' is empty` (it would otherwise be drawn as no change).
  - A slide that is a waterfall at any step lays out like one at every step (the label room, the total's band, margins
    wide enough for every step's axis), so a `mode` change moves the bars and never the frame.
  - The total bar's key is `__total`: with a total, a category of that name is an element error naming it.
- **Back-to-back** (`mode: "back-to-back"`, horizontal only). Long data: one row per category (`x`) and group (`group`),
  as demographic data usually comes. `group` needs exactly two values; `groups: [left, right]` orders them (else the
  data order). One band per category: the left group's bar extends left of a centre rule (`line.sd-centre-rule`, in
  ink) and the right group's to the right.
  - The value ticks run out from the rule on both sides and read as magnitudes (`10 5 0 5 10`). Without `domain` the
    axis is mirrored, from zero to the largest value or drawn interval bound of **every back-to-back step of the
    slide** (each with its own `y` and `interval`, from `ctx.stepProps`, over the same `data`), rounded outward to tick
    values; with `domain`, each side runs from zero to its larger magnitude. So nothing a step shows, sorts or switches
    moves the axis.
  - Each side has a title above it (`text.sd-side-title[data-side]`), the group's name in its colour: the categorical
    palette's first colour on the left and its second on the right, darkened (or lightened) as text until it reaches
    4.5:1 on the background (`textColor` in `core/color.js`). The bars use the palette colours as they are.
  - `interval` draws each bar's whisker on a narrow background halo (`halo` in `core/chart.js`), so it reads over the
    bar's fill. Value labels sit past the whisker, on the bar's own side, and show magnitudes.
  - `highlight` names a category (every other band dims, on both sides) or a group (the other side dims, and its title
    turns `--sd-color-muted`). A name that is both a category and a group is an element error.
  - `sort` ranks the bands by the sum of the two sides; `{ by }` sums that column the same way (a text column, such as
    the category itself, counts where both rows agree). A category with a side missing has no sum and comes last.
  - `shown` lists categories; a hidden category hides both its bars and keeps its band. An empty `y` cell draws no bar
    and no label on that side.
  - Every category needs one row for each group, and every value and drawn bound must be zero or more. Rows with an
    empty category or group are skipped.
  - A change of `mode` to or from `back-to-back`, or of `group` or `groups`, snaps: the data shapes differ.
- **Entrance.** The chart builds its own entrance (`"x-enter": "own"` in its schema): when the element appears on
  an animated step, every shown bar grows from zero and then draws its whisker, over 2 × `--sd-duration` or the
  element's `enter.duration`, while its box stays still. It waits for its stagger slot like any entering element,
  and the zero-length bars are in place the moment it shows. With `enter: "none"`, or a box motion such as
  `enter: "rise"`, the bars are at full length at once (the box moves instead).
- **Motion** (forward by exactly one step only; any other move renders directly):
  - a category that appears grows from zero, then its whisker is drawn out of the bar's end, and its label follows
    the bar; a category that leaves does the reverse;
  - a changed value tweens the bar, its whisker and its label;
  - a changed `sort` slides every bar, with its category label, whisker and value label, from its old band to its new
    one in the same motion; a bar that appears on that step grows in at its final band while the others slide;
  - `highlight` tweens the colors of the other bars to `--sd-color-dim` (and their value labels to `--sd-color-muted`)
    over `--sd-duration-fast`, and draws the emphasised bar after (above) the others. Opacity is never used, so label
    contrast does not drop.
  - in a waterfall every bar's start and end tween over the whole motion: a category that appears grows from the
    running total before it while the later bases move up, one that leaves shrinks to the running total, a `y` change
    re-tweens bars, bases and connectors together, and a `sort` change slides the bars while their bases follow the
    new order. Connectors follow their bar's end; new ones fade in. `total` fades in or out in its band, and `invert`
    tweens the colours like `highlight`. The owned entrance grows the whole waterfall out of zero, so it stays joined.
  - `bars` ↔ `waterfall` morphs each bar between standing on zero and floating on its running total (whisker
    included), with the colours and the axis; the connectors and the total fade.
  - back-to-back bars grow out of the centre rule, slide to a new band together on a `sort` change, and tween their
    colours, and the side titles', on a `highlight` change.
  - Motion goes through `ctx.animate.tween` bound to `info.signal`: an aborted step snaps to its end state.
- **Idempotent.** Every `update` ends by writing the target state from props and rows alone; the component writes
  attributes only (never inline styles), so the markup after playing equals the markup after jumping.
- **Labels.** Value labels sit past the bar's end (past the whisker when there is one). Without `format.y` they show
  the value as it is, and ticks use a fixed precision from the tick step. Category labels sit on the band axis; long
  names wrap inside it. Everything is at least `--sd-min-audience-font` (it uses `--sd-font-size-label`). Margins come
  from character counts, not measured text; the room kept for value labels comes from the widest label over every
  numeric column but the category (and the domain ends), not from the current `y`, so switching `y` never resizes the plot.
- **Colors.** Bars use the first color of `ctx.palette("categorical")` (a waterfall's, the diverging palette's roles; back-to-back, its first two). Dimmed bars use `--sd-color-dim` (`--sd-color-rule` in a
  theme without it), dimmed labels `--sd-color-muted`; ink, grid and axis colors are theme tokens.
- **Errors.** Each of these fails the element with a message that names it, shown on the slide: a column the data
  lacks (`column '<name>' not found in <data> (columns: …)`), a category that appears in two rows, a category in
  `shown`, `highlight` or a `sort` list that the data does not have, a `sort` column the data lacks, a `sort` of no
  valid form, a `domain` that is not `[min, max]` with min < max, an empty value in a waterfall, and a category named
  `__total` in a chart with a total. Back-to-back adds: `` `group` column '<g>' has <n> values (back-to-back needs
  exactly two) ``, `category '<k>' has no '<group>' row` (also for a name in `groups` the data lacks), `category '<k>'
  has more than one '<group>' row`, `` '<name>' in `highlight` is both a category and a group ``, a `highlight` that
  is neither, `groups` naming one group twice, a value or drawn bound below zero, and `back-to-back bars are horizontal
  only`.
  `validate` also checks the columns `x`, `y`, `interval` and (back-to-back) `group` name, at every step, gives a misspelt `mode` a
  did-you-mean, warns (`chart-prop-unused`) when `invert` or `total` is set without `mode: "waterfall"`, and fails
  (`chart-orient`) a back-to-back chart with `orient: "vertical"`.
- **Accessibility.** Each bar carries a `<title>` with its category, value and interval, formatted like the labels
  (so a Spanish deck reads `12,5 (10,5 – 14,5)`).

Markup: `svg.sd-chart-bar[data-orient]`; each category is `g.sd-bar-group[data-key][data-visible][data-dim]`
holding `rect.sd-bar`, `g.sd-whisker` and `text.sd-bar-label`; the value axis is `g.sd-axis-value > g.tick`, the
category labels `text.sd-band-label[data-key]`. A waterfall adds `data-mode="waterfall"` on the svg,
`g.sd-connectors > line.sd-connector[data-key]` (one per bar a connector leaves) before `g.sd-bars`, and the total
as `g.sd-bar-group[data-key="__total"]` with its `text.sd-band-label[data-key="__total"]`. Back-to-back adds
`data-mode="back-to-back"`, two groups per category (`g.sd-bar-group[data-key][data-side="left|right"]`, each
whisker line with a `line.sd-halo-under` copy before it), the class `sd-centre-rule` on `line.sd-axis-line`, and
`text.sd-side-title[data-side]` after the axis titles.

See `example.js` for a slide that uses it.
