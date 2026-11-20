# big-number

One large figure with an optional label and 95% interval, rendered as `<div class="sd-big-number">`. The figure
uses `--sd-font-size-display` (128px by default); label and interval use `--sd-font-size-note`.

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `value` | number | (required) | tween | The figure. Usually one binding with no format, `{{data/summary.json#/responders}}`, which resolves to the raw number. A binding *with* a format gives text, which is an error. |
| `format` | string | (required) | snap | d3-format specifier for the figure and the interval, localized by the deck language (`,.0f` shows `53,265` in `en` and `53.265` in `es`). |
| `label` | string | none | fade | Caption under the figure. |
| `ci` | `[lo, hi]` | none | fade | Shown as `95% CI lo–hi` (`IC 95%` in `es`), formatted with the same `format`. |
| `prefix` | string | none | snap | Text before the figure (a currency sign). Not applied to the interval. |
| `suffix` | string | none | snap | Text after the figure (a unit), drawn smaller. Not applied to the interval. |

Behaviour:
- **Count-up.** When the step animates (`info.animate`), the figure counts with `ctx.animate.tween` (900 ms, or the
  step's `transition.duration`), formatting every frame: from 0 when the element just became visible
  (`info.entered`), else from the previous value when `value` changed from a number. An abort snaps straight to the
  end value.
- **Exact end state.** Every `update` finishes by writing `format(value)`, so the DOM after `settled()` is the
  same whether the step was played or jumped to. `root.dataset.value` holds the raw number.
- **No re-run on a no-op.** The engine skips updates whose props and visibility did not change; an update that
  changes nothing also writes nothing and never starts a tween.
- When the element becomes visible in an animated step it also fades in; a changed `label`, `ci`, `prefix` or
  `suffix` fades that part in.
- Errors (the element shows them): a non-number `value`, a missing `format`, an invalid format, a `ci` that is
  not two numbers.

See `example.js` for a slide that uses it.
