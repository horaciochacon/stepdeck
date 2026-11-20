# The step model

A slide is a list of **elements** and an optional list of **steps**. The engine computes the full state of any step directly, so jumping to a step, playing up to it and screenshotting it all show the same thing.

```js
// slides/<id>.js — must import in plain Node: no DOM, no fetch, no top-level await.
export default {
  id: "results",               // equals the file name; letters, digits, - and _
  layout: "figure-notes",      // default: full-bleed
  title: "A short title",      // sugar for an element with id "title" (type text, region title)
  lede: "The message of the slide, in one line.",   // optional: a muted line under the title; set it per step
  elements: [ /* … */ ],
  steps: [ /* … */ ],          // optional; no steps = one state
  notes: "Speaker notes for steps that have none.",
  style: ":scope { --sd-region-gap: 40px; }",                    // scoped CSS, optional
  regions: { "--notes-width": "700px" },                         // layout grid variables, optional
  seconds: 60,                 // planned speaking time, optional
};
```

## Elements

| Key | Meaning |
|---|---|
| `id` | Unique in the slide. `title` is reserved for the title sugar. |
| `type` | `text`, `markdown` or a component name from the catalog (`chart.line`, `big-number`, `terminal`, `my.thing`). |
| `props` | JSON only, validated against the component's schema at every step. |
| `region` | A region of the layout (default `main`). Elements in a region stack vertically in the order listed. |
| `box` | `{ x, y, w, h }` in canvas pixels: float anywhere on the 1920×1080 canvas instead of a region. |
| `from` | Visible from this step on. |
| `at` | Visible only at these steps (an array). |
| `collapse` | `true`: when hidden, take no space (the region reflows). Default: hidden elements keep their space. |
| `advance` | Drive one prop step by step (below). |
| `enter`, `exit` | How the element arrives and leaves on a forward step: `fade`, `rise`, `wipe`, `pop`, `draw` or `none`, or `{ motion, delay, duration }` (ms; `delay` is for entrances only). Defaults: the theme's entrance (`rise` in `modern`, `fade` in `academic-light`) and `fade`; charts, `big-number`, `list`, `chat`, `diagram`, `terminal` and `timeline` build themselves instead (below). |
| `ghost` | `true` or a label (`"2 · Result"`): while the element is hidden, a dashed frame (with the label) holds its space. Not with `collapse: true` (`ghost-collapse`). |

## States and step references

- A slide with `n` steps has states `0 … n−1`. Step 0 is the first state the audience sees, and the first entry of `steps` is step 0's patch.
- Give every step an `id` and reference steps by id: `from: "annotate"`, `at: ["base", "focus"]`, `advance.start: "run"`. A number (0-based) also works, but inserting a step shifts it.
- Step ids must not be digits only (`"1"`, `"02"`): validate rejects them (`step-id-numeric`), because a digit string reads as a step number. Use words, or `step-1`.
- The CLI and URLs take ids too: `--step annotate`, `#/<slide>/<step-id>`.

## Visibility

- Every element is visible from step 0 unless it says otherwise.
- `from: "x"` hides it before step `x`; `at: ["x", "y"]` shows it only at those steps.
- Hidden elements keep their space (`visibility: hidden`), so nothing on screen moves when something appears. `collapse: true` opts into reflow.
- Explicit `show: ["id"]` / `hide: ["id"]` in a step apply after the sugar of that step and **persist** in later steps (steps fold) until the element's `from`/`at` next changes its visibility. For a change that lasts one step, use `at`.
- `from` and `at` on the same element: `from` wins. Use one.

## Step patches

Each step entry is a patch applied on top of the state of the step before (it **folds**). Inside one step the order is `replace`, then `set`, then `show`, then `hide`; then `only` is applied on top, for that step alone.

