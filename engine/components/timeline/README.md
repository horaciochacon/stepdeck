# timeline

A track between stops that fills. Each stop lights up as the fill passes it. It also works as the progress
connector between two parts of a story ("agent's report -> our study"). Labels and subs are inline Markdown.

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `stops` | `[{ id?, label, sub?, at? }]` | (required) | snap | At least 2 stops. `label` and `sub` are inline Markdown (emphasis, code, links); raw HTML is shown as text. `id` is unique and defaults to the index as a string. `at` (0 to 1, increasing) places a stop; it defaults to the even position `index / (stops - 1)`. |
| `progress` | number 0..1 | (required) | tween | How far the fill has gone, as a position on the track from 0 to 1, the same scale as a stop's `at` (not a count of stops). With evenly spaced stops 0 is the first stop and 1 the last. A stop is lit once `progress >= at`. |
| `dashed` | boolean | `false` | snap | The unfilled track is dashed; the fill stays solid. |
| `orient` | `"horizontal"` | `"horizontal"` | snap | A one-value prop: `horizontal` is the only value, and there is no vertical timeline. Setting it changes nothing (the component never reads it), so leave it out; any other value is a `validate` error. |
| `current` | string | none | fade | The id of one stop to emphasise: a larger circle and a bold label. An unknown id is an element error naming it. |

Behaviour:
- **Driven by props only.** The component never reads the slide's step. Set `progress` and `current` per step with
  `advance` (`advance: { prop: "progress", values: [0, 0.5, 1], start: "start" }`) or with `set` on a step.
- **Entrance.** The timeline builds its own entrance (`"x-enter": "own"` in its schema): when the element appears on an
  animated step, its box stays still and it plays the build from an empty track to the state of that step. The fill runs
  from the start to `progress`, lighting each stop as it passes; then the `current` stop grows and its label fades in.
  It waits for its stagger slot like any entering element, and its fill and current stop are reset the moment it shows.
  With `enter: "none"`, or a box motion such as `enter: "rise"`, the timeline shows its state at once (the box moves
  instead).
- **Change motion** (forward by exactly one step only; any other move renders directly): while the timeline stays shown,
  the fill tweens from the previous progress to the new one over `--sd-duration` (or the step's `transition`), and each
  stop fills in (or goes hollow) as the fill passes it; a new `current` grows its circle and fades its label in
  (the shared `fade` motion) at the same time. Going backward retracts the fill with no motion.
- **Idempotent.** Every `update` writes the state straight from the props first and removes the inline styles the
  motion used, so the markup after playing equals the markup after jumping.
- **Look.** The track uses the theme's rule color and the fill its accent color. Stops are circles on the track: filled
  with the accent once reached, hollow before. Labels sit under the track at the note size, subs at the label size,
  both at least `--sd-min-audience-font`.
- **Size.** The timeline is as wide as its element (its region, or a `box`) and as tall as its content; it has no
  size prop. What sets the rest: the stop radius is 1.5 × `--sd-grid` (2.25 × for the `current` stop), the track
  and fill are 2 × `--sd-rule-width` thick, labels are `--sd-font-size-note` and subs `--sd-font-size-label`. To
  make one timeline larger, set those tokens in the slide's `style`. The radii are read from the canvas, so
  `--sd-grid` must be set on `:scope` (it then applies to the whole slide); the others may be set on the element:
  `style: ':scope { --sd-grid: 16px; --sd-rule-width: 4px; } [data-el="<id>"] { --sd-font-size-note: 48px; --sd-font-size-label: 36px; }'`.
- **Layout.** Each stop gets a label slot as wide as the closest pair of stops allows, and the track is inset by half a
  slot at both ends, so the first and last labels stay inside the element. Long labels wrap inside their slot; the
  element is as tall as its tallest label (measured bold, so nothing moves when `current` changes).
- **Errors.** Fewer than 2 stops, a `progress` outside 0..1, a duplicate id, an `at` outside 0..1 or not increasing, and
  an unknown `current` each raise an element error naming the problem.

See `example.js` for a slide that uses it.
