# academic-light

The plain alternative theme: restrained and academic. White canvas, near-black ink, one blue accent, a
vermillion alert, hairline greys for rules. No gradients, shadows or decorative shapes; hierarchy
comes from size, weight and the muted color. Sizes are set for the 1920×1080 canvas and for an
audience that watches at roughly 1000–1300 px: nothing on screen goes below 28px.

Files: `tokens.css` (custom properties and `@font-face`), `theme.css` (rules for the published hooks:
today's title weight, a plain muted kicker and the muted subtitle; loaded in the `sd-theme` cascade layer; the
message line (`.sd-role-lede`) and the badge pill (`.sd-role-badge`) are core's rules, fed by this theme's tokens),
`palettes.json`, `fonts/` (vendored woff2).

## Tokens (`tokens.css`)

All tokens are CSS custom properties on `:root`, prefixed `--sd-` (plus the spec name
`--min-audience-font`). Components and layouts read only these, never raw colors or sizes. A deck
or a slide `style` can override any of them.

### Color roles

| Token | Value | Use |
|---|---|---|
| `--sd-color-background` | `#ffffff` | Canvas background. Palettes are checked against it. |
| `--sd-color-surface` | `#f5f5f3` | Quiet panels: terminal body, code blocks. |
| `--sd-color-title` | `#1c1c1e` | Slide titles. Optional: core falls back to `--sd-color-ink`. Same value as ink here. |
| `--sd-color-ink` | `#1c1c1e` | Text and axis titles. |
| `--sd-color-muted` | `#5b5b62` | Secondary text: notes, labels, sources, subtitles, tick labels (6.7:1 on white). |
| `--sd-color-kicker` | `#5b5b62` | The kicker above a title. Optional: falls back to `--sd-color-muted`. Same value as muted here. |
| `--sd-color-accent` | `#0072b2` | Emphasis: links, big numbers, prompts. The categorical palette's `blue` (role `accent`). |
| `--sd-color-alert` | `#b75002` | Errors and warnings. The categorical palette's `vermillion` (role `alert`). |
| `--sd-color-rule` | `#d4d4d8` | Hairlines: grid lines, borders, separators. |
| `--sd-color-grid` | `#d4d4d8` | Chart grid lines. Optional: falls back to `--sd-color-rule`. Same value as rule here. |
| `--sd-color-dim` | `#b4b4bb` | What marks out of focus turn to when `highlight` emphasises another (`chart.line`, `chart.bar`, `diagram`). Optional: falls back to `--sd-color-rule`. Lighter than muted, darker than grid (relative luminance 0.46, against 0.11 and 0.66). |
| `--sd-color-letterbox` | `#111114` | Outside the canvas when the window is not 16:9. |

`accent` and `alert` equal the palette colors their roles point at, so `{{color:accent}}` in a
markdown element names the color the audience sees ("blue", "azul").

### Type

