# text

One paragraph of plain text, rendered as `<p class="sd-text sd-role-<role>">`. With `accent: true`, each
`*phrase*` becomes `<em class="sd-accent">phrase</em>` inside it.

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `text` | string | (required) | fade | The text. Data bindings (`{{path#/pointer \| format}}`) are resolved by the engine. |
| `role` | `body` \| `source` \| `note` \| `label` \| `lede` \| `badge` | `body` | snap | Typographic role; sizes and colors come from the theme tokens. `lede` is the message line under a title (`--sd-font-size-lede`, muted); `badge` is an inline uppercase pill in the label size with a 2px border in its own colour. The slide `lede` sugar and a `text` element with id `lede` get `role: "lede"` unless their props say otherwise. |
| `tone` | integer ≥ 0 | (none) | fade | For `role: "badge"`: the index of the badge's colour in the deck's categorical palette (`ctx.palette("categorical")`, 0 is the first colour). Without it, or beyond the palette's length, the badge takes the theme's accent colour. Changing it while the badge is on screen fades the colour. The pill's border takes the palette colour as it is; the text takes it darkened (lightened on a dark background) until it reaches 4.5:1 on `--sd-color-background`, so every tone passes `check`. |
| `accent` | boolean | `false` | snap | Render `*phrase*` as an accent phrase (the published hook `.sd-accent`, in the theme's accent colour). `\*` is a literal asterisk and `\\` a literal backslash; an unmatched `*` stays as written. The slide `title` sugar and a `text` element with id `title` get `accent: true` unless their props say otherwise. |

Behaviour:
- `update` is idempotent: it renders exactly the props it is given.
- **Motion.** An element that appears is moved by its box (the engine's entrance), never by the paragraph itself.
  When `text` changes while the element stays visible and the engine animates (`info.animate`), the paragraph
  crossfades: the old text fades out over `--sd-duration-fast`, the text swaps, and the new text fades in over
  `--sd-duration-fast`. A step's `transition.duration` is the whole crossfade (each half is `duration / 2`); a
  duration of 0 snaps. Text that appears and changes on the same step is rendered directly. An abort renders the
  final text at once, and no inline style is left behind. In capture mode, previews, jumps and backward moves it
  renders instantly.
- A tone is painted as two inline declarations on the paragraph, always in this order: `color` (the text colour,
  darkened to 4.5:1 with `textColor` from `core/color.js`) and `border-color` (the palette colour). They are the
  only inline styles a `text` keeps. A tone change that comes with a text change fades both over the crossfade;
  alone it fades them over one `--sd-duration-fast`. Jumps, backward moves and capture set them at once.
- The element with id `title` is styled as the slide title (hook `.sd-title`); the slide's `section` is a `text`
  element with id `kicker` above it (hook `.sd-kicker`), and the slide's `lede` is one with id `lede` (role `lede`, hook `.sd-lede`)
  right under the title. Other text in the `title` region keeps its role's style.
- The accent phrase is built from DOM nodes, never `innerHTML`: markup in the text shows as text. Values from data
  bindings are escaped before parsing, so a bound `*` never creates a phrase.

See `example.js` for a slide that uses it.
