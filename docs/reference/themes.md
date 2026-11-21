# Themes, tokens and palettes

This page is the reference for themes: the files a theme is made of, how the engine loads one, the cascade layers and styling hooks a theme can use, every token and palette of the built-in themes, and the checks that `validate` and `check` run against a theme. It is for deck authors who want to know what a token does or which palette a chart draws with, and for contributors who add or change a theme.

For the tasks (choosing a theme, a palette and a language for a deck) read [Using layouts and themes](../guide/layouts-and-themes.md) first. Agents use [skill/references/themes-layouts.md](../../skill/references/themes-layouts.md).

Two themes ship with the engine: `modern` (the default, `DEFAULT_THEME` in [`core/constants.js`](../../engine/core/constants.js)) and `academic-light`, the plain alternative. A deck with no `theme` uses `modern`. The two declare the same token names, so a deck's content works under either; `examples/spike` stays on `academic-light`.

## Theme folder

A theme is a folder under the engine's `themes/`:

```
themes/modern/
  tokens.css      :root custom properties and the @font-face rules
  theme.css       optional: rules for the published hooks, in the sd-theme cascade layer
  palettes.json   the theme's palettes and the default palette of each kind
  README.md       what the theme is for; its first paragraph is the catalog summary
  fonts/          vendored woff2 files, one folder per family, each with its OFL.txt
```

A theme folder name is lowercase letters, digits and hyphens, starting with a letter or digit (`^[a-z0-9][a-z0-9-]*$`), exact case. The CLI's `--theme` rejects any other name (exit code 2) before it starts a browser.

