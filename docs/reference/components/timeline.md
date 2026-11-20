# timeline

`timeline` draws a horizontal track between labelled stops and fills it from the left. `progress` says how far the fill has gone; each stop lights up once the fill reaches it, and `current` emphasises one stop. It also works as the progress connector between two parts of a story. This page lists every prop, which stops are lit, the markup, how it moves and the errors it raises. It is for anyone writing slides by hand or reviewing what an agent wrote.

Sources: [`components/timeline/schema.json`](../../../components/timeline/schema.json), [`components/timeline/index.js`](../../../components/timeline/index.js), [`components/timeline/stops.js`](../../../components/timeline/stops.js), [`core/stepdeck.css`](../../../core/stepdeck.css). For the other components, see the [components reference](index.md).

## Use it

A track that fills over three steps, from the kit example deck (`examples/kit/slides/track.js`):

```js
{ id: "path", region: "main", type: "timeline",
  props: { progress: 0, current: "draft", stops: [
    { id: "draft", label: "First draft", sub: "written with the agent" },
    { id: "review", label: "Review", sub: "by a person" },
    { id: "final", label: "Final" },
  ] },
  advance: { prop: "progress", values: [0, 0.5, 1], start: "draft" } },
```

```js
steps: [
  { id: "draft" },
  { id: "review", set: { path: { current: "review" } } },
  { id: "final", set: { path: { current: "final" } } },
],
```

The component never reads the slide's step. [`advance`](../deck-and-slide.md#advance) gives `prop` one value per step, with `values[0]` at the `start` step; here it sets `progress` to `0`, `0.5` and `1` at the three steps, and `set` moves `current`. With three evenly spaced stops, `0.5` is exactly the middle stop, so the fill stops on `Review` at the second step.

Stops placed by date rather than evenly, with a dashed track and `current` cleared at the last step. This slide was checked with `validate`, `dump` and `check --played`:

```js
elements: [
  { id: "plan", type: "timeline",
    props: { progress: 0.1, dashed: true, stops: [
      { id: "start", label: "Kick-off", sub: "January", at: 0 },
      { id: "pilot", label: "Pilot", sub: "March", at: 0.2 },
      { id: "rollout", label: "Rollout", sub: "September", at: 0.7 },
      { id: "review", label: "Review", sub: "December", at: 1 },
    ] } },
],
steps: [
  { id: "now" },
  { id: "pilot", set: { plan: { progress: 0.2, current: "pilot" } } },
  { id: "later", set: { plan: { progress: 0.85, current: null } } },
],
```

At `now` only `Kick-off` is lit. At `pilot` the fill reaches `Pilot` (0.2 >= 0.2) and that stop grows. At `later` the fill passes `Rollout` and ends between it and `Review`; `current: null` deletes the prop (a `set` is a JSON merge patch), so no stop is emphasised.

## Props

| Prop | Type | Required | Default | Transition | Meaning |
| --- | --- | --- | --- | --- | --- |
| `stops` | `[{ id?, label, sub?, at? }]`, at least 2 | yes | | snap | The stops along the track, left to right. |
| `progress` | number, 0 to 1 | yes | | tween | How far the fill has gone, on the same 0 to 1 scale as a stop's `at`. It is a position on the track, not a count of stops. |
| `dashed` | boolean | no | `false` | snap | Draw the unfilled track dashed. The fill stays solid. |
| `orient` | `"horizontal"` | no | `"horizontal"` | snap | Accepted so a slide may state it. `horizontal` is the only allowed value and the component never reads the prop, so it changes nothing. |
| `current` | string (a stop id) | no | none | fade | One stop to emphasise: a larger circle and a bold label. |

Each stop:

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | no | Names the stop for `current`. Defaults to the stop's index as a string (`"0"`, `"1"`, ...). Ids must be unique. |
| `label` | string | yes | The stop's name, inline Markdown (emphasis, code, links). Raw HTML is shown as text. |
| `sub` | string | no | A second line under the label, inline Markdown. |
| `at` | number, 0 to 1 | no | Where the stop sits on the track. Defaults to `index / (stops - 1)`. Values must increase from stop to stop. |

The schema has `additionalProperties: false` on the props and on each stop, so any other key is a `validate` error (`unknown-prop`; a stop key is named by its path, e.g. `stops.0.foo`).