| Op | Shape | Effect |
|---|---|---|
| `set` | `{ <id>: { <prop>: value } }` | RFC 7396 merge patch on the element's props: objects merge, arrays and scalars replace, `null` deletes that prop. Lasts until changed. |
| `replace` | `{ <id>: { …all props } }` | The element's props, wholesale. |
| `show` / `hide` | `["id", …]` | Visibility, folding forward (see above). |
| `only` | like `set` | Applied at this step only, **not** folded into later steps. For a one-step highlight. |
| `notes` | string | Speaker notes for this step (the slide's `notes` is the fallback). |
| `transition` | `{ duration, stagger }` (ms) | Times this step: `duration` replaces the theme's durations (`0` snaps the step), `stagger` the gap between entering elements and between list, chat, diagram or terminal items. |

Never write `set: { chart: null }`: that makes props `null` (`props-not-object`). To delete one prop: `set: { chart: { highlight: null } }`.

The title is an element too: `set: { title: { text: "A new title" } }` changes it at a step. So is the `lede`: `set: { lede: { text: "The next point." } }` changes the line under the title, and it crossfades. `lede` needs a layout with a `title` region (all built-ins have one); on the `title` cover use a `text` in `subtitle` instead (`lede-on-cover`).

### Example fold

```js
elements: [
  { id: "chart", type: "chart.line", props: { /* … */ series_shown: ["A"] } },
  { id: "note", type: "text", from: "mark", props: { text: "…" } },
],
steps: [
  { id: "base" },                                                // chart A; note hidden (space kept)
  { id: "both", set: { chart: { series_shown: ["A", "B"] } } },  // chart A+B
  { id: "mark", set: { chart: { annotate: [{ x: 2020, label: "2020" }] } } },  // + annotation, note shows
  { id: "focus", only: { chart: { highlight: "B" } } },          // + highlight B (this step only)
  { id: "end" },                                                 // the "mark" state again: the highlight is gone
],
```

A step whose resulting state equals the previous step's (same elements, props and visibility) gets the warning `noop-step`: the audience would click and see nothing change. A step that only adds `notes` counts as no-op too.

## `advance`: elements with an internal sequence

Components with an internal sequence (the terminal, a custom `stage`-driven story) are driven by **props only**; a component never reads the step number. `advance` writes one value per step so you do not have to write the patches:

```js
{ id: "term", type: "terminal",
  props: { script: "data/session.json", shown: 0 },
  advance: { prop: "shown", values: [0, 4, 9, 12], start: "open" } }
// at step "open" shown=0, next step 4, then 9, then 12; the last value holds afterwards
```

- `start` (default step 0) is the first step it applies to; before it, the initial `props` hold, so always give the prop an initial value.
- `start + values.length` must not exceed the number of steps (`advance-overflow`). Usually `values.length` equals the steps from `start` to the end.
- Two sequenced elements on one slide each get their own `advance`, aligned by step ids.
- `advance` is applied before the step's explicit patches, so an explicit `set` of the same prop wins at that step.

## Animation

- A step change animates only when moving **forward by exactly one step**, with motion on and outside capture. Jumps, backward moves, screenshots and `dump` render the end state directly.
- **Entrances.** Every element that becomes visible on a forward step enters, one after another in slide order, `--sd-stagger` apart (80ms in `modern`; `transition.stagger` overrides it). A plain element's box plays its `enter` (default the theme's: `rise` in `modern`). A component whose catalog entry says `enter: own` builds itself instead (lines draw, bars grow, list items rise in turn, a big number counts up) while its box stays still. A list that appears with `shown: 3` builds its three items: no need to reveal them on later steps to get motion.
- **Exits.** An element that becomes hidden fades out (its `exit`), at the start of the step. With `collapse: true` it leaves at once, so a swap in one spot never jumps.
- **Turning it off.** `enter: "none"` / `exit: "none"` on an element; `transition: { duration: 0 }` on a step.
- **Changes.** Components animate prop changes themselves; the catalog's `animates` list and each prop's `x-transition` (`tween`, `draw`, `fade`, `snap`) say how. A changed `text` (the title and the `lede` included) crossfades. `highlight` on charts and diagrams dims the rest to a neutral grey.
- Rapid navigation aborts the running animation and lands on the latest step's end state: held elements appear at once.

## Notes and timing

- `notes` per step, `notes` per slide as fallback; the presenter view (`S` in the reveal shell) shows them.
- `seconds` records planned speaking time.
- `section` (slide) is the kicker: a small label above the title, drawn on layouts that have a `title` region (see [themes-layouts](themes-layouts.md)). `sections: true` (deck) is accepted but draws nothing in this version.
