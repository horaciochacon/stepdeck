# gallery.slope

A slope chart: one line per category from its value in the `left` column to its value in the `right` column, with a dot and a direct label at each end. It is a deck component of the gallery, written to show that the chart pieces the engine hands every component are enough for a chart of your own: `index.js` uses only `ctx.chart`, `ctx.motion`, `ctx.palette`, `ctx.tokens`, `ctx.stepProps`, `ctx.format`, `ctx.d3` and `ctx.animate`, and has no `import`, so it works wherever the engine's files live. It is about 100 lines.

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `data` | string | (required) | snap | A CSV file, relative to the deck root, with one row per category. |
| `category` | string | (required) | snap | The column naming each row's category. |
| `left` | string | (required) | tween | The column of the values at the left end. |
| `right` | string | (required) | tween | The column of the values at the right end. |
| `highlight` | string | none | fade | A category to keep in colour; the others turn to the theme's dim colour. |
| `format` | string | from the scale | snap | A d3-format specifier for the values, such as `".0%"`. |

Each end is headed by its column's name without a letter prefix before a number, so `y2010` reads 2010 (a column named `2010` reads the same).

## How it moves

- **One scale for every step.** The value scale is the extent of `left` and `right` at every step of the slide (`extentOf` over `ctx.stepProps`), so a step that switches a column moves the dots, never the scale. The margins come from the longest label of any step, so the two ends stay put too.
- **A played column change is one morph.** The dots slide, the lines tilt, the values count, and each side's labels slide to their new rank: `rank(…, "-value")` orders them and `spread` keeps them a line apart.
- **`highlight`** turns the other categories to `--sd-color-dim` (their labels to `--sd-color-muted`) with `focusPaint`, over `--sd-duration-fast` with `tweenColor`, and draws the highlighted category on top. Opacity never changes.
- **Its own entrance** (`"x-enter": "own"`). When the chart appears on a step, its lines draw from left to right (`undraw`, then `ctx.animate.drawPath`, timed by `entrance`) while its box stays still.
- Jumps, backward moves and the first render draw the end state at once. A played step ends exactly where a jump does: `check --played` passes.

Colours come from the theme's categorical palette, one per category in data order (they repeat after the palette's last colour, so order the rows to keep repeats apart); label text is the same colour darkened or lightened to 4.5:1 with `textColor`. A blank cell is missing: no dot, no label and no line for it, never a zero.

Try it: copy this folder to your deck's `components/`, add `"gallery.slope"` to `components` in `deck.js`, copy `example.js` to `slides/custom-slope.js` with a `data/slope.csv` of your own, and add `"custom-slope"` to `slides`. [Build a chart from the engine's pieces](../../../../docs/guide/custom-components.md#build-a-chart-from-the-engines-pieces) explains each piece.
