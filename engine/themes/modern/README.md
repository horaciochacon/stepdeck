# modern

A neutral modern theme: Geist and Geist Mono, a deep blue accent, a rose alert, near-black titles with tight tracking, and a large cover title. White canvas, zinc greys for secondary text and rules. Colour and type carry the identity: no gradients, shadows or decorative shapes. Sizes are set for the 1920×1080 canvas and for an audience that watches at roughly 1000–1300 px (spec §3): nothing on screen goes below 28px.

Files: `tokens.css` (custom properties and `@font-face`), `theme.css` (hook rules, in the `sd-theme`
cascade layer; see "Hook rules" below), `palettes.json`, `fonts/` (vendored woff2).

## Tokens (`tokens.css`)

`modern` declares every token `academic-light` declares, plus the optional tokens below. All tokens are CSS custom properties on `:root`, prefixed `--sd-` (plus the spec name `--min-audience-font`). A deck or a slide `style` can override any of them.

### Color roles

| Token | Value | Use |
|---|---|---|
| `--sd-color-background` | `#ffffff` | Canvas background. Palettes are checked against it. |
| `--sd-color-surface` | `#f4f4f5` | Quiet panels: terminal body, code blocks, chat bubbles. |
| `--sd-color-title` | `#09090b` | Slide titles. Optional: core falls back to `--sd-color-ink`. |
| `--sd-color-ink` | `#27272a` | Body text and axis titles. |
| `--sd-color-muted` | `#5f5f68` | Secondary text: notes, labels, sources, subtitles, tick labels. Tuned, see below. |
| `--sd-color-kicker` | `#1d4ed8` | The kicker above a title (the accent blue). Optional: falls back to `--sd-color-muted`. |
| `--sd-color-accent` | `#1d4ed8` | Emphasis: links, big numbers, prompts, accent phrases. The categorical palette's `blue` (role `accent`). |
| `--sd-color-alert` | `#d81b45` | Errors and warnings. The categorical palette's `rose` (role `alert`). Tuned, see below. |
| `--sd-color-rule` | `#e4e4e7` | Hairlines: borders, separators. |
| `--sd-color-grid` | `#f0f0f2` | Chart grid lines, lighter than a rule. Optional: falls back to `--sd-color-rule`. |
| `--sd-color-dim` | `#c4c4cc` | What marks out of focus turn to when `highlight` emphasises another (`chart.line`, `chart.bar`, `diagram`). Optional: falls back to `--sd-color-rule`. Lighter than muted, darker than grid (relative luminance 0.56, against 0.12 and 0.87). |
| `--sd-color-letterbox` | `#111114` | Outside the canvas when the window is not 16:9. |

`accent` and `alert` equal the palette colors their roles point at, so `{{color:accent}}` in a markdown element names the color the audience sees ("blue", "azul").

### Type

