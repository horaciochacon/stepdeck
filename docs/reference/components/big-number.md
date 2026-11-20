# big-number

`big-number` shows one large figure, with an optional caption and an optional 95% interval under it. When a forward step changes the figure, it counts up to the new value. This page lists every prop, the markup, when and how it moves, the errors it raises, and the rule that makes it count as a figure. It is for anyone writing slides by hand or reviewing what an agent wrote.

Sources: [`components/big-number/schema.json`](../../../engine/components/big-number/schema.json), [`components/big-number/index.js`](../../../engine/components/big-number/index.js), [`core/format.js`](../../../engine/core/format.js), [`core/i18n.js`](../../../engine/core/i18n.js), [`core/stepdeck.css`](../../../engine/core/stepdeck.css). For the other components, see the [components reference](index.md).

## Use it

A figure in the side column that appears at the last step, from the starter deck (`templates/talk/slides/chart.js`):

```js
{ id: "latest", region: "notes", type: "big-number", from: "latest",
  props: { value: "{{data/summary.json#/latest_b}}", format: ",.1f", label: "Group B in 2024, per 1,000" } },
{ id: "source", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic example data (data/make-data.mjs)." } },
```

`value` is a binding with no format, so it resolves to the raw number (`37.3`) and the component formats it with `format`. No figure is typed by hand. The source line is there because a slide with a `big-number` needs one (see [It counts as a figure](#it-counts-as-a-figure)).

A share with its interval, both from one data file, and a money figure that changes at the second step. This slide was checked with `validate` and `dump`:

```json
{ "rate": 0.183, "ci": [0.151, 0.219] }
```

```js
elements: [
  { id: "share", region: "left", type: "big-number",
    props: { value: "{{data/rate.json#/rate}}", format: ".1%", ci: "{{data/rate.json#/ci}}", label: "of households" } },
  { id: "cost", region: "right", type: "big-number",
    props: { value: 1250, format: ",.0f", prefix: "$", suffix: " M" } },
  { id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic." } },
],
steps: [
  { id: "start" },
  { id: "more", set: { cost: { value: 2400, label: "by 2030" } } },
],
```

`share` reads `18.3%`, then `of households`, then `95% CI 15.1%–21.9%`. `cost` reads `$1,250 M` at `start`; at `more` it counts up from 1,250 to `$2,400 M` and the caption `by 2030` fades in.

## Props

| Prop | Type | Required | Default | Transition | Meaning |
| --- | --- | --- | --- | --- | --- |
| `value` | number, or one binding with no format | yes | | tween | The figure. Usually a binding such as `{{data/summary.json#/responders}}`, which resolves to the raw number. |
| `format` | string (d3-format, not empty) | yes | | snap | Format for the figure and for the interval, such as `,.0f`, `.1%` or `~s`. Separators follow the deck language. |
| `label` | string | no | none | fade | Short caption under the figure. |
| `ci` | `[lo, hi]` (two numbers), or one binding with no format | no | none | fade | 95% interval, shown under the caption as `95% CI lo–hi` (`IC 95%` in `es`), with the same `format` as the figure. |
| `prefix` | string | no | none | snap | Text before the figure, such as a currency sign. Not applied to the interval. |
| `suffix` | string | no | none | snap | Text after the figure, such as a unit. Drawn smaller. Not applied to the interval. |

The schema has `additionalProperties: false`, so any other prop is a `validate` error (`unknown-prop`). The schema accepts a string for `value` and `ci` only when it is a single binding with no `|` format: `^\{\{[^{}|]+\}\}$`. The binding syntax is in [Data and bindings](../../guide/data-and-bindings.md).

The Transition column is the schema's `x-transition` annotation, which feeds the catalog. The actual motion is written in the component and is described in [Motion](#motion); for `prefix`, `suffix` and `format` it is a fade, not a snap.

### Bind value without a format

Put the format in `format`, not in the binding. A binding with a format, such as `{{data/rate.json#/rate | .1%}}`, resolves to the text `"18.3%"`, and `value` must be a number:

```text
bad/fmtd · prop-invalid · value = "18.3%" vs must be a number or a string matching ^\{\{[^{}|]+\}\}$ · make value a number or a string matching ^\{\{[^{}|]+\}\}$ (props of big-number)
```

The same holds for `ci`: bind it to a JSON array of two numbers, with no format.

### Formats and language

`format` is a [d3-format](https://d3js.org/d3-format) specifier. The deck language changes only the separators:

| Language | Decimal | Thousands | `,.0f` on 53265 | `ci` label |
| --- | --- | --- | --- | --- |
| `en` (and any language without its own table) | `.` | `,` | `53,265` | `95% CI` |
| `es` | `,` | `.` | `53.265` | `IC 95%` |

The `$` currency type (`$,.0f`) adds `$` before the number in `en` and ` €` after it in `es`. Negative numbers use a true minus sign (U+2212) in every language. The interval label comes from the `ci95` string in `core/i18n.js`; the dash between `lo` and `hi` is an en dash.

During a count-up every frame is formatted with `format`, so `,.0f` counts in whole numbers and `.1%` counts in tenths of a percent.

## Markup and size

Inside its element wrapper (`div.sd-el[data-el][data-type="big-number"]`) the component renders:

```html
<div class="sd-big-number" data-value="0.183">
  <div class="sd-big-number-value">
    <span class="sd-big-number-prefix"></span><span class="sd-big-number-digits">18.3%</span><span class="sd-big-number-suffix"></span>
  </div>
  <p class="sd-big-number-label">of households</p>
  <p class="sd-big-number-ci">95% CI 15.1%–21.9%</p>
</div>
```

- `data-value` on the root holds the raw number as a string, not the formatted text. Read it in tests instead of parsing the digits.
- All parts are always present. An empty prefix or suffix is an empty span; an empty label or interval paragraph is hidden (`display: none`).
- All text is set with `textContent`, so Markdown and HTML in `label`, `prefix` or `suffix` are shown as typed.

Styles in `core/stepdeck.css`:

| Part | Style | In academic-light |
| --- | --- | --- |
| Figure (`.sd-big-number-value`) | `--sd-font-size-display`, `--sd-font-weight-title`, line height `--sd-line-height-tight` (1.15 in both themes), tabular figures, `--sd-color-accent` | 128px, weight 600, blue #0072b2 |
| Suffix (`.sd-big-number-suffix`) | 0.4em of the figure, weight 500 | about 51px |
| Caption (`.sd-big-number-label`) | `--sd-font-size-note`, `--sd-color-ink`, half a `--sd-space` above | 32px |
| Interval (`.sd-big-number-ci`) | `--sd-font-size-note`, `--sd-color-muted` | 32px, #5b5b62 |

The pixel values are those of `academic-light`; `modern`, the default theme, has the same sizes, its own colors, and tighter tracking on the figure (`letter-spacing: -0.04em`); any theme changes them through its tokens. See [Themes](../themes.md). Use slide `style` with these classes to restyle one slide.

## Motion

The engine animates an update only when you move forward exactly one step, in a live presentation with motion on. A jump, a backward move, the first render and capture mode (`shoot`, `check`) draw the target state at once. See [Animation and motion](../../guide/animation-and-motion.md).

When the update animates:

| What happened | What moves |
| --- | --- |
| The element just became visible | The whole figure fades in, and the digits count up from 0 to `value` (unless `value` is 0). |
| `value` changed and the old value was a number | The digits count up (or down) from the old value to the new one. |
| `label` changed | The caption fades in. |
| `ci` changed | The interval line fades in. |
| `prefix` or `suffix` changed | That part fades in. |
| `format` changed | The whole figure line (prefix, digits, suffix) fades in. |

- The count-up lasts 900 ms, or the step's `transition.duration` when set. It uses `ctx.animate.tween` with a cubic ease in and out.
- The fades last the step's `transition.duration` when set, else 400 ms (the engine's default fade length; this component does not read `--sd-duration`).
- A step that changes nothing for this element starts nothing: the engine skips the update when props and visibility are unchanged.
- If you move on before the motion ends, it stops and the final value is written at once.

Every update ends by writing the exact formatted `value` and removing any inline style the motion left. The markup after a played step is the same as after a jump to that step, which is what `check --played` compares.

## Errors

The component checks its props at mount and on every update. Every element mounts when the slide loads, hidden ones included, so bad props fail at load, not when the element appears. A failed check makes the element show the message on the slide and stop updating. `dump` lists it under `error:` and `check` reports it as `render-error`. The messages, as `dump` prints them:

| Cause | Message |
| --- | --- |
| `value` is not a finite number | ``big-number needs a numeric `value`, got <json>`` |
| `value` is a string (usually a binding with a format) | the same, followed by `` (bind it without a format: {{path#/pointer}}, and put the format in `format`) `` |
| `format` is missing, not a string or empty | ``big-number needs a `format` (a d3-format string such as ",.0f")`` |
| `format` is not a valid d3-format specifier | `invalid format: <spec>` (from d3-format) |
| `ci` is set but is not two finite numbers | ``big-number `ci` must be [lo, hi] (two numbers), got <json>`` |

For example:

```text
error: bad/fmtd: big-number needs a numeric `value`, got "18.3%" (bind it without a format: {{path#/pointer}}, and put the format in `format`)
error: bad/nofmt: big-number needs a `format` (a d3-format string such as ",.0f")
error: bad/badci: big-number `ci` must be [lo, hi] (two numbers), got [1]
```

`validate` catches most of these earlier, through the schema (`prop-invalid`). It checks the props at every step of the slide and reports each problem once, at the first step where it appears. On a slide with steps that step's id is part of the location (`bad/nofmt/s · prop-invalid · …` for step `s`). The samples below come from a slide without steps:

```text
bad/nofmt · prop-invalid · 'format' missing vs required · add 'format' (props of big-number)
bad/badci · prop-invalid · ci = [1] vs must be an array of 2 items or a string matching ^\{\{[^{}|]+\}\}$ · make ci an array of 2 items or a string matching ^\{\{[^{}|]+\}\}$ (props of big-number)
```

An invalid specifier such as `format: "zz"` passes `validate` (the schema only asks for a non-empty string) and fails only in the browser. Run `dump` or `check` after `validate` to catch it. A broken binding is reported by `validate` as `binding-file`, `binding-pointer` or `binding-format`; see the [CLI reference](../cli.md).

## It counts as a figure

`validate` treats `big-number` as a figure, like `chart.line` and `chart.bar`. A slide with a figure fails `figure-source` unless some element has `props.role === "source"` from the start (its initial props, before any step):

```text
bad/fmtd · figure-source · fmtd (big-number), nofmt (big-number), badci (big-number) without a source vs an element with role: "source" · add { id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: …" } }
```

The problem is reported on the first figure element. The fix suggests the `footer` region when the layout has one, else `main`. A source line is a [`text`](text.md) element with `role: "source"`.

## For agents

The agent-facing summary of this component is in [`skill/references/components.md`](../../../skill/references/components.md). `node cli/index.js catalog big-number` prints the same props from the schema.
