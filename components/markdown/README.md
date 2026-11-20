# markdown

Markdown text (paragraphs, headings, lists, emphasis, code, links, tables), rendered inside
`<div class="sd-markdown">`. Body text uses the theme tokens (`--sd-font-size-body`, 40px by default; code uses
the label size, 28px).

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `md` | string | (required) | fade | The Markdown source. Data bindings (`{{path#/pointer \| format}}`) are resolved by the engine before the component sees it. |

Behaviour:
- **Color words.** `{{color:<role>}}` becomes the palette's name for that color role in the deck language:
  `{{color:accent}}` reads "blue" in an `en` deck and "azul" in an `es` deck, so text never names a color the
  theme does not show. Roles come from `themes/<theme>/palettes.json` (`roles`, searched in the categorical,
  sequential and diverging palettes in that order). An unknown role is an element error that names the role.
- **Raw HTML is escaped**, not stripped: `<script>x</script>` appears on the slide as text and nothing runs.
  Links and images are built by the component with the URL HTML-escaped (so an entity such as `&#106;` stays literal),
  and only `http:`, `https:`, `mailto:`, `#anchor` and relative URLs are kept. Any other scheme (`javascript:`, `data:`,
  or one hidden with entities, tabs or spaces) renders as plain text for a link, and as the alt text for an image.
  (Remote URLs are not this component's concern; `validate` rejects them.)
- **Idempotent.** `update` renders exactly the given props. It fades in (`ctx.animate.fadeIn`) only when the
  engine animates (`info.animate`) and the element appeared or `md` changed, and leaves no inline opacity behind.
- Parsed with `marked` (vendored in `vendor/marked/`, MIT).

See `example.js` for a slide that uses it.
