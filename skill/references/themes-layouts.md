# Themes, palettes and layouts

The canvas is 1920×1080 (16:9). Every size, box and position is in canvas pixels, whatever the window size.

## Layouts and regions

A slide picks a layout with `layout: "<name>"`. The default is `full-bleed`.
- A layout is a CSS grid with named **regions**. Elements go into a region with `region: "<name>"` (default `main`) and stack vertically in the order listed.
- An element with `box: { x, y, w, h }` floats on the canvas instead.

List the layouts with `catalog`. `catalog <layout> my-talk` prints its regions and grid variables. The built-ins:

| Layout | Regions | Grid variables (default) |
|---|---|---|
| `title` | `title`, `subtitle`, `meta`, `figure`, `footer` | `--title-width` (1400px), `--meta-gap` (64px), `--figure-width` (720px) |
| `figure-notes` | `title`, `main`, `notes`, `footer` | `--notes-width` (560px), `--notes-gap` (72px) |
| `full-bleed` | `title`, `main` | `--title-height` (auto) |
| `statement` | `title`, `main`, `footer` | `--statement-width` (1500px) |
| `halves` | `title`, `left`, `right`, `footer` | `--split` (`1fr 1fr`), `--gutter` (`var(--sd-region-gap)`), `--align` (`start`) |

- **Region size.** Override a grid variable per slide:

  ```js
  regions: { "--notes-width": "700px" }
  ```

  Use this when text overflows a region (`text-outside-region`) or a long title wraps badly.
- **`title`:** a cover (`kind: "cover"`). The slide's `section` is the kicker on the top margin, the title and subtitle sit in the upper middle, the `meta` block (authors, affiliation, date) is on the bottom margin and the `footer` line is below it. `--meta-gap` is the *least* space between the subtitle and `meta`. Keep the title to one to three lines: at `modern`'s cover size a kicker plus 4 lines overflows, 4 lines can too with a two-line `meta` and a footer, and 5 or more always do (`check` reports `text-outside-region`).
- **`title`, `figure`:** optional. Empty, the cover is the plain one. With an element (usually an `image`), the cover switches to two columns: the title column takes the rest of the width, the figure gets `--figure-width`, and the title drops to the smaller `--sd-font-size-cover-figure`. A cover layout gets this only for a region named `figure`.
- **`statement`:** one large sentence or question, centred both ways in the statement size (`--sd-font-size-statement`). Use `markdown` for bold terms. The title is optional. Other elements in `main`, such as a list or a timeline, sit in the centred column, in the middle of the canvas; a chart or a diagram needs a region with height instead.
- **`halves`:** two columns under a title band, for before and after or a prompt and its tasks. A chart, diagram, image or terminal in a half takes the height the other elements leave. `regions: { "--split": "2fr 1fr" }` makes the halves unequal. `--align` (`start`, `center` or `end`) moves the content of both halves vertically: `regions: { "--align": "center" }` centres short halves instead of leaving the lower part of the slide empty.
- **`figure-notes`, `main`:** a chart, diagram, image or terminal takes the height the other elements leave. This is the home for `chart.line` and `chart.bar`.
- **Charts fill their region.** A `chart.line` or `chart.bar` takes the height the other elements in its region leave, so a source line can sit beside it (`full-bleed` has no `footer`, so there it goes in `main`). `statement` `main` has no set height and a chart there collapses to zero. Sizes are in the Fill rules table of the Layouts reference (`docs/reference/layouts.md`).
- **`figure-notes`, `notes`:** at the default width, the column holds about 20 characters per line at the body size. Use `role: "note"` (32px) for longer notes, or widen `--notes-width`.
- **Unknown regions.** An element that names a region its layout lacks is an error (`unknown-region`).

## Kicker and accent phrase

- **Kicker.** `section: "Methods"` on a slide shows a small label above the title (a `text` element with the reserved id `kicker`; do not define your own, `reserved-id`). It needs a layout with a `title` region; on one without, it is dropped and `validate` warns `kicker-no-region`. Give every slide of a section the same string. To hide it on one slide: `style: '[data-el="kicker"] { display: none }'`.
- **Accent phrase.** In a slide's `title`, `*phrase*` is drawn in the accent colour, upright: `title: "Analysing data with *an agent*"`. Use one phrase. `\*` is a literal asterisk, `\\` a literal backslash. An odd number of `*` is `title-accent` and `**` is `accent-empty` (both warnings; the text shows the asterisks as written). Only the `title` sugar and a `text` element with id `title` are parsed (set `accent: false` to turn it off); a `markdown` title keeps markdown emphasis. `STEPDECK.state().title` and `dump --json` props keep the raw string.

