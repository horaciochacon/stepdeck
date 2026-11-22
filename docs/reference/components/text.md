# text

`text` shows one paragraph of plain text: body copy, a note, a short label, a source line, the message line under a title or a badge. This page lists every prop, how each role looks in the built-in theme, the markup the component renders, when it animates, and the mistakes that are easy to make. It is for anyone writing slides by hand or reviewing what an agent wrote.

Sources: [`components/text/schema.json`](../../../engine/components/text/schema.json), [`components/text/index.js`](../../../engine/components/text/index.js), [`core/stepdeck.css`](../../../engine/core/stepdeck.css). For the other components, see the [components reference](index.md).

## Use it

A note in the side column and a source line in the footer, from the starter deck (`templates/talk/slides/chart.js`):

```js
{ id: "note", region: "notes", type: "text", from: "mark",
  props: { role: "note", text: "From 2020 on, Group B rises three times faster than before." } },
{ id: "source", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic example data (data/make-data.mjs)." } },
```

A slide's `title` string is also a `text` element: the engine adds `{ id: "title", type: "text", region: "title", props: { text, accent: true } }` unless the slide already has an element with id `title`, and its `section` string becomes a `text` element with id `kicker` above it (see the [deck and slide spec](../deck-and-slide.md)).

## Props