The Transition column is the schema's `x-transition` annotation, which feeds the catalog's `animates` list (`progress`, `current`). The actual motion is written in the component; see [Motion](#motion).

## Which stops are lit

A stop is lit (reached) when `progress >= at`, with a tolerance of 1e-9 for float noise. So:

- With evenly spaced stops, `progress: 0` lights only the first stop and `progress: 1` lights all of them. For `n` stops, stop `i` sits at `i / (n - 1)`: with 3 stops that is `0`, `0.5`, `1`; with 5 stops `0`, `0.25`, `0.5`, `0.75`, `1`.
- To end the fill exactly on a stop, set `progress` to that stop's `at`. A value between two stops draws the fill part way along the segment and leaves the next stop hollow.
- When stops set `at`, compare `progress` with their `at` values, not with their indexes. Stops without `at` keep their even position, and the full list must still increase.
- The first stop does not have to be at 0, nor the last at 1. The track always spans the full 0 to 1 scale, so a first stop at `0.1` sits a little in from the left end of the track and stays hollow until `progress` reaches `0.1`.

`current` is independent of `progress`: it can name a stop that is not lit yet.

## Markup and size

Inside its element wrapper (`div.sd-el[data-el][data-type="timeline"]`) the component renders one `svg`, sized to the element in canvas pixels (no `viewBox` scaling):

```html
<svg class="sd-timeline" data-dashed="false">
  <line class="sd-timeline-track" />
  <line class="sd-timeline-fill" />
  <g class="sd-timeline-labels">
    <foreignObject class="sd-timeline-label-box">
      <div class="sd-timeline-label" data-id="review" data-current="true">
        <div class="sd-timeline-text">Review</div>
        <div class="sd-timeline-sub">by a person</div>
      </div>
    </foreignObject>
    <!-- one per stop -->
  </g>
  <g class="sd-timeline-stops">
    <circle class="sd-timeline-stop" data-id="review" data-reached="true" data-current="true" />
    <!-- one per stop -->
  </g>
</svg>
```

- `data-reached` on each circle is `"true"` once the fill has reached that stop. `data-current` marks the `current` stop on both its circle and its label. Read these in tests rather than colors or radii.
- `.sd-timeline-sub` is present only when the stop has a `sub`.
- `data-dashed` on the `svg` mirrors `dashed`.

Layout:

- The width is the element's width. Each stop gets a label slot as wide as the closest pair of stops allows, and the track is inset by half a slot at each end, so the first and last labels stay inside the element. Stops that are close together (a small `at` gap) therefore make every slot narrow.
- Labels wrap inside their slot. The `svg` is as tall as the tallest label plus the track. Labels are measured in their bold state, so the height does not change when `current` moves.
- The component does not stretch to fill its region. In the kit example it is 1500 x 119 px on the `statement` layout.

Styles in `core/stepdeck.css`:

| Part | Style | In academic-light |
| --- | --- | --- |
| Track (`.sd-timeline-track`) | `--sd-color-rule`, stroke 2 x `--sd-rule-width`; dashed `1.5 x --sd-grid` on, `--sd-grid` off | #d4d4d8, 4px; 12px / 8px dashes |
| Fill (`.sd-timeline-fill`) | `--sd-color-accent`, stroke 2 x `--sd-rule-width` | #0072b2, 4px |
| Stop, not reached | `--sd-color-background` fill, `--sd-color-muted` outline | white with a #5b5b62 ring |
| Stop, reached | `--sd-color-accent` fill and outline | #0072b2 |
| Stop radius | 1.5 x `--sd-grid`; the `current` stop 2.25 x `--sd-grid` | 12px; 18px |
| Label (`.sd-timeline-text`) | `--sd-font-size-note`, `--sd-color-ink`, bold (`--sd-font-weight-strong`) when current | 32px |
| Sub (`.sd-timeline-sub`) | `--sd-font-size-label`, `--sd-color-muted` | 28px |

The pixel values are those of `academic-light`; `modern`, the default theme, has the same sizes and its own colors; any theme changes them through its tokens. See [Layouts and themes](../../guide/layouts-and-themes.md). Use slide `style` with these classes to restyle one slide.

## Motion

The engine animates an update only when you move forward exactly one step, in a live presentation with motion on. A jump, a backward move, the first render and capture mode (`shoot`, `check`) draw the target state at once. So going back a step retracts the fill with no motion. See [Animation and motion](../../guide/animation-and-motion.md).

When the update animates:

| What happened | What moves |
| --- | --- |
| `progress` changed | The fill tweens from the previous `progress` to the new one. Each stop fills in (or goes hollow) at the moment the moving fill passes it. A forward step that lowers `progress` retracts the fill with the same tween. |
| `current` moved to another stop | The new stop's circle grows and its label fades in; the old stop's circle shrinks at the same time. |
| `current` was set where there was none | The stop's circle grows and its label fades in. |
| `current` was removed | The old stop's circle shrinks. |
| `stops` changed, or the element's width changed | Nothing moves: the track is rebuilt and drawn in its end state. |

- Both motions use `ctx.animate.tween` with a cubic ease in and out, and last the step's `transition.duration` when set, else 400 ms (the engine's default; this component does not read `--sd-duration`). When `progress` and `current` change at the same step, both run together.
- `dashed` and the label text snap: they are written directly.
- The element becoming visible (for example through `from`) adds no entry motion of its own. If `progress` is unchanged when it appears, the track is simply drawn.
- If you move on before the motion ends, it stops and the end state is written at once.

