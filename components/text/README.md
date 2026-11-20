# text

One paragraph of plain text, rendered as `<p class="sd-text sd-role-<role>">`. With `accent: true`, each
`*phrase*` becomes `<em class="sd-accent">phrase</em>` inside it.

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `text` | string | (required) | fade | The text. Data bindings (`{{path#/pointer \| format}}`) are resolved by the engine. |
| `role` | `body` \| `source` \| `note` \| `label` | `body` | snap | Typographic role; sizes and colors come from the theme tokens. |
| `accent` | boolean | `false` | snap | Render `*phrase*` as an accent phrase (the published hook `.sd-accent`, in the theme's accent colour). `\*` is a literal asterisk and `\\` a literal backslash; an unmatched `*` stays as written. The slide `title` sugar and a `text` element with id `title` get `accent: true` unless their props say otherwise. |

Behaviour:
- `update` is idempotent: it renders exactly the props it is given.
- It fades in (`ctx.animate.fadeIn`) only when the engine animates (`info.animate`) and the element
  just appeared or its text changed. In capture mode, previews and jumps it renders instantly.
- The element with id `title` is styled as the slide title (hook `.sd-title`); the slide's `section` is a `text`
  element with id `kicker` above it (hook `.sd-kicker`). Other text in the `title` region keeps its role's style.
- The accent phrase is built from DOM nodes, never `innerHTML`: markup in the text shows as text. Values from data
  bindings are escaped before parsing, so a bound `*` never creates a phrase.

See `example.js` for a slide that uses it.
