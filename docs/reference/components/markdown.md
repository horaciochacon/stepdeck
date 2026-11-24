# markdown

This page lists every prop and behaviour of the built-in `markdown` component: a block of Markdown text with headings, lists, emphasis, code, quotes, tables and links. It is for anyone who writes slides, by hand or through an agent. Use [`text`](text.md) for a single plain paragraph in a fixed role (body, source, note, label, lede, badge); use `markdown` when you need formatting or color words. Agents get the same facts from [skill/references/components.md](../../../skill/references/components.md) and `node cli/index.js catalog markdown <deck>`.

## Use it

The kit example deck puts its research question on the `statement` layout and uses `markdown` to make two words bold (`examples/kit/slides/question.js`):

```js
export default {
  id: "question",
  layout: "statement",
  elements: [
    { id: "claim", region: "main", type: "markdown",
      props: { md: "Does more **exposure** lead to a worse **outcome**, and by how much?" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "A synthetic research question." } },
  ],
};
```

The component's own example (`components/markdown/example.js`) shows a list, a color word and a second block that appears at a later step:

```js
export default {
  id: "markdown-example",
  layout: "full-bleed",
  title: "Markdown",
  elements: [
    { id: "lead", region: "main", type: "markdown",
      props: { md: "The **{{color:accent}}** line is the baseline.\n\n- Lists work.\n- So do *emphasis* and `code`." } },
    { id: "more", region: "main", type: "markdown", from: "more",
      props: { md: "This block appears at step **more**." } },
  ],
  steps: [{ id: "start" }, { id: "more" }],
};
```

In a JavaScript string, `\n\n` separates paragraphs and `\n- ` starts a list item.

## Props

| Prop | Type | Required | Default | Transition | Meaning |
|---|---|---|---|---|---|
| `md` | string | yes | none | fade | The Markdown source. It may hold data bindings such as `{{data/summary.json#/responders \| ,.0f}}` and color words such as `{{color:accent}}`. |

`md` is the only prop; the schema allows no others (`additionalProperties: false`), so `validate` reports any other key as `unknown-prop`.