| Token | Value | Use |
|---|---|---|
| `--sd-font-body` | `"Source Sans 3"`, system fallbacks | All text except code. |
| `--sd-font-mono` | `"IBM Plex Mono"`, system fallbacks | Terminal, code, error boxes. |
| `--sd-font-size-display` | `128px` | Big numbers. |
| `--sd-font-size-cover` | `88px` | The title on a `title` layout slide. |
| `--sd-font-size-cover-figure` | `88px` | The cover title when the slide has a figure. Optional: falls back to `--sd-font-size-cover`. Same value as cover here. |
| `--sd-font-size-statement` | `64px` | The main sentence of a `statement` layout slide. |
| `--sd-font-size-title` | `64px` | Slide titles (the `title` region). |
| `--sd-font-size-heading` | `48px` | Subtitles, headings inside text. |
| `--sd-font-size-body` | `40px` | Body text (default text role). |
| `--sd-font-size-note` | `32px` | Notes (`role: "note"`), meta lines, big-number labels. |
| `--sd-font-size-label` | `28px` | Axis ticks, legends, terminal text. |
| `--sd-font-size-kicker` | `28px` | The kicker. Optional: falls back to `--sd-font-size-label`. Same value as label here. |
| `--sd-font-size-lede` | `32px` | The message line under a title (`role: "lede"`, the slide's `lede`). |
| `--sd-font-size-source` | `28px` | Source lines (`role: "source"`). |
| `--sd-font-weight-body` | `400` | Body weight: the canvas's `font-weight`, which all text inherits unless a rule sets its own. |
| `--sd-font-weight-title` | `600` | Titles, big numbers. |
| `--sd-font-weight-strong` | `600` | Bold inside text. |
| `--sd-line-height` | `1.3` | Body leading. |
| `--sd-line-height-tight` | `1.15` | Titles and headings. |
| `--sd-letter-spacing-title` | `normal` | Title tracking. Optional: falls back to `normal`. |
| `--sd-letter-spacing-cover` | `normal` | Cover title tracking. Optional: falls back to `normal`. |
| `--sd-measure` | `34em` | Reserved, unused: no rule of the engine reads it (text is as wide as its region). Declared so a deck's own `style` may use it as a line length (`max-width: var(--sd-measure)`). |

### Minimum audience font

| Token | Value | Use |
|---|---|---|
| `--min-audience-font` | `28px` | Spec name (§7), enforced by `stepdeck check`. |
| `--sd-min-audience-font` | `var(--min-audience-font)` | An alias under the theme prefix (used by error boxes and read by `check`). Edit `--min-audience-font`. |

### Spacing and canvas

| Token | Value | Use |
|---|---|---|
| `--sd-grid` | `8px` | Base unit; every spacing token is a multiple. |
| `--sd-space` | `16px` | Default inner spacing (two units). |
| `--sd-region-gap` | `24px` | Gap between stacked elements in a region. |
| `--sd-canvas-margin` | `96px` | Canvas margin on every side (layouts use half of it at the bottom, under the footer). |
| `--sd-rule-width` | `2px` | Hairline width for rules and borders. |
| `--sd-diagram-gap` | `48px` | Gap between the grid cells of a `diagram`. Keep it at least twice `--sd-diagram-pad`, so neighbouring group boxes never touch (`validate` flags it). |
| `--sd-diagram-pad` | `16px` | Padding of a `diagram` group box around its members; each nesting level adds one more. |
| `--sd-diagram-stripe` | `var(--sd-grid)` | Width of the stripe on a `diagram` card's left edge. |
| `--sd-diagram-compact-gap` | `16px` | Gap between the grid cells of a compact `diagram`. Keep it at least twice `--sd-diagram-compact-pad` (`validate` flags it). |
| `--sd-diagram-compact-pad` | `6px` | Padding of a compact `diagram` group box around its members, and the inset of a compact `diagram`'s or `map`'s drawing inside its frame. |

### Second views

| Token | Value | Use |
|---|---|---|
| `--sd-inset-stroke` | `var(--sd-color-ink)` | Colour of the frame of a second view (a compact `diagram` or `map`, a map's inset). |
| `--sd-inset-stroke-width` | `var(--sd-rule-width)` | Width of that frame. |
| `--sd-inset-fill` | `var(--sd-color-background)` | Fill of that frame, and of a compact view's caption. |
| `--sd-inset-radius` | `0px` | Corner radius of that frame. |
| `--sd-compact-tint` | `20%` | Share of a colour mixed into the background for a lit part of a compact view. |

### Motion

| Token | Value | Use |
|---|---|---|
| `--sd-duration` | `400ms` | The base duration of every motion: entrances, exits, changes (charts draw over twice this). |
| `--sd-duration-fast` | `200ms` | Quick changes: each half of a text crossfade, a highlight or badge colour change. |
| `--sd-easing` | `cubic-bezier(0.65, 0, 0.35, 1)` | Ease-in-out; short and discrete for viewers on a video call. Every motion uses it (typing keeps a constant speed). |
| `--sd-stagger` | `60ms` | The gap between the elements that enter on one step, and between the items of a build. |
| `--sd-enter` | `fade` | How an element enters when its component has no build of its own: a plain fade, the quietest entrance. |
| `--sd-motion-distance` | `16px` | How far a `rise` travels (list and chat items rise in this theme too). |
| `--sd-flow-period` | `1600ms` | Ambient motion: how long one dash and one gap of a flowing `diagram` edge (`flow: true`) take to pass, at a constant speed, while the page animates. |

## Fonts (`fonts/`)

Vendored woff2, latin and latin-ext subsets only, under the SIL Open Font License 1.1 (each
family's `OFL.txt` sits next to its files; see `THIRD_PARTY_NOTICES.md`):

| Family | Files | Weights |
|---|---|---|
| Source Sans 3 | `fonts/source-sans-3/` | 400, 400 italic, 600, 700 |
| IBM Plex Mono | `fonts/ibm-plex-mono/` | 400, 500 |

`@font-face` rules use URLs relative to `tokens.css` (the runtime rebases them when it injects the
tokens) and `font-display: block`; the runtime also loads every declared face before it mounts a
slide, so `check`, `dump` and screenshots never measure a fallback font. Ask for weights the
theme ships (400, 600, 700): other weights resolve to the nearest one.

## Palettes (`palettes.json`)

`{ default: { categorical, sequential, diverging }, palettes: { <name>: { kind, description, source, colors: [{ id, value, names: { en, es } }], roles: { <role>: <color id> } } } }`

`kind` is `categorical`, `sequential` or `diverging`. Each color has a name per language (used by
`{{color:…}}`). `roles` maps semantic roles (`accent`, `alert`, `low`, `mid`, `high`) to a color id.
A deck picks another palette of the same kind with `palette: "<name>"` in deck.js.

| Palette | Kind | Source |
|---|---|---|
| `okabe-ito-dark` (default) | categorical | Okabe and Ito (2008), darkened |
| `viridis` (default) | sequential | viridis, van der Walt and Smith, CC0 |
| `blue-red` (default) | diverging | ColorBrewer RdBu, Apache 2.0 |

### okabe-ito-dark

Raw Okabe-Ito fails 3:1 on white (orange 2.2:1, sky blue 2.3:1, yellow 1.3:1). Each color was
darkened by lowering its OKLab lightness with the hue kept, then the set was re-separated for
color-vision deficiency (green, vermillion and purple darker than the 3:1 minimum, so no two
colors share a lightness). Black (the ink color) and yellow (olive once darkened, and nearly
identical to orange under deuteranopia) are left out. The first two colors are the most distinct,
because charts assign colors in series order.

| id | en / es | Okabe-Ito | Shipped | Contrast on white |
|---|---|---|---|---|
| `blue` (accent) | blue / azul | `#0072B2` | `#0072b2` | 5.2:1 |
| `orange` | orange / naranja | `#E69F00` | `#c38602` | 3.1:1 |
| `green` | bluish green / verde azulado | `#009E73` | `#049069` | 4.0:1 |
| `vermillion` (alert) | vermillion / bermellón | `#D55E00` | `#b75002` | 5.0:1 |
| `purple` | reddish purple / morado rojizo | `#CC79A7` | `#b56592` | 4.0:1 |
| `sky` | sky blue / celeste | `#56B4E9` | `#3a9bce` | 3.1:1 |

Smallest pairwise difference under simulated CVD: CIEDE2000 8.8 (blue/green, tritanopia; and
blue/purple, protanopia). The check requires 8.

### Checking a palette

`cli/palettes.js` exports `checkPalette(palette, background) -> Problem[]`:

- `palette-contrast`: every categorical color needs WCAG contrast of at least 3:1 against the
  background (marks: lines, points, labels). The fix names a darkened value that passes.
- `palette-cvd`: every pair of categorical colors must differ by at least CIEDE2000 8 under
  simulated protanopia, deuteranopia and tritanopia (Machado, Oliveira and Fernandes 2009,
  severity 1).

Sequential and diverging palettes are fill scales read against each other and a legend: their
light ends (viridis yellow 1.3:1, the diverging neutral 1.1:1) are meant to approach the
background, so the contrast rule does not apply to them.