**Slide `style`** is scoped CSS for small touches:
- every selector is prefixed with the slide, so it cannot leak;
- a selector starting with `:scope` or `&` targets the slide's canvas itself.

```js
style: ":scope { --sd-region-gap: 40px; } .sd-role-note { max-width: 20em; }"
```

## Theme tokens

A deck sets its theme in `deck.js`: `theme: "modern"`, the default. Two themes are built in: `modern` (Geist, a deep blue accent, large cover title) and `academic-light` (the plain one). `?theme=<name>` overrides it for one page load, and `check`, `dump` and `shoot` take `--theme <name>` (`validate` has no override: it checks `deck.theme`). A theme folder name is lowercase letters, digits and hyphens. A theme is:
- a `tokens.css` of CSS custom properties;
- an optional `theme.css`: rules for the published styling hooks (see below). A missing one is fine, and `check` does not report it;
- a `palettes.json`;
- vendored fonts.

Components and layouts read only tokens, never raw colors or sizes. `catalog modern my-talk` lists every token with its value. The main ones (sizes are the same in both themes, except the cover and the lede):

| Group | Tokens |
|---|---|
| Color roles | `--sd-color-background`, `-surface`, `-ink`, `-muted`, `-accent`, `-alert`, `-rule`; optional `-title`, `-kicker`, `-grid` (fall back to ink, muted, rule) and `-dim` (what `highlight` turns the rest to; falls back to rule) |
| Type | `--sd-font-body`, `--sd-font-mono`; sizes `--sd-font-size-display` (128), `-cover` (`modern` 140, `academic-light` 88), `-title` (64), `-statement` (64), `-heading` (48), `-body` (40), `-note` (32), `-label` (28), `-source` (28); optional `-cover-figure` (the cover title beside a figure; falls back to cover), `-kicker` (28; falls back to label) and `-lede` (the message line: `modern` 36, `academic-light` 32; falls back to note), and tracking `--sd-letter-spacing-title`, `-cover` (fall back to `normal`) |
| Spacing | `--sd-grid` (8px), `--sd-space` (16px), `--sd-region-gap` (24px), `--sd-canvas-margin` (96px), `--sd-rule-width`, `--sd-diagram-gap` (48px, between diagram cells), `--sd-diagram-pad` (16px, inside diagram nodes and groups), `--sd-diagram-stripe` (a grid unit, a diagram card's stripe), `--sd-diagram-compact-gap` (16px) and `--sd-diagram-compact-pad` (6px) for a compact diagram |
| Motion | `--sd-duration` (400ms), `--sd-duration-fast` (200ms), `--sd-easing`, `--sd-stagger` (`modern` 80ms, `academic-light` 60ms), `--sd-enter` (`rise`, `fade`), `--sd-motion-distance` (24px, 16px) |
| Audience | `--min-audience-font` (28px); `--sd-min-audience-font` is an alias of it (`var(--min-audience-font)`) |

**Hooks, layers and `theme.css`.** Core puts published classes on the elements that play a role: `sd-title` (the title element), `sd-kicker`, `sd-lede` (the message line's box), `sd-accent`, and `sd-subtitle`, `sd-meta`, `sd-statement` on a layout's mapped regions and every element wrapper in them. A theme restyles them in `theme.css`. CSS runs in cascade layers, lowest first: `sd-core` (with `components` and `hooks` inside), `sd-layout`, `sd-theme` (`theme.css`), `sd-deck` (declared and empty, reserved for per-deck overrides), `sd-slide` (the slide's `style`). So a slide's `style` always beats the theme. Rules for `theme.css`:
- target hook classes and component part classes, never `[data-layout]`, region names or `!important`;
- a hook class is on the region *and* its wrappers, so put box properties (border, padding, background) on the region only: `.sd-region.sd-meta`, not `.sd-meta`;
- set inherited properties on the hook element (`.sd-kicker { color: … }`), not on its inner `.sd-text`, so a slide's `style` on that element still wins;
- do not set `font-size` on `.sd-title` (it would override the cover sizes); use the size tokens.

**Minimum audience font.** Every piece of audience text must be at least `--min-audience-font`, 28px on the 1920×1080 canvas. The audience may watch at about 1000 px wide.
- `check` reports smaller text as `font-too-small`.
- Exempt: `role: "source"` text, and anything in a `footer` region.
- A token can be overridden for one slide in `style` (`:scope { --sd-font-size-body: 44px; }`). Never go below the minimum.

## Palettes

`palettes.json` holds palettes of three kinds: `categorical`, `sequential` and `diverging`. The theme names a default for each kind (`modern`: `modern`, `viridis`, `blue-red`; `academic-light`: `okabe-ito-dark`, `viridis`, `blue-red`).
- **Choosing one.** A deck picks another palette of a kind with `palette: "<name>"` in `deck.js`. It must belong to the theme (`unknown-palette`).
- **Color names.** Each color has a name per language. **Roles** map meanings to colors: categorical `accent` and `alert`; sequential and diverging `low`, `mid` and `high`.
- **Color words.** `{{color:accent}}` in a **markdown** element becomes that color's name in the deck language, such as "blue" or "azul". Text then never names a color the theme does not show.
- **Order.** Charts assign categorical colors in series order, and the first color is the accent.
- **Contrast.** Palette colors promise 3:1 against the background, enough for marks. Text needs 4.5:1 (`contrast` in check), so components darken label colors as needed.

## Adding a theme or a layout

Themes and layouts are looked up in the deck's engine copy, `my-talk/stepdeck/`. To add one, add a folder there.

**A theme:**
1. Copy `my-talk/stepdeck/themes/modern/` to `my-talk/stepdeck/themes/<name>/`. The name is lowercase letters, digits and hyphens.
2. Edit `tokens.css`. Keep every token name, because components read them (the optional ones listed above may be left out). Edit or delete `theme.css`.
3. Edit `palettes.json`, with the same shape: `default`, then `palettes.<name>` with `kind`, `colors` (`{ id, value, names: { en, es } }`) and `roles`.
   - Keep `--sd-color-accent` and `--sd-color-alert` equal to the colors their palette roles point at.
   - Otherwise `{{color:accent}}` names one color while the slide shows another, and no check catches it.
4. Edit the first paragraph of the README, which is the catalog summary.
5. Set `theme: "<name>"` in `deck.js` and run validate (or try it with `check --theme <name>`). It checks the following:
   - `--sd-color-background` exists and is hex (`theme-background`);
   - every categorical color has 3:1 contrast against it (`palette-contrast`, whose fix names a darker value);
   - the colors stay distinguishable under color-vision deficiency (`palette-cvd`).

**A layout:** create `my-talk/stepdeck/layouts/<name>/` with these files:
- **`schema.json`**, a descriptor, not a JSON Schema:

  ```json
  { "name": "<name>", "description": "One sentence.",
    "regions": [{ "name": "title", "description": "…" }, { "name": "main", "description": "…" }],
    "variables": [{ "name": "--side-width", "default": "600px", "description": "…" }] }
  ```

  A wrong shape fails validate (`layout-schema`).
- Optional in `schema.json`: `"kind": "cover"` for a cover layout (its title takes the cover size; a region named `figure` makes it smaller while it holds an element), and `"hooks": { "<region>": "subtitle" | "meta" | "statement" | … }` to give a region a published hook.
- **`layout.css`**, scoped to `.sd-canvas[data-layout="<name>"]`. It is placement only: no `color`, `font*`, `letter-spacing`, `text-transform`, `line-height`, `text-align`, `--sd-*` property or `!important`, and `font-size` only as `var(--sd-…)`. The `title` region must sit in a stretched or sized grid track (never `auto`), because it is an inline-size container. It sets `grid-template-columns`, `grid-template-rows` and `grid-template-areas` with the region names, and `padding: var(--sd-canvas-margin)`.
  - Each region is `[data-region="<name>"]`, a vertical stack with `grid-area` already set.
  - Read grid variables with a fallback: `var(--side-width, 600px)`.
  - Give the title band room below it, as the built-ins do. Without this, the title touches the content and `check` reports `text-overlap`:

  ```css
  .sd-canvas[data-layout="side"] {
    grid-template-columns: minmax(0, 1fr) var(--side-width, 600px);
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: "title title" "main side";
    column-gap: 72px;
    padding: var(--sd-canvas-margin);
  }
  .sd-canvas[data-layout="side"] > [data-region="title"] { padding-bottom: calc(var(--sd-region-gap) * 2); }
  ```
- **`README.md`** and **`example.js`**: optional, and shown by the catalog.