| File | Needed by | What happens without it |
| --- | --- | --- |
| `tokens.css` | runtime, `validate`, `catalog` | The folder is not a theme: `catalog` skips it, `validate` reports `unknown-theme`, the page shows `deck: theme '<t>' not found (...)`. |
| `palettes.json` | runtime, `validate`, `catalog` | `validate` reports `theme-palettes`; the page shows `deck: palettes of theme '<t>' not found (...)`, and `ctx.palette()` returns `null`. |
| `theme.css` | runtime | Nothing: it is optional. A 404 for it is tolerated by the loader, and `check` does not report it as a `network-error`. The theme then has only its tokens, and core's hook defaults (see [Styling hooks](#styling-hooks)) style titles, kickers and covers. |
| `README.md` | `catalog` | `catalog` warns `catalog-schema` ("README.md has no first paragraph"). |
| `fonts/` | runtime | Only if `tokens.css` points at it; a face that fails to load is a slide error (see [Loading](#how-a-theme-is-loaded)). |

A theme is discovered by its `tokens.css`: `catalog` lists every folder of `themes/` that holds one, and `validate` accepts `deck.theme` when `themes/<theme>/tokens.css` exists (exact case). Unlike components and layouts, a theme has no `schema.json` and no `example.js`.

In a deck made by `stepdeck new`, the engine is copied into `<deck>/stepdeck/`, so a deck's themes live in `<deck>/stepdeck/themes/<name>/`. Adding a theme is covered in [Adding a theme](../contributing/adding-a-theme.md).

## How a theme is loaded

The runtime ([`core/stepdeck.js`](../../engine/core/stepdeck.js)) picks the theme once per page:

```
theme = ?theme=<name>  ??  deck.theme  ??  "modern"
```

An empty `?theme=` is ignored. `validate` has no `?theme=`: it runs in Node and checks `deck.theme` (or the default) only, once per deck. The browser commands `dump`, `check` and `shoot` take `--theme <name>`, which adds `?theme=` to every page they load, so a deck can be checked under another theme without editing `deck.js`; `validate` does not. `STEPDECK.flags.theme` holds the `?theme=` override only: it is `undefined` when the URL has none, even though the page then uses `deck.theme` or `modern`. The resolved theme is not exposed.

Once per page (steps 1, 2 and 6) and for each slide frame (steps 3 to 5):

1. It fetches `themes/<theme>/tokens.css`, `themes/<theme>/theme.css` and `themes/<theme>/palettes.json` from the engine root, in parallel with the component index. A `theme.css` that is not there counts as empty.
2. It rebases the `url()`s in `tokens.css` and `theme.css` against each file's own URL, because the CSS is injected as an inline `<style>` where a relative URL would resolve against the page. Absolute, root-relative (`/...`), `data:` and `#fragment` URLs are kept as they are.
3. Each slide frame injects the theme sheet once per document as `<style data-sd-shared="theme">`: the layer order statement, then the whole of `tokens.css` (unlayered), then `theme.css` wrapped in the `sd-theme` cascade layer.
4. Before any component mounts, it loads every font face the document declares (`document.fonts`), so `check`, `dump` and screenshots never measure a fallback font. The faces also use `font-display: block`. A face that fails becomes a slide error:

   ```
   <slide>: font '<family>' <weight> <style> failed to load (<declared URLs>|no URL declared in the theme)
   ```

5. It builds `ctx.tokens`: for every custom property name declared anywhere in `tokens.css`, its computed value on the slide canvas, trimmed. Names a theme does not declare are not in `ctx.tokens`, even when `core/stepdeck.css` uses them. Because the values are computed on the canvas, a slide's `style` or `regions` override of a token is what a component sees.
6. It builds `ctx.palette` from `palettes.json` (see [ctx.palette](#ctxpalettekind)).

Boot errors for a missing theme are recorded in `STEPDECK.errors`:

| Message | Cause |
| --- | --- |
| `deck: theme '<t>' not found (<reason>)` | `themes/<t>/tokens.css` could not be fetched. |
| `deck: palettes of theme '<t>' not found (<reason>)` | `themes/<t>/palettes.json` could not be fetched or parsed. |

## Cascade layers

Every stylesheet the engine writes starts with the same order statement, so the order holds whichever sheet the browser meets first:

```css
@layer sd-core, sd-layout, sd-theme, sd-deck, sd-slide;
```

Later layers beat earlier ones whatever the selectors' specificity.

| Layer | What is in it |
|---|---|
| `sd-core` | [`core/stepdeck.css`](../../engine/core/stepdeck.css). Two sub-layers, `sd-core.components` (structure, the stage, components, capture mode) then `sd-core.hooks` (the token-driven default rule of every hook, so a theme with only `tokens.css` still works). |
| `sd-layout` | The slide's `layout.css`. Placement only. |
| `sd-theme` | The theme's `theme.css`. It overrides core and the layouts. |
| `sd-deck` | Declared and empty, reserved for per-deck overrides (for example a deck's brand rules). It is in the order statement, so it already sits between the theme and the slide; nothing uses it yet. |
| `sd-slide` | The slide's own `style` (scoped to the slide). It beats `theme.css`. |

Not in a layer: `tokens.css` (`:root` custom properties and `@font-face`; it has no competing rules) and the reveal shell's own sheets. Unlayered rules beat layered ones.

Engine state rules use `!important` inside `sd-core`: `.sd-el.sd-hidden`, `.sd-el.sd-collapsed`, `.sd-el.sd-failed`, `.sd-canvas.sd-booting` and the `[data-visible="false"]` rules of the components. An important declaration in an earlier layer beats every later layer, so no `theme.css`, layout or slide rule can show a hidden element or hide a failed one. The class names `sd-hidden` and `sd-collapsed` are stable: a theme may select on them (the `modern` meta rule does).

## Styling hooks

A hook is a class that core puts on the elements that play a role, so a theme can restyle that role without knowing which layout shows it. The published hooks are `HOOKS` in [`core/constants.js`](../../engine/core/constants.js); layouts map their regions to them with the `hooks` key of `schema.json` (see [Layouts](layouts.md#layout-descriptor)).

| Hook | Class on | Core default (`sd-core.hooks`) |
|---|---|---|
| `title` | The element with id `title` (the slide's `title`, or an explicit element of that id). | Title size, weight and tight line height; `--sd-letter-spacing-title`; `--sd-color-title`. |
| `kicker` | The element wrapper of the `kicker` element, which core makes from the slide's `section`. Its selector is `[data-el="kicker"]` or `.sd-kicker`. | `--sd-font-size-kicker` (else the label size), strong weight, 0.12em tracking, uppercase, `--sd-color-kicker` (else muted). |
| `lede` | The element wrapper of the `lede` element (the slide's `lede`, or an explicit element of that id). Its selector is `[data-el="lede"]` or `.sd-lede`. | None on the hook: the text's `lede` role (`.sd-role-lede`) sets the lede size, tight line height and muted colour, and the built-in themes restyle that role. |
| `accent` | The `<em class="sd-accent">` of an accent phrase (`*phrase*` in a title). | `--sd-color-accent`; `font-style: normal`, so it is an `<em>` but not italic. |
| `subtitle` | The mapped region (`title` layout's `subtitle`) and every element wrapper in it. | Heading size, tight line height, muted, balanced wrapping. |
| `meta` | The mapped region (`title` layout's `meta`) and its wrappers. | Note size. |
| `statement` | The mapped region (`statement` layout's `main`) and its wrappers. | On the `text` and `markdown` elements only: statement size, tight line height, centred, balanced wrapping. |

The canvas also carries `data-kind` (`content` or `cover`, the layout's `kind`). Core's cover rules: a `[data-kind="cover"]` title takes `--sd-font-size-cover` and `--sd-letter-spacing-cover` (else the title tracking), and, while a region named `figure` holds an element, `--sd-font-size-cover-figure` (else the cover size). A theme may select `[data-kind="cover"]`.

How to write `theme.css`:
- **Hook classes sit on the region and on its wrappers.** `.sd-meta` is on the `meta` region and on every element in it. A box property (padding, margin, border, background, outline, box-shadow) on a bare hook class is drawn once per wrapper. Put it on the region only: `.sd-region.sd-meta`. The unit test `test/unit/theme-modern.test.mjs` flags a selector whose last compound is a bare hook class and that declares a box property.
- **Target hooks and component part classes only.** Never `[data-layout]`, a region name (`[data-region]`) or `!important`; the contract test forbids all three.
- **Do not set `font-size` on `.sd-title`.** A `theme.css` rule beats core's cover rules whatever the specificity, so it would also override the cover size and the cover-figure size. Set the sizes with tokens. If a theme does set a title size, it must restate the cover rules.
- **Style the element that carries the hook, not its inner nodes.** The wrapper `.sd-el` carries the hook class (`.sd-title`, `.sd-kicker`, `.sd-lede`), and the text sits in a `.sd-text` or `.sd-markdown` inside it. Set inherited properties (colour, font, weight, tracking, size, transform) on the hook element: `.sd-kicker { color: … }`, not `.sd-kicker .sd-text { … }`. The text inherits them, a text and a markdown title alike, and a slide's `style` on the same element (`.sd-title { color: … }`) still wins. A rule on the inner node would beat that slide style, because the inner node then has its own value instead of inheriting.
- **A slide's `style` still wins**, because it sits in the `sd-slide` layer.
- A theme with no `theme.css` is complete: core's hook defaults apply.

The title region is an inline-size container named `sd-title`, so a slide's `style` or a theme may use `@container sd-title (…)`. Core's own rules no longer do.

## Tokens

Every token is a CSS custom property on `:root` in `themes/<theme>/tokens.css`: [`modern`](../../engine/themes/modern/tokens.css) and [`academic-light`](../../engine/themes/academic-light/tokens.css). They are prefixed `--sd-`, except `--min-audience-font`, which keeps its spec name. Components, layouts and `core/stepdeck.css` read tokens instead of raw values, with the exceptions listed in [Values not taken from tokens](#values-not-taken-from-tokens). Both themes declare the same names (the contributing guide's `diff` of the names is empty); the tables give both values, with `=` where they are the same.

Nine tokens are **optional**: a theme that does not declare them still works, because core's hook rules fall back as shown. They are marked *optional* below. The motion tokens have fallbacks in code too (see [Motion](#motion)), but every theme should declare them.

The **Read by** column says where each token is used today. "Unused" means nothing in `core/`, `components/`, `layouts/` or `cli/` reads it: changing it changes nothing on screen.

### Colors

| Token | academic-light | modern | Use | Read by |
| --- | --- | --- | --- | --- |
| `--sd-color-background` | `#ffffff` | `=` | Canvas background. `validate` checks palettes against it. | `core/stepdeck.css`, reveal shell, `chart.line` (label contrast), `validate` |
| `--sd-color-surface` | `#f5f5f3` | `#f4f4f5` | Quiet panels: terminal bar, inline code. | `core/stepdeck.css` |
| `--sd-color-title` *(optional)* | `#1c1c1e` | `#09090b` | Slide and cover titles. Falls back to `--sd-color-ink`. | `core/stepdeck.css` (`.sd-title`) |
| `--sd-color-ink` | `#1c1c1e` | `#27272a` | Text and axis titles. | `core/stepdeck.css`, `core/kit.js`, `chart.bar`, reveal shell |
| `--sd-color-muted` | `#5b5b62` | `#5f5f68` | Secondary text: notes, labels, sources, subtitles, tick labels. | `core/stepdeck.css`, `core/kit.js`, charts, reveal shell |
| `--sd-color-kicker` *(optional)* | `#5b5b62` | `#1d4ed8` | The kicker above a title. Falls back to `--sd-color-muted`. | `core/stepdeck.css` (`.sd-kicker`) |
| `--sd-color-accent` | `#0072b2` | `#1d4ed8` | Emphasis: links, big numbers, prompts, accent phrases. Equals the categorical palette's `blue` (role `accent`). | `core/stepdeck.css`, `chart.bar` (fallback fill) |
| `--sd-color-alert` | `#b75002` | `#d81b45` | Errors and warnings. Equals the categorical palette's `vermillion` (academic-light) or `rose` (modern), role `alert`. | `core/stepdeck.css` (error boxes), reveal shell |
| `--sd-color-rule` | `#d4d4d8` | `#e4e4e7` | Hairlines: borders, separators. Also the fallback for `--sd-color-dim`. | `core/stepdeck.css`, `core/kit.js` (`focusPaint`, as the dim fallback) |
| `--sd-color-grid` *(optional)* | `#d4d4d8` | `#f0f0f2` | Chart grid lines, lighter than a rule. Falls back to `--sd-color-rule`. | `core/stepdeck.css` (`.sd-grid-line`) |
| `--sd-color-dim` *(optional)* | `#b4b4bb` | `#c4c4cc` | What marks out of focus turn to when `highlight` emphasises another: a neutral grey lighter than `--sd-color-muted` and darker than `--sd-color-grid`. Falls back to `--sd-color-rule`. | `core/stepdeck.css` (diagram), `core/kit.js`, `chart.line`, `chart.bar` |
| `--sd-color-forecast` *(optional)* | *(not set)* | *(not set)* | The shaded region of a `chart.line` forecast. Falls back to 5% of `--sd-color-ink` over `--sd-color-background`. | `core/stepdeck.css`, `chart.line` |
| `--sd-color-letterbox` | `#111114` | `=` | The page around the canvas when the window is not 16:9. | `core/stepdeck.css`, reveal shell |

`accent` and `alert` are the same values as the palette colors their roles point at, so `{{color:accent}}` in a `markdown` element names the color the audience sees ("blue", "azul"). `modern`'s muted and alert were tuned from the mockup values so that text in them reaches 4.5:1 on the surface and the chat bubble; its README records each ratio.

### Fonts

| Token | academic-light | modern | Use | Read by |
| --- | --- | --- | --- | --- |
| `--sd-font-body` | `"Source Sans 3"`, then system fonts | `"Geist"`, then system fonts | All text except code. | `core/stepdeck.css`, reveal shell |
| `--sd-font-mono` | `"IBM Plex Mono"`, then system monospace | `"Geist Mono"`, then system monospace | Terminal, code, error boxes. | `core/stepdeck.css` |

### Sizes

| Token | academic-light | modern | Use | Read by |
| --- | --- | --- | --- | --- |
| `--sd-font-size-display` | `128px` | `=` | Big numbers. | `core/stepdeck.css` |
| `--sd-font-size-cover` | `88px` | `140px` | The title of a cover (`kind: "cover"`) slide. | `core/stepdeck.css` (cover rule) |
| `--sd-font-size-cover-figure` *(optional)* | `88px` | `96px` | The cover title while the `figure` region holds an element. Falls back to the cover size. | `core/stepdeck.css` (cover rule) |
| `--sd-font-size-statement` | `64px` | `=` | Text in the `main` region of a `statement` slide. | `core/stepdeck.css` (`.sd-statement`) |
| `--sd-font-size-title` | `64px` | `=` | Slide titles (the `title` region). | `core/stepdeck.css`, reveal shell |
| `--sd-font-size-heading` | `48px` | `=` | Subtitles; the `chart.line` ticker. | `core/stepdeck.css` (`.sd-subtitle`, `.sd-ticker`) |
| `--sd-font-size-body` | `40px` | `=` | Body text, the default text role. | `core/stepdeck.css` |
| `--sd-font-size-note` | `32px` | `=` | Notes (`role: "note"`), meta lines, big-number labels, diagram and timeline labels, captions. | `core/stepdeck.css` |
| `--sd-font-size-label` | `28px` | `=` | Axis ticks, legends, terminal text, inline code. | `core/stepdeck.css`, `chart.line`, `chart.bar`, `diagram` |
| `--sd-font-size-kicker` *(optional)* | `28px` | `=` | The kicker. Falls back to the label size. | `core/stepdeck.css` (`.sd-kicker`) |
| `--sd-font-size-lede` *(optional)* | `32px` | `36px` | The message line under a title (`role: "lede"`, the slide's `lede`). Falls back to the note size. | `core/stepdeck.css` (`.sd-role-lede`), the theme's `theme.css` |
| `--sd-font-size-source` | `28px` | `=` | Source lines (`role: "source"`). | `core/stepdeck.css` |

The charts read `--sd-font-size-label` from `ctx.tokens` and fall back to 28 when it is missing.

### Weights

| Token | Value (both themes) | Use | Read by |
| --- | --- | --- | --- |
| `--sd-font-weight-body` | `400` | Body weight. | **Unused** |
| `--sd-font-weight-title` | `600` | Titles, big numbers, markdown headings. | `core/stepdeck.css`, reveal shell, both themes' `theme.css` |
| `--sd-font-weight-strong` | `600` | Bold inside text, the kicker. | `core/stepdeck.css` (with a fallback of `600`) |

### Line heights and measure

| Token | academic-light | modern | Use | Read by |
| --- | --- | --- | --- | --- |
| `--sd-line-height` | `1.3` | `=` | Body leading. | `core/stepdeck.css` |
| `--sd-line-height-tight` | `1.15` | `=` | Titles, kickers, subtitles, statements, labels, diagram and timeline text. | `core/stepdeck.css`, `diagram` |
| `--sd-letter-spacing-title` *(optional)* | `normal` | `-0.03em` | Title tracking. Falls back to `normal`. | `core/stepdeck.css` (`.sd-title`) |
| `--sd-letter-spacing-cover` *(optional)* | `normal` | `-0.05em` | Cover title tracking. Falls back to `--sd-letter-spacing-title`, then `normal`. | `core/stepdeck.css` (cover rule) |
| `--sd-measure` | `34em` | `=` | A comfortable line length for long text. | **Unused** |

### Minimum audience font

| Token | Value | Use | Read by |
| --- | --- | --- | --- |
| `--min-audience-font` | `28px` | The smallest text the audience may see. Edit this one. | `check` |
| `--sd-min-audience-font` | `var(--min-audience-font)` | An alias under the theme prefix. | `core/stepdeck.css` (error boxes), `check` |

`check` reads `--sd-min-audience-font` first, then `--min-audience-font`, then uses 28px. Because the alias points at `--min-audience-font`, editing that one changes both.

### Spacing

| Token | Value | Use | Read by |
| --- | --- | --- | --- |
| `--sd-grid` | `8px` | Base unit; the other spacing tokens are multiples of it. | `core/stepdeck.css`, `diagram`, `timeline` |
| `--sd-space` | `16px` | Default inner spacing (two units). (The `rise` motion travels `--sd-motion-distance`, see [Motion](#motion).) | `core/stepdeck.css`, `core/animate.js` (its legacy `rise` helper), `diagram`, `title` layout |
| `--sd-region-gap` | `24px` | Gap between stacked elements in a region. | `core/stepdeck.css`, every layout |
| `--sd-canvas-margin` | `96px` | Canvas margin. Layouts with a footer use half of it at the bottom; `full-bleed` pads its regions instead of the canvas. | every layout, `core/stepdeck.css`, reveal shell |
| `--sd-rule-width` | `2px` | Width of rules and borders. | `core/stepdeck.css`, `diagram`, `timeline` |

### Diagram spacing

| Token | Value | Use | Read by |
| --- | --- | --- | --- |
| `--sd-diagram-gap` | `48px` | Gap between the grid cells of a `diagram`. | `diagram`, `validate` |
| `--sd-diagram-pad` | `16px` | Padding of a `diagram` group box around its members; each nesting level adds one more. | `diagram`, `validate` |

Keep the gap at least twice the pad, or neighbouring group boxes touch; `validate` reports that as `diagram-overlap`, reading both values from `tokens.css`. A theme without them gets 3 x and 1 x `--sd-space`.

### Motion

| Token | academic-light | modern | Use | Read by |
| --- | --- | --- | --- | --- |
| `--sd-duration` | `400ms` | `=` | The base duration of every motion: element entrances and exits, component changes and builds. Without it: 400ms. | `core/motion.js` (`timing`, `ctx.motion`), the controller (box motion), `core/kit.js` (`motion`, `motionMs`), every built-in that moves |
| `--sd-duration-fast` | `200ms` | `=` | Quick changes: each half of a text crossfade, a highlight colour change (charts, diagram), a badge colour change. Without it: 200ms. | `core/motion.js` (`timing(info, { fast: true })`), `text`, `chart.line`, `chart.bar`, `diagram` |
| `--sd-easing` | `cubic-bezier(0.65, 0, 0.35, 1)` | `=` | The easing of every JavaScript motion (box and item motions, chart draws and morphs, count-ups, colour changes; typing keeps a constant speed), parsed as `cubic-bezier(x1, y1, x2, y2)` or `linear`; anything else eases in and out. | `core/motion.js` (`parseEase`), the controller, every `ctx.motion` call |
| `--sd-stagger` | `60ms` | `80ms` | The gap between the elements that enter on one step, and between the items of a build (list items, chat messages, diagram nodes, terminal lines). Without it: 60ms. | `core/motion.js` (`timing`), the controller, `list`, `chat`, `diagram`, `terminal` |
| `--sd-enter` | `fade` | `rise` | How an element enters when its `enter` is unset and its component does not build its own entrance: a motion name (`fade`, `rise`, `wipe`, `pop`, `draw`, `none`). Without it, or with another value: `fade`. | the controller |
| `--sd-motion-distance` | `16px` | `24px` | How far a `rise` travels, for boxes and for list and chat items. Without it: 24px. | `core/layout.js` (box motion), `core/motion.js` (`ctx.motion`) |

A step's `transition.duration` replaces the durations (as it is: the charts' factor of 2 and the count-up's 2.25 do not apply to it), and `transition.stagger` replaces `--sd-stagger`; a duration of 0 snaps the step. Components read the tokens through `ctx.motion.timing(info, { factor, fast })`, or the `core/kit.js` wrappers `motion(info, ctx)` and `motionMs(info, ctx, factor)`. See [Animation and motion](../guide/animation-and-motion.md#theme-motion-tokens).

### Values not taken from tokens

[`core/stepdeck.css`](../../engine/core/stepdeck.css) hard-codes some values that look like token values. A theme that changes the token does not change these:

| Where | Hard-coded | Related token |
| --- | --- | --- |
| Markdown headings (`h1` to `h4`) | `line-height: 1.15` | `--sd-line-height-tight` |
| `.sd-kicker` | `letter-spacing: 0.12em` (a theme's `theme.css` may restate it) | none |
| `.sd-big-number-value` | `line-height: 1.05` | none |
| `.sd-chart-line .sd-series-label`, `.sd-chart-bar .sd-bar-label`, `.sd-terminal-heading` | `font-weight: 600` | `--sd-font-weight-strong` |
| `.sd-big-number-suffix` | `font-weight: 500` (academic-light ships no 500 in Source Sans 3, so the nearest face is used; modern's variable Geist has it) | none |
| Borders of the terminal, the chat card and the terminal bar, side panel and command line | `2px` | `--sd-rule-width` |
| Error box and markdown blockquote borders | `4px` | none |
| `.sd-terminal-side` | `width: 520px` | none |

Bold text uses `var(--sd-font-weight-strong, 600)`, so a theme without that token still gets 600. The `.sd-canvas` size, 1920 x 1080, is fixed and is not a token.

## Fonts shipped

The fonts are vendored woff2 files under the SIL Open Font License 1.1. Each family's `OFL.txt` sits next to its files; see also [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).

| Theme | Family | Folder | Faces |
| --- | --- | --- | --- |
| academic-light | Source Sans 3 | `fonts/source-sans-3/` | 400, 400 italic, 600, 700 (latin and latin-ext subsets) |
| academic-light | IBM Plex Mono | `fonts/ibm-plex-mono/` | 400, 500 (latin and latin-ext subsets) |
| modern | Geist | `fonts/geist/` | variable 100 to 900, upright and italic |
| modern | Geist Mono | `fonts/geist-mono/` | variable 100 to 900 |

Every `@font-face` uses a URL relative to `tokens.css` and `font-display: block`. academic-light's faces also carry a `unicode-range`; modern's variable files hold the Latin and Latin Extended glyphs in one face and have none. Ask for weights the theme ships; the browser resolves any other weight to the nearest face (a variable face serves every weight in its range).

## palettes.json

A theme's palettes, with a default for each kind:

```json
{
  "$comment": "…",
  "default": { "categorical": "okabe-ito-dark", "sequential": "viridis", "diverging": "blue-red" },
  "palettes": {
    "okabe-ito-dark": {
      "kind": "categorical",
      "description": "Okabe-Ito, darkened for at least 3:1 contrast on a white background …",
      "source": "Okabe, M. and Ito, K. (2008). …",
      "colors": [
        { "id": "blue", "value": "#0072b2", "names": { "en": "blue", "es": "azul" } },
        …
      ],
      "roles": { "accent": "blue", "alert": "vermillion" }
    }
  }
}
```

| Key | Type | Meaning |
| --- | --- | --- |
| `default` | object | One palette name per kind: `categorical`, `sequential`, `diverging`. |
| `palettes` | object | Palettes by name. A deck selects one with `palette: "<name>"`. |
| `palettes.<name>.kind` | string | `categorical` (series and categories), `sequential` or `diverging` (fill scales). |
| `palettes.<name>.description` | string | What the palette is for. It is in the catalog JSON (`catalog/<theme>.json`), not in the printed `stepdeck catalog <theme>` entry. |
| `palettes.<name>.source` | string | Where the colors come from, and their license. |
| `palettes.<name>.colors` | array | In order: `{ id, value, names }`. `value` is a hex color; `names` has one name per language (`en`, `es`), used by `{{color:…}}`. |
| `palettes.<name>.roles` | object | Semantic role to color `id`, such as `accent`, `alert`, `low`, `mid`, `high`. |

There is no schema for this file; `validate` only checks that it parses (`theme-palettes`) and checks the palettes a deck uses (see [Checks](#checks)).

### modern palettes

| Palette | Kind | Default | Colors | Roles |
| --- | --- | --- | --- | --- |
| `modern` | categorical | yes | `blue` `#1d4ed8`, `rose` `#d81b45`, `teal` `#0d9488`, `amber` `#c47d04`, `violet` `#8972b3`, `green` `#1f6708` | `accent` = `blue`, `alert` = `rose` |
| `viridis` | sequential | yes | the same as academic-light | `low` = `v1`, `high` = `v5` |
| `blue-red` | diverging | yes | the same as academic-light | `low` = `blue`, `mid` = `neutral`, `high` = `red` |

The `modern` palette is stepdeck's own; its README gives each color's contrast and the color-vision margins.

### academic-light palettes

| Palette | Kind | Default | Colors | Roles |
| --- | --- | --- | --- | --- |
| `okabe-ito-dark` | categorical | yes | `blue` `#0072b2`, `orange` `#c38602`, `green` `#049069`, `vermillion` `#b75002`, `purple` `#b56592`, `sky` `#3a9bce` | `accent` = `blue`, `alert` = `vermillion` |
| `viridis` | sequential | yes | `v1` `#440154`, `v2` `#3b528b`, `v3` `#21918c`, `v4` `#5ec962`, `v5` `#fde725` | `low` = `v1`, `high` = `v5` (no `mid`) |
| `blue-red` | diverging | yes | `blue` `#2166ac`, `light-blue` `#92c5de`, `neutral` `#f7f7f7`, `light-red` `#f4a582`, `red` `#b2182b` | `low` = `blue`, `mid` = `neutral`, `high` = `red` |

`okabe-ito-dark` is Okabe-Ito darkened in OKLab (hue kept) to at least 3:1 on white, with black and yellow left out. The first two colors are the most distinct, because charts assign colors in series order. The theme [README](../../engine/themes/academic-light/README.md) gives each color's original value and contrast. Each built-in theme has one palette per kind, so `deck.palette` can only name a default today.

## ctx.palette(kind)

Components get palettes through `ctx.palette(kind = "categorical")` (see [Component contract](component-contract.md)). Under academic-light, `ctx.palette()` returns:

```js
{
  name: "okabe-ito-dark",
  kind: "categorical",
  colors: ["#0072b2", "#c38602", "#049069", "#b75002", "#b56592", "#3a9bce"],
  names: ["blue", "orange", "bluish green", "vermillion", "reddish purple", "sky blue"], // deck language
  roles: { accent: "#0072b2", alert: "#b75002" },                                     // role -> hex value
}
```

- `names[i]` is `names[lang]` of color `i`, else `names.en`, else its `id`. With `lang: "es"` the first name is `"azul"`.
- `roles` maps each role to the color's **value**, not its id.
- The palette used is `deck.palette` when that palette's `kind` equals the requested kind; otherwise it is `default[kind]`. So `palette: "viridis"` changes what `ctx.palette("sequential")` returns, and `ctx.palette("categorical")` still returns the theme's categorical default (`modern` or `okabe-ito-dark`).
- It returns `null` when no palette is found for the kind, for example when `palettes.json` failed to load.
- The result is built once per kind and shared between components: treat it as read-only.

Who uses it today: `chart.line` takes `colors` in order of each series' first appearance, `chart.bar` takes the first color, and `markdown` resolves `{{color:<role>}}` to a color name by searching the categorical, then the sequential, then the diverging palette's roles. An unknown role is an element error: `unknown color role '<role>' in {{color:<role>}} (known roles: ...)`.

## Checks

`validate` (plain Node) checks the theme the deck names. `check` (in the browser) reads the theme's tokens from the rendered canvas.

| Rule | Command | Fires when | Example `fix` |
| --- | --- | --- | --- |
| `unknown-theme` | validate | `themes/<deck.theme>/tokens.css` does not exist (exact case) | `set theme: "modern" in deck.js` (the closest theme name) |
| `theme-palettes` | validate | `palettes.json` is missing or is not valid JSON | `add themes/<t>/palettes.json (see themes/academic-light/palettes.json)` |
| `unknown-palette` | validate | `deck.palette` is not a palette of the theme | `set palette: "viridis" in deck.js` |
| `theme-background` | validate | `--sd-color-background` is missing, or not `#rgb` / `#rrggbb` (`white`, `rgb()` and 8-digit hex are rejected) | `declare --sd-color-background as a hex color in themes/<t>/tokens.css` |
| `palette-contrast` | validate | a categorical color has WCAG contrast under 3:1 against the background | `darken orange (#e69f00) to #c68905 or darker …` |
| `palette-cvd` | validate | two categorical colors differ by less than CIEDE2000 8 under simulated protanopia, deuteranopia or tritanopia | `change the lightness of <a> or <b> so they differ for <type>, or drop one` |
| `contrast` | check | rendered text is under 4.5:1 against its resolved background | — |
| `font-too-small` | check | visible audience text is under the theme's minimum font | — |
| `network-error` | check | a request fails, except a 404 for `themes/<name>/theme.css` (it is optional); a missing `tokens.css` is still reported | — |

Details:
- The palette rules run only on the palettes the deck uses: for each kind, `deck.palette` if it is of that kind, else the theme default. They are skipped when `theme-background` fails. Only `categorical` palettes are checked; sequential and diverging palettes are fill scales whose light ends (viridis yellow, the diverging neutral) are meant to approach the background.
- Palette problems name the color as `<palette>/<id>` or the pair as `<palette>/<a>+<b>`, and their fix ends with `, in themes/<theme>/palettes.json`. The checker is `checkPalette(palette, background)` in [`cli/palettes.js`](../../cli/palettes.js) (CVD simulation: Machado, Oliveira and Fernandes 2009, severity 1).
- `font-too-small` uses `--sd-min-audience-font`, then `--min-audience-font`, then 28px, as computed on the canvas. Text with `role: "source"`, text inside `.sd-role-source`, and every element in a `footer` region are exempt.
- `contrast` walks up from the text to the first opaque background, falling back to the canvas background and then white.

For example, a copy of the theme whose categorical orange is the raw Okabe-Ito `#e69f00` gives:

```
okabe-ito-dark/orange · palette-contrast · 2.2:1 vs 3:1 · darken orange (#e69f00) to #c68905 or darker (marks need 3:1 on #ffffff), in themes/pale/palettes.json
```

Every rule, with its trigger and fix, is in [Rules](rules.md); agents use [skill/references/checks.md](../../skill/references/checks.md).

## The theme in the catalog

`catalog` lists each theme as `{ kind: "theme", name, summary, animates: [] }`. The summary is the first sentence of the README's first paragraph. The detail adds `description` (that whole paragraph), `tokens` (every `--name: value` in the `:root` blocks of `tokens.css`, read as text), `palettes` (the parsed `palettes.json`) and `readme`:

```sh
node cli/index.js catalog modern ../my-talk
```

A theme and a layout with the same name are reported as `catalog-name`. See [CLI](cli.md).

## See also

- [Using layouts and themes](../guide/layouts-and-themes.md): choosing a theme, palette and language.
- [Layouts](layouts.md): the regions and variables that use these tokens.
- [themes/modern/README.md](../../engine/themes/modern/README.md): the default theme's tokens, tuned colors, hook rules and fonts.
- [themes/academic-light/README.md](../../engine/themes/academic-light/README.md): the plain theme's own notes on its design and palette derivation.