Data bindings are resolved by the engine before the component sees `md`, so a binding embedded in text always becomes a string. See [Data and bindings](../../guide/data-and-bindings.md). The engine leaves `{{color:...}}` alone; the component resolves it (see [Name a palette color](#name-a-palette-color)).

## What it renders

The element holds one `<div class="sd-markdown">`. Its contents come from `renderBlock` in `core/inline.js`, which parses `md` with a vendored copy of [marked](https://marked.js.org/) (`vendor/marked/`, MIT) in GitHub-flavoured mode. The same renderer, in its inline form, is used by `list`, `chat`, `diagram`, `timeline`, the `image` caption and the compact `map` caption.

| Markdown | Result |
|---|---|
| Paragraphs, `#` headings, `-` and `1.` lists, `>` quotes, tables | The matching HTML blocks. |
| `---` on its own line | A horizontal rule. |
| `- [ ]` and `- [x]` list items | Task items: no bullet, an empty box or a filled one in its place. |
| `**bold**`, `*italic*`, `` `code` ``, fenced code blocks | `strong`, `em`, `code`, `pre`. |
| `[text](url)`, `![alt](url)` | A link or an image, if the URL is allowed (see below). For pictures prefer the `image` component: a relative image URL here is not resolved against the deck root. |
| Raw HTML such as `<b>x</b>` or `<script>` | Escaped: it shows on the slide as literal text and nothing runs. A block of raw HTML becomes `<p class="sd-md-raw">`. |

### Allowed URLs

Links and images keep their URL only when it is one of:

- `http:` or `https:`
- `mailto:`
- a relative path, such as `assets/photo.png`
- an anchor, such as `#results`

Any other scheme (`javascript:`, `data:`, and the same schemes disguised with HTML entities, tabs or spaces) is dropped. A link then renders as its text alone, and an image as its alt text. The URL is HTML-escaped in the attribute, so an entity in the source stays literal.

The renderer allows `http` and `https`, but `validate` does not: any `http://` or `https://` URL in a prop is a `remote-url` error, because a deck must run with no network. A protocol-relative URL (`//host/...`) is also a `remote-url` error, even though the renderer would keep it. A relative URL is written into the HTML as typed and the browser resolves it against the page, not the deck root. A picture `![alt](assets/photo.png)` loads when the deck is presented from its own `index.html`, but `check`, `dump` and `shoot` open the deck through `stepdeck/core/render.html`, where the same URL is a 404 (`network-error`) and the screenshot has no picture. `validate` does not check the file either. Use the [`image`](image.md) component for pictures: its `src` is resolved against the deck root and checked by `validate`. Also note that an anchor whose name reads as a hex color, such as `#bad` or `#face`, is reported as `hex-color`.

### Text size and styles

Styles are in `core/stepdeck.css` (the `.sd-markdown` rules); the token values are set by the theme, in `themes/<theme>/tokens.css`. The values below are those of `academic-light`; `modern`, the default theme, has the same sizes and its own colors and fonts.

| Part | Token | academic-light |
|---|---|---|
| Body text | `--sd-font-size-body`, line height `--sd-line-height` | 40px, 1.3 |
| `#` heading | `--sd-font-size-title`, weight `--sd-font-weight-title` | 64px, 600 |
| `##` to `######` headings | 1.2 x `--sd-font-size-body` (one size for all five levels, so none goes under the audience minimum) | 48px |
| Inline and block code | `--sd-font-mono` at `--sd-font-size-label`, on `--sd-color-surface` | IBM Plex Mono, 28px |
| Bold | `--sd-font-weight-strong` | 600 |
| Links | `--sd-color-accent` | #0072b2 |
| Quotes | left rule in `--sd-color-rule`, text in `--sd-color-muted` | |
| Table | as wide as its content; cells padded by a quarter of `--sd-space` above and below and one `--sd-space` at the sides; a rule under every row (`--sd-rule-width`, `--sd-color-rule`); header cells in `--sd-font-weight-strong`. Cells are left-aligned unless the column's delimiter row says otherwise (`--:` right, `:-:` centre) | 4px 16px, 2px rule, 600 |
| Horizontal rule | `--sd-rule-width`, `--sd-color-rule` | 2px |
| Task item | a box of 0.7em in the bullet's place: outlined in `--sd-color-muted` when open, filled with `--sd-color-accent` when done | 28px |

Blocks are spaced by `--sd-space`, and the first and last block sit flush with the element box.

#### In the statement layout

The `statement` layout enlarges every `markdown` (and `text`) element in its `main` region: font size `--sd-font-size-statement` (64px in both built-in themes), line height `--sd-line-height-tight` (1.15), centred, with balanced line breaks. These are the rules of the `.sd-statement` hook in `core/stepdeck.css`, which the layout puts on its `main` region (`"hooks": { "main": "statement" }` in `layouts/statement/schema.json`); the layout's own CSS only places the regions. Elements in `title` and `footer` keep their normal size. This is the usual way to show one large sentence with a few bold words, as in the kit example above. See [Layouts](../layouts.md).

## Name a palette color

Write `{{color:<role>}}` to name a color the slide actually shows. The component replaces it with the name of the color that role points to, in the deck language. The text then never names a color the theme does not use, and it follows a theme or palette change.

The role is looked up in the deck's palettes in this order: categorical, then sequential, then diverging. The first palette that defines the role wins. Each palette is the deck's `palette` when its kind matches, and the theme's default palette of that kind otherwise. The name is `names[lang]`, else `names.en`, else the color id. Spaces inside the braces are allowed (`{{ color: accent }}`).

Roles in academic-light (`themes/academic-light/palettes.json`). In `modern`, the default theme, `accent` is `#1d4ed8` (blue, azul) and `alert` is `#d81b45` (rose, rosa); `low`, `high` and `mid` are the same as below:

| Role | Palette (kind) | Color | `en` | `es` |
|---|---|---|---|---|
| `accent` | okabe-ito-dark (categorical) | #0072b2 | blue | azul |
| `alert` | okabe-ito-dark (categorical) | #b75002 | vermillion | bermellón |
| `low` | viridis (sequential) | #440154 | dark purple | morado oscuro |
| `high` | viridis (sequential) | #fde725 | yellow | amarillo |
| `mid` | blue-red (diverging) | #f7f7f7 | light grey | gris claro |

Because sequential is searched before diverging, `low` and `high` always name the viridis colors. The diverging palette's own `low` (blue) and `high` (red) cannot be reached this way; only `mid` comes from it.

In an `es` deck, `"The **{{color:accent}}** line"` renders as "The **azul** line". The inserted name is escaped as Markdown text, so it never adds formatting of its own.

`chart.line` and `chart.bar` take their colors from the same categorical palette, in palette order. In academic-light the `accent` color is also the first color, so `{{color:accent}}` names the first series of a line chart and the bars of a bar chart. The [`text`](text.md) component does not resolve `{{color:...}}`; use `markdown` for color words. See [Themes](../themes.md) for palettes and roles.

## Motion

When the element appears, its box enters with the element's `enter`, or the theme's `--sd-enter` (`rise` in `modern`, `fade` in `academic-light`), in its stagger slot; when it is hidden, its box leaves with its `exit` (default `fade`). The block itself does not move then.

`md` has the `fade` transition: when `md` changes while the element stays visible, the block fades in (`ctx.animate.fadeIn`) over the theme's `--sd-duration` (400ms in both built-in themes), or the step's `transition.duration` if set, with the theme's `--sd-easing`. A block that appears and changes on the same step is shown at once.

The engine animates only a forward move of exactly one step. A jump, a backward move or the first render shows the final text at once. Either way the component leaves no inline style behind, so a played step and a jumped-to step end in the same markup. See [Animation and motion](../../guide/animation-and-motion.md).

## Errors

An error becomes an element error, shown on the slide in place of the element and listed in `STEPDECK.errors` as `<slide>/<element>: <message>`. `check` reports it as `render-error` and `dump` lists it in the step's `errors`. Every element of a slide is mounted when the slide loads, so the error is reported at every step of the slide, including steps before the element appears.

| Message | Cause | Caught by `validate` |
|---|---|---|
| ``markdown needs a string `md` `` | `md` is missing or not a string (a number, an array, a whole-value binding to a non-string). | Yes, as `prop-invalid` (from the schema). |
| `unknown color role '<role>' in {{color:<role>}} (known roles: ...)` | No palette in use defines the role. The message lists the roles that exist, for example `accent, alert, low, high, mid` in academic-light. | No. Run `check` or `dump` to see it. |

Related `validate` rules that often fire on `md`: `remote-url` (an `http(s)://` or `//host` link), `hex-color` (a hex color, or an anchor that looks like one), and `binding-file`, `binding-pointer` and `binding-format` (a bad data binding). See [Rules](../rules.md).

## See also

- [Components](index.md): what all built-in components share.
- [text](text.md): a single paragraph in a fixed role.
- [Layouts and themes](../../guide/layouts-and-themes.md): where to place a `markdown` element.
- `components/markdown/README.md`, `schema.json` and `example.js`: the component's own files.
