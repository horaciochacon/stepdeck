# big-number

One large figure with an optional label and 95% interval, rendered as `<div class="sd-big-number">`. The figure
uses `--sd-font-size-display` (128px by default); label and interval use `--sd-font-size-note`.

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `value` | number | (required) | tween | The figure. Usually one binding with no format, `{{data/summary.json#/responders}}`, which resolves to the raw number. A binding *with* a format gives text, which is an error. |
| `format` | string | (required) | fade | d3-format specifier for the figure and the interval, localized by the deck language (`,.0f` shows `53,265` in `en` and `53.265` in `es`). |
| `label` | string | none | fade | Caption under the figure. |
| `ci` | `[lo, hi]` | none | fade | Shown as `95% CI lo–hi` (`IC 95%` in `es`), formatted with the same `format`. |
| `prefix` | string | none | fade | Text before the figure (a currency sign). Not applied to the interval. |
| `suffix` | string | none | fade | Text after the figure (a unit), drawn smaller. Not applied to the interval. |

Behaviour:
- **Alignment.** The figure, its label and its interval are left-aligned in the element, in every layout: the
  `statement` layout centres only `text` and `markdown`, so a big number in its `main` region sits at the left of
  the statement column. There is no alignment prop. To centre one, give the slide a `style` that targets the
  element by its id: `style: '[data-el="<id>"] { text-align: center; }'` (`right` works the same way).
- **Entrance.** The figure builds its own entrance (`"x-enter": "own"` in its schema): when the element appears on
  an animated step, it fades in and counts up from 0 while its box stays still. It waits for its stagger slot like
  any entering element, and shows 0 the moment it appears. With `enter: "none"`, or a box motion such as
  `enter: "rise"`, it shows its value at once (the box moves instead).
- **Count-up.** The figure counts with `ctx.animate.tween` over 2.25 × `--sd-duration` (900 ms at 400 ms), or the
  step's `transition.duration`, or on entrance the element's `enter.duration`, formatting every frame: from 0 on
  its entrance, else from the previous value when `value` changed from a number while the element stays shown. An
  abort snaps straight to the end value.
- **Exact end state.** Every `update` finishes by writing `format(value)`, so the DOM after `settled()` is the
  same whether the step was played or jumped to. `root.dataset.value` holds the raw number.
- **No re-run on a no-op.** The engine skips updates whose props and visibility did not change; an update that
  changes nothing also writes nothing and never starts a tween.
- A changed `label`, `ci`, `prefix` or `suffix` fades that part in, and a changed `format` fades the whole
  figure line (prefix, figure and suffix) in, timed by the theme (`--sd-duration`, `--sd-easing`).
- Errors (the element shows them): a non-number `value`, a missing `format`, an invalid format, a `ci` that is
  not two numbers.

See `example.js` for a slide that uses it.