| Token | Value | Use |
|---|---|---|
| `--sd-font-body` | `"Geist"`, system fallbacks | All text except code. |
| `--sd-font-mono` | `"Geist Mono"`, system fallbacks | Terminal, code, error boxes. |
| `--sd-font-size-display` | `128px` | Big numbers. |
| `--sd-font-size-cover` | `140px` | The title on a `title` layout slide. |
| `--sd-font-size-cover-figure` | `96px` | The cover title when the slide has a figure. Optional: falls back to `--sd-font-size-cover`. |
| `--sd-font-size-statement` | `64px` | The main sentence of a `statement` layout slide. |
| `--sd-font-size-title` | `64px` | Slide titles. |
| `--sd-font-size-heading` | `48px` | Subtitles, headings inside text. |
| `--sd-font-size-body` | `40px` | Body text. |
| `--sd-font-size-note` | `32px` | Notes, meta lines, big-number labels. |
| `--sd-font-size-label` | `28px` | Axis ticks, legends, terminal text. |
| `--sd-font-size-kicker` | `28px` | The kicker. Optional: falls back to `--sd-font-size-label`. |
| `--sd-font-size-lede` | `36px` | The message line under a title (`role: "lede"`, the slide's `lede`). |
| `--sd-font-size-source` | `28px` | Source lines. |
| `--sd-font-weight-body` | `400` | Body weight. |
| `--sd-font-weight-title` | `600` | Titles, big numbers. |
| `--sd-font-weight-strong` | `600` | Bold inside text. |
| `--sd-line-height` | `1.3` | Body leading. |
| `--sd-line-height-tight` | `1.15` | Titles and headings. |
| `--sd-letter-spacing-title` | `-0.03em` | Title tracking. Optional: falls back to `normal`. |
| `--sd-letter-spacing-cover` | `-0.05em` | Cover title tracking. Optional: falls back to `normal`. |
| `--sd-measure` | `34em` | Comfortable line length for long text. |

The minimum audience font, spacing and canvas tokens are the same as in `academic-light` (`--min-audience-font: 28px` with its alias, `--sd-grid`, `--sd-space`, `--sd-region-gap`, `--sd-canvas-margin`, `--sd-rule-width`, `--sd-diagram-gap`, `--sd-diagram-pad`, `--sd-diagram-stripe`, `--sd-diagram-compact-gap`, `--sd-diagram-compact-pad`) and so are the second-view tokens (`--sd-inset-stroke`, `--sd-inset-stroke-width`, `--sd-inset-fill`, `--sd-inset-radius`, `--sd-compact-tint`) and the period of a flowing edge (`--sd-flow-period`, in the Motion table below). See that README for the table.

### Motion

`modern` moves a little more than `academic-light`: elements rise into place by default, further, with a slightly longer gap between them. The durations, the easing and the flow period are the same in both themes.

| Token | Value | Use |
|---|---|---|
| `--sd-duration` | `400ms` | The base duration of every motion: entrances, exits, changes (charts draw over twice this). |
| `--sd-duration-fast` | `200ms` | Quick changes: each half of a text crossfade, a highlight or badge colour change. |
| `--sd-easing` | `cubic-bezier(0.65, 0, 0.35, 1)` | The easing of every motion (typing keeps a constant speed). |
| `--sd-stagger` | `80ms` | The gap between the elements that enter on one step, and between the items of a build. (`academic-light`: 60ms.) |
| `--sd-enter` | `rise` | How an element enters when its component has no build of its own. (`academic-light`: `fade`.) |
| `--sd-motion-distance` | `24px` | How far a `rise` travels. (`academic-light`: 16px.) |
| `--sd-flow-period` | `1600ms` | Ambient motion: how long one dash and one gap of a flowing `diagram` edge (`flow: true`) take to pass, at a constant speed, while the page animates. |

### Tuned values

The approved mockup used muted `#71717a` and alert `#e11d48`. Both were tuned, only as far as needed, so that text in them reaches 4.5:1 on the surface and on the chat user bubble (`color-mix(in srgb, accent 14%, surface)`, which is `#d6ddf1`):

| Token | Mockup | Shipped | On background | On surface | On chat user bubble |
|---|---|---|---|---|---|
| `--sd-color-muted` | `#71717a` | `#5f5f68` | 6.3:1 (mockup 4.8:1) | 5.8:1 (mockup 4.4:1) | 4.6:1 (mockup 3.6:1) |
| `--sd-color-alert` | `#e11d48` | `#d81b45` | 5.0:1 (mockup 4.7:1) | 4.6:1 (mockup 4.3:1) | 3.7:1 (not used there) |

Alert text sits on the background and the terminal surface, never on the chat bubble. The other text pairs:

| Pair | Contrast |
|---|---|
| `title` on background | 19.9:1 |
| `ink` on background / surface / chat user bubble | 14.9:1 / 13.6:1 / 11.0:1 |
| `accent` and `kicker` on background / surface | 6.7:1 / 6.1:1 |

`rule` (`#e4e4e7`) and `grid` (`#f0f0f2`) are decorative hairlines and carry no text, so they are not held to a text ratio. `test/unit/theme-modern.test.mjs` checks these ratios.

## Hook rules (`theme.css`)

`theme.css` is loaded after `tokens.css`, in the `sd-theme` cascade layer: its rules beat core's hook defaults
and the layouts, and lose to a slide's own `style`. It targets only published hook classes and component part
classes, never `[data-layout]`, a region name or `!important`. It sets colour and type only, plus one mark: the
cover's author line.

| Selector | What it does |
|---|---|
| `.sd-title :is(.sd-text, .sd-markdown)` | Title weight (`--sd-font-weight-title`), tracking (`--sd-letter-spacing-title`) and colour (`--sd-color-title`). A markdown title gets the same type as a text title. |
| `[data-kind="cover"] .sd-title :is(.sd-text, .sd-markdown)` | Cover tracking (`--sd-letter-spacing-cover`). The size is not set here: core picks `--sd-font-size-cover`, or `--sd-font-size-cover-figure` when the `figure` region holds an element, and a `font-size` in theme.css would override both. |
| `.sd-accent` | The accent phrase (`*phrase*` in a title): `--sd-color-accent`, `font-style: normal` (upright, not italic). |
| `.sd-kicker .sd-text` | The kicker: `--sd-font-size-kicker`, 0.12em tracking, uppercase, `--sd-color-kicker`. The line height is restated because the size is set on the text, not inherited from the wrapper. |
| `.sd-role-lede` | The message line under a title: `--sd-font-size-lede`, tight leading, `--sd-color-muted`. |
| `.sd-role-badge` | A `text` badge: an inline pill, `--sd-font-size-label`, strong weight, 0.12em tracking, uppercase, `--sd-color-accent` (a `tone` overrides both colours inline: the border in the palette colour, the text in that colour darkened to 4.5:1), with a 2px border in `currentColor` and fully rounded corners. |
| `.sd-region.sd-meta` | The author line's accent rule: a 4px `border-inline-start` along the whole meta block, transparent until a meta element is visible (`:has(> .sd-el:not(.sd-hidden, .sd-collapsed))`), so the meta text never moves. It is on the region only: core also puts `.sd-meta` on every wrapper inside it, and a border on the bare class would draw one rule per line. |
| `.sd-big-number-value` | Tracking `-0.04em`. |

The rule depends on `:has()` and on the engine state classes `.sd-hidden` and `.sd-collapsed`, which are stable
published class names.

The rule spans the whole meta region. A meta line that is hidden with `visibility: hidden` (the default for a
step-hidden element) keeps its space, so once any line is visible the rule also runs beside the hidden ones. A
line with `collapse: true` takes no space while hidden, so the rule only spans the lines that take room.

There is no `text-box-trim` on the kicker or the cover title. Trimming the line box to the capitals leaves the
glyphs outside the element box, and `check` then reports text outside the title region.

## Fonts (`fonts/`)

Vendored woff2 under the SIL Open Font License 1.1 (each family's `OFL.txt` sits next to its files; see `THIRD_PARTY_NOTICES.md`). Source: the official `vercel/geist-font` release **v1.9.2** (`https://github.com/vercel/geist-font/releases/download/v1.9.2/geist-font-v1.9.2.zip`), the files under `Geist/webfonts/` and `GeistMono/webfonts/`. They are copied unmodified; only the file names were simplified.

| Family | File | Weights | Upstream file |
|---|---|---|---|
| Geist | `fonts/geist/geist-variable.woff2` | 100–900 (variable) | `Geist[wght].woff2` |
| Geist italic | `fonts/geist/geist-italic-variable.woff2` | 100–900 (variable) | `Geist-Italic[wght].woff2` |
| Geist Mono | `fonts/geist-mono/geist-mono-variable.woff2` | 100–900 (variable) | `GeistMono[wght].woff2` |

Each file holds the Latin and Latin Extended glyphs (and more) in one variable face, so the `@font-face` rules need no `unicode-range` and the theme ships three files, not the per-subset files of `academic-light`. A variable face serves every weight the engine asks for (400, 500, 600, 700). Geist has the `tnum` (tabular numbers) feature, which big numbers, list markers and chart ticks use through `font-variant-numeric: tabular-nums`; a unit test reads it from the file's GSUB table.

`@font-face` rules use URLs relative to `tokens.css` and `font-display: block`; the runtime loads every declared face before it mounts a slide, so `check`, `dump` and screenshots never measure a fallback font.

### Italic

Geist v1.9.2 ships a real italic, so `modern` loads it as a second `Geist` face (`font-style: italic`). `*emphasis*` in markdown, lists and chat renders in Geist Italic, not in a synthesized oblique, and no `em` rule is needed. This replaces both options considered earlier (accept a synthesized oblique, or map `em` to a heavier upright weight): the font now provides the correct glyphs, and emphasis keeps its usual meaning. Geist Mono has no italic face here; code is not italicised in the engine.

## Palettes (`palettes.json`)

Same shape as `academic-light` (see that README for the format).

| Palette | Kind | Source |
|---|---|---|
| `modern` (default) | categorical | stepdeck; deep blue, rose and teal from the mockup |
| `viridis` (default) | sequential | viridis, van der Walt and Smith, CC0 (as in `academic-light`) |
| `blue-red` (default) | diverging | ColorBrewer RdBu, Apache 2.0 (as in `academic-light`) |

### modern

Deep blue, rose and teal come from the approved mockup (the rose darkened, see above). Amber, violet and green were chosen to stay at least 3:1 on white and at least CIEDE2000 10 from every other color under simulated protanopia, deuteranopia and tritanopia. The first three colors are the most distinct, because charts assign colors in series order.

| id | en / es | Value | Contrast on white |
|---|---|---|---|
| `blue` (accent) | blue / azul | `#1d4ed8` | 6.7:1 |
| `rose` (alert) | rose / rosa | `#d81b45` | 5.0:1 |
| `teal` | teal / verde azulado | `#0d9488` | 3.7:1 |
| `amber` | amber / ámbar | `#c47d04` | 3.3:1 |
| `violet` | violet / violeta | `#8972b3` | 4.1:1 |
| `green` | green / verde | `#1f6708` | 7.0:1 |

Smallest pairwise difference under simulated color-vision deficiency: CIEDE2000 10.8 (blue/violet, protanopia). The check requires 8. `checkPalette` (`cli/palettes.js`) passes with no problems.

## Font licences

| Font | Version | Licence | Copyright |
|---|---|---|---|
| Geist, Geist italic | 1.9.2 (font version 1.900) | SIL Open Font License 1.1 (`fonts/geist/OFL.txt`) | Copyright 2026 The Geist Project Authors (https://github.com/vercel/geist-font) |
| Geist Mono | 1.9.2 (font version 1.900) | SIL Open Font License 1.1 (`fonts/geist-mono/OFL.txt`) | Copyright 2026 The Geist Project Authors (https://github.com/vercel/geist-font) |