| Prop | Type | Required | Default | Transition | Meaning |
| --- | --- | --- | --- | --- | --- |
| `text` | string | yes | | fade | The text to show. It may hold a data binding such as `{{data/summary.json#/responders \| ,.0f}}`; the engine resolves it before the component sees it. |
| `role` | `body` \| `source` \| `note` \| `label` \| `lede` \| `badge` | no | `body` | snap | Typographic role: body copy, a source or citation line, a side note, a short label, a message line under a title, or a badge. The slide `lede` string and a `text` element with id `lede` get `role: "lede"` unless their props say otherwise. |
| `tone` | integer ≥ 0 | no | | fade | For `role: "badge"`: the index of the badge's colour in the deck's categorical palette (0 is the first colour). Without it, or past the palette's end, the badge is in the theme's accent colour. A change while the badge is on screen fades the colour. The pill's border takes the palette colour as it is; the text takes it darkened (lightened on a dark background) until it reaches 4.5:1 on the background, so every tone passes `check`. |
| `accent` | boolean | no | `false` | snap | Render `*phrase*` as an [accent phrase](#accent-phrase). The slide `title` string and a `text` element with id `title` get `accent: true` unless their props say otherwise. |

The schema has `additionalProperties: false`, so any other prop is a `validate` error (`unknown-prop`). Bindings are covered in [Data and bindings](../../guide/data-and-bindings.md).

## Roles and sizes

Each role maps to a theme token. The sizes below are the same in both built-in themes (`modern`, the default, and `academic-light`), except the `lede` size, which the table gives per theme; the colors are each theme's own.

| Role | Font size token | Size | Color |
| --- | --- | --- | --- |
| `body` | `--sd-font-size-body` | 40px | ink (`--sd-color-ink`, inherited from the canvas) |
| `note` | `--sd-font-size-note` | 32px | muted (`--sd-color-muted`) |
| `label` | `--sd-font-size-label` | 28px | muted |
| `source` | `--sd-font-size-source` | 28px | muted |
| `lede` | `--sd-font-size-lede` | `modern` 36px, `academic-light` 32px | muted |
| `badge` | `--sd-font-size-label` | 28px | accent; with a `tone`, the palette colour darkened to 4.5:1. An inline uppercase pill with a 2px border in the accent or the tone's palette colour |

Some places override the size. Core does this with the published hooks (see [Themes](../themes.md#styling-hooks)); a theme can restyle them:

| Where the element sits | What changes |
| --- | --- |
| The element with id `title` (the slide's `title`; hook `.sd-title`), in any layout | Size `--sd-font-size-title` (64px), weight `--sd-font-weight-title` (600), tight line height, `--sd-letter-spacing-title`, color `--sd-color-title`. A `markdown` title gets the same type. |
| That title on a `title`-layout slide (a `kind: "cover"` layout) | Size `--sd-font-size-cover` (`modern` 140px, `academic-light` 88px), cover tracking, balanced line wrap. While the layout's `figure` region holds an element: `--sd-font-size-cover-figure`. |
| The `kicker` element (the slide's `section`; hook `.sd-kicker`) | Size `--sd-font-size-kicker` (28px), strong weight, uppercase, 0.12em tracking, color `--sd-color-kicker`. |
| The `lede` element (the slide's `lede`; hook `.sd-lede`) | No rule of its own: its `lede` role sets the type (below). |
| `subtitle` region of the `title` layout (hook `.sd-subtitle`) | Size `--sd-font-size-heading` (48px), muted color, balanced line wrap. |
| `meta` region of the `title` layout (hook `.sd-meta`) | Size `--sd-font-size-note` (32px). |
| `main` region of the `statement` layout (hook `.sd-statement`) | Size `--sd-font-size-statement` (64px), centered, balanced line wrap. |

Other text in a `title` region, with an id other than `title` and `kicker`, is not a title: it keeps its role's size (body, unless `role` says otherwise). These hook rules sit on the element's wrapper and the text inherits them; a role's own size is set on the text itself, so a `role: "note"` text placed in a hook region keeps the note size.

Token values and how to change them are in [Themes](../themes.md); regions per layout are in [Layouts](../layouts.md).

## Markup

Inside its element wrapper (`div.sd-el[data-el][data-type="text"]`) the component renders one paragraph:

```html
<p class="sd-text sd-role-note">A side note.</p>
```

The class is always `sd-text sd-role-<role>`, with `<role>` one of the six roles. A badge with a `tone` also has two inline declarations, `color` (the palette colour darkened to 4.5:1) and `border-color` (the palette colour), the only inline styles a `text` keeps. The text is set with `textContent`, so Markdown and HTML are shown as typed. Use slide `style` with these classes to restyle one slide.

## Accent phrase

With `accent: true`, each pair of asterisks marks an accent phrase, rendered as `<em class="sd-accent">phrase</em>` inside the paragraph:

```js
{ id: "title", type: "text", region: "title", props: { text: "Analysing data with *an agent*", accent: true } }
```

- The accent colour (`--sd-color-accent`) comes from the hook `.sd-accent`. The `<em>` is not italic by default (`font-style: normal`); a theme or a slide `style` can change that.
- `\*` is a literal asterisk and `\\` a literal backslash. An unmatched `*` stays literal. `**` renders as two literal asterisks (titles are not markdown).
- The text is built from DOM nodes, never HTML: markup in it shows as typed.
- Text that comes from a data binding is escaped before parsing, so a bound `*` never makes a phrase.
- `validate` warns `title-accent` (an odd number of unescaped `*`) and `accent-empty` (`**`) for a title; both are described in [Rules](../rules.md).
- Changing only `accent` re-renders the paragraph at once (no animation).

The slide `title` string and an explicit `text` title element get `accent: true` by default; set `accent: false` to show every `*` as written.

## Motion

The engine animates only when you move forward exactly one step, in a live presentation with motion on. Every other move (a jump, a backward move, the first render, capture mode for `shoot` and `check`) renders the new state at once.

| What happens on the step | Motion |
| --- | --- |
| The element becomes visible | Its box enters with the element's `enter`, or the theme's `--sd-enter` (`rise` in `modern`, `fade` in `academic-light`), in its stagger slot. The paragraph itself does not move. |
| The element becomes hidden | Its box leaves with its `exit` (default `fade`). |
| `text` changes while the element stays visible | The paragraph crossfades: the old text fades out over `--sd-duration-fast` (200ms), the text swaps, and the new text fades in over the same time. A step's `transition.duration` is the whole crossfade (each half is `duration / 2`); `0` snaps. The slide's title, `lede` and badges crossfade the same way. |
| A badge's `tone` changes while it stays visible | The text and border colours fade to the new tone's, over the crossfade when the text changes too, else over one `--sd-duration-fast`. |
| The element appears and its `text` changes on the same step | The new text is shown at once; only the box moves. |

Changing only `role` or `accent` never animates. An aborted step renders the final text at once. After the update no inline style is left (a badge keeps only its tone's `color` and `border-color`), so a played step and a jumped step end with the same markup. See [Animation and motion](../../guide/animation-and-motion.md).

### The message line and badges

The slide's `lede` string is a `text` element with id `lede` and `role: "lede"`: one muted line right under the title. Change it per step with `set: { lede: { text: "…" } }`; it crossfades. A `role: "badge"` text is an uppercase pill; place it where it belongs (the notes column, or above the title with an explicit `title` element after it) and flip its text per step. Both are shown in the gallery's `motion-message` slide, and the [motion guide](../../guide/animation-and-motion.md#slide-devices) has the recipes.

## Gotchas

**An invalid role renders as body.** At runtime the component falls back to `body` for any role it does not know; it records no error. Only `validate` catches it, through the schema:

```text
closing/bad · prop-invalid · role = "caption" vs one of "body", "source", "note", "label", "lede", "badge" · set role to one of "body", "source", "note", "label", "lede", "badge" (props of text)
```

Run `validate` before you trust a slide that looks right in the browser.

**`{{color:...}}` is not resolved in `text`.** `"Accent is {{color:accent}}."` is shown literally, braces included. Color words from the palette work only in the [`markdown`](markdown.md) component; use `markdown` when the text must name a series color.

**`role: "source"` has two special meanings for the checks.**

- It satisfies `figure-source`: a slide with a figure (a `chart.*`, `map`, `map.*` or `big-number` element) fails `validate` unless some element has `props.role === "source"` from the start.
- It is exempt from `font-too-small`: `check` lets source lines go below the minimum audience font (`--sd-min-audience-font`, 28px in both built-in themes). Elements in a region named `footer` are exempt too. A `label` or `note` gets no exemption, so do not shrink them below the minimum with slide `style`.

See [Rules](../rules.md) for every rule, and the [CLI reference](../cli.md) for the commands that run them.

## For agents

The agent-facing summary of this component is in [`skill/references/components.md`](../../../skill/references/components.md). `node cli/index.js catalog text` prints the same props from the schema, run from the stepdeck repository root. In your own deck folder, run `node /path/to/stepdeck/cli/index.js catalog text` (see [`catalog`](../cli.md#catalog)).