Every update first writes the target state straight from the props, and ends by writing it again and removing the inline styles the motion used. The markup after a played step is the same as after a jump to that step, which is what `check --played` compares.

## Errors

The component checks its props at mount and on every update. A failed check makes the element show the message on the slide and stop updating. `dump` lists it under `error:` and `check` reports it as `render-error`. The checks run in this order, so you see the first one that fails:

| Cause | Message | Raised in |
| --- | --- | --- |
| `stops` is not an array, or has fewer than 2 items | ``timeline needs at least 2 stops (got <n>)``, or `(got none)` when it is not an array | `stops.js` |
| `progress` is not a number from 0 to 1 | ``timeline `progress` must be a number from 0 to 1 (got '<value>')`` | `stops.js` |
| A stop has no string `label` | ``timeline stop <i> needs a string `label` `` | `stops.js` |
| A stop's `id` is not a string | ``timeline stop <i>: `id` must be a string`` | `stops.js` |
| Two stops share an id | `timeline has a duplicate stop id '<id>'` | `stops.js` |
| A stop's `at` is not a number from 0 to 1 | ``timeline stop '<id>': `at` must be a number between 0 and 1 (got '<value>')`` | `stops.js` |
| A stop's `at` is not greater than the previous stop's | ``timeline stop '<id>': `at` must increase from one stop to the next`` | `stops.js` |
| `current` names no stop | ``timeline `current` names '<id>', which is not a stop id ('a', 'b', ...)`` | `index.js` |

`<i>` is the stop's 0-based index. The duplicate check includes default ids, so an explicit `id: "1"` on the first stop collides with the second stop if that one has no id.

For example, from `dump` on a slide with four broken timelines:

```text
error: bad/cur: timeline `current` names 'end', which is not a stop id ('a', 'b')
error: bad/order: timeline stop 'b': `at` must increase from one stop to the next
error: bad/dup: timeline has a duplicate stop id '1'
error: bad/one: timeline needs at least 2 stops (got 1)
```

`validate` checks the schema at every step (`prop-invalid`), so it catches fewer than 2 stops, a missing `label`, a non-string `id`, and `progress` or `at` outside 0 to 1:

```text
bad/one · prop-invalid · stops = [{"label":"A"}] vs must NOT have fewer than 2 items · change stops so it is NOT have fewer than 2 items (props of timeline)
bad/one · prop-invalid · progress = 2 vs must be <= 1 · change progress so it is be <= 1 (props of timeline)
```

It does not catch an unknown `current`, duplicate ids or `at` values that do not increase: those pass `validate` and fail only in the browser. Run `dump` or `check` after `validate`. See the [CLI reference](../cli.md) and [Checking a deck](../../guide/checking-a-deck.md).

A timeline is not a figure: unlike `chart.*` and `big-number`, it does not need a source line for `figure-source`.

## For agents

The agent-facing summary of this component is in [`skill/references/components.md`](../../../skill/references/components.md). `node cli/index.js catalog timeline` prints the same props from the schema.
