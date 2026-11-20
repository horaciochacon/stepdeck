# Adding a theme

This page shows how to make a theme folder that the runtime, `validate`, `check` and `catalog` all accept: where the folder goes, what `tokens.css`, `palettes.json` and `README.md` must contain, and how to check the result against the slide kit deck. It is for contributors who add a built-in theme to the engine and for deck authors who add a theme to one deck.

For what each token and palette of the built-in themes does, and how the engine loads a theme, see the [themes reference](../reference/themes.md). Agents use [skill/references/themes-layouts.md](../../skill/references/themes-layouts.md).

## Where the folder goes

A theme is a folder named after the theme, placed under the `themes/` folder of the engine the deck runs on:

| You are adding | Folder | Who gets it |
| --- | --- | --- |
| A built-in theme | `engine/themes/<name>/` in this repository | Every deck made by `stepdeck new` afterwards (it copies `themes/` into `<deck>/stepdeck/`), and the two example decks, which use `engine/` as their engine. |
| A theme for one deck | `<deck>/stepdeck/themes/<name>/` | That deck only. |

The runtime fetches `themes/<name>/tokens.css` and `themes/<name>/palettes.json` from the engine root, and `validate` looks under the engine's `themes/` only. Do not put a deck theme in `<deck>/themes/<name>/`: `catalog` lists it there (it scans the deck folder too), but `validate` rejects the deck and the page does not load the theme:

```
deck · unknown-theme · theme 'my-theme' vs themes: academic-light, modern · set theme in deck.js to a folder under the engine's themes/
```

The folder is a theme when it holds `tokens.css`. The name is matched with exact case. Use lowercase letters, digits and hyphens, starting with a letter or digit (`^[a-z0-9][a-z0-9-]*$`): the CLI's `--theme` rejects any other name, so a theme named otherwise cannot be tried with `check --theme`. Do not reuse the name of a layout (see [README and name](#readme-and-name)).

The quickest start is a copy of `modern` (or `academic-light`, the plain one), which you then edit:

```sh
cp -R themes/modern themes/my-theme                                   # built-in
cp -R <deck>/stepdeck/themes/modern <deck>/stepdeck/themes/my-theme   # one deck
```

The finished folder looks like this:

```
themes/my-theme/
  tokens.css      :root custom properties and the @font-face rules
  theme.css       optional: rules for the published hooks (see below)
  palettes.json   the palettes and the default palette of each kind
  README.md       its first paragraph is the catalog summary
  fonts/          vendored woff2 files, one folder per family, each with its licence
```

A theme has no `schema.json` and no `example.js`.

`theme.css` is optional. A theme with only `tokens.css` works: core ships default rules for every published hook, driven by the tokens. The loader tolerates a 404 for `theme.css`, and so does `check`. Add one when the theme needs to restyle a hook, as `modern` does for the kicker, the accent phrase and the cover author line (see [Write theme.css](#write-themecss)).

## Write tokens.css

### Keep every token name

Declare every custom property that `themes/modern/tokens.css` declares, with the same name, and change only the values. Seven of them are optional (core falls back when they are missing): `--sd-color-title`, `--sd-color-grid`, `--sd-color-kicker`, `--sd-letter-spacing-title`, `--sd-letter-spacing-cover`, `--sd-font-size-kicker` and `--sd-font-size-cover-figure`. The [themes reference](../reference/themes.md#tokens) gives each fallback. Components, layouts and `core/stepdeck.css` read these names, and `ctx.tokens` holds only the names the theme declares, so a missing name is a missing value: the `var()` that reads it falls back to its default, or to nothing. No rule checks this, so compare the names yourself. This prints nothing when they match:

```sh
names() { grep -oE '^ *--[a-z0-9-]+ *:' "$1" | tr -d ' :' | sort -u; }
diff <(names themes/modern/tokens.css) <(names themes/my-theme/tokens.css)
```

The token groups are colors (`--sd-color-*`), fonts and sizes (`--sd-font-*`, `--sd-line-height*`, `--sd-measure`), the minimum audience font, spacing (`--sd-grid`, `--sd-space`, `--sd-region-gap`, `--sd-canvas-margin`, `--sd-rule-width`, `--sd-diagram-gap`, `--sd-diagram-pad`) and motion (`--sd-duration`, `--sd-duration-fast`, `--sd-easing`). The [tokens section of the reference](../reference/themes.md#tokens) lists each one with what reads it. Some values in `core/stepdeck.css` are hard-coded rather than read from tokens (title line height 1.15, label weight 600, big-number suffix weight 500, and others); they are listed under [Values not taken from tokens](../reference/themes.md#values-not-taken-from-tokens), and a theme cannot change them.

Put the tokens in a `:root { ... }` block. `catalog` reads token names and values only from `:root` blocks.

### Give the background as a hex color

`--sd-color-background` must be a 3- or 6-digit hex color (`#fff` or `#ffffff`). `validate` reads it to check the palettes, and rejects anything else, `rgb()` and 8-digit hex included:

```
deck · theme-background · --sd-color-background: rgb(255 255 255) vs a hex color · declare --sd-color-background as a hex color in themes/my-theme/tokens.css
```

When this rule fires, the palette checks are skipped, so fix it first.

`check` measures text contrast at 4.5:1 against the background behind each piece of text, so `--sd-color-ink` and `--sd-color-muted` must reach 4.5:1 on `--sd-color-background` (and `--sd-color-surface`, where terminal and code text sit).

### Set the minimum audience font

Keep both tokens, with the alias as it is:

```css
--min-audience-font: 28px;
--sd-min-audience-font: var(--min-audience-font);
```

`check` reads `--sd-min-audience-font`, then `--min-audience-font`, and uses 28px when neither is set. It flags any text smaller than that, except text with `role: "source"` and anything in a region named `footer`. Error boxes also use `--sd-min-audience-font` as their font size.

The minimum must not be larger than the smallest size token that non-source text uses. In both built-in themes that is `--sd-font-size-label` (28px), which axis ticks, legends, chat labels and terminal text use. Raising only the minimum to 30px makes the slide kit fail:

```
estimate/bars/one · font-too-small · 28px "0.0" (+1 more step) vs 30px (--min-audience-font) · use a larger font size; only sources (role: "source") and the footer may go smaller
```

### Keep the diagram spacing valid

`validate` reads `--sd-diagram-gap` and `--sd-diagram-pad` from `tokens.css` and checks every diagram with them. The gap must be at least twice the padding, or neighbouring group boxes touch:

```
concept/idea/exposure · diagram-overlap · grid gap 24px is less than twice the group padding 16px vs gap >= 32px · raise --sd-diagram-gap or lower --sd-diagram-pad in the theme (or the slide style)
```

### Vendor the fonts

Ship every font file in the theme's `fonts/` folder and declare each face with `@font-face`, as the built-in themes do:

```css
@font-face { font-family: "Source Sans 3"; font-style: normal; font-weight: 400; font-display: block; src: url("fonts/source-sans-3/source-sans-3-latin-400-normal.woff2") format("woff2"); unicode-range: U+0000-00FF, ...; }
```

- **Use URLs relative to `tokens.css`.** The runtime injects the tokens as an inline `<style>` and first rewrites relative `url()`s against the file's own URL. Absolute, root-relative (`/fonts/...`), `data:` and `#fragment` URLs are left as they are, so a root-relative URL resolves against the server root, not the theme.
- **Never load fonts from another host.** Pages may only make same-origin requests; `check` blocks remote URLs.
- **Use `font-display: block`.** The runtime also waits for every declared face to load before any component renders or measures text, so `check`, `dump` and screenshots never measure a fallback font.
- **Ship the weights the engine asks for.** Text uses `--sd-font-weight-body`, `--sd-font-weight-title` and `--sd-font-weight-strong`, plus the hard-coded 600 and 500 above. A weight the theme does not ship resolves to the nearest face. `academic-light` ships Source Sans 3 400, 400 italic, 600 and 700, and IBM Plex Mono 400 and 500; `modern` ships variable Geist (upright and italic) and Geist Mono, each covering weights 100 to 900.
- **Keep the licence next to the files**, for example `fonts/<family>/OFL.txt`.

`validate` does not look at fonts. A face that fails to load is a slide error, which `check` reports as `render-error`, together with the failed request. A missing file:

```
cover/0 · render-error · cover: font 'Source Sans 3' 600 normal failed to load (http://127.0.0.1:63959/stepdeck/themes/my-theme/fonts/source-sans-3/missing-600.woff2, http://127.0.0.1:63959/stepdeck/themes/my-theme/fonts/source-sans-3/source-sans-3-latin-ext-600-normal.woff2) vs no errors · fix the error shown on the slide, then run check again
cover/0 · network-error · 404 /stepdeck/themes/my-theme/fonts/source-sans-3/missing-600.woff2 vs no errors · fix the path or add the missing file; every path is relative and same-origin
cover/0 · network-error · failed /stepdeck/themes/my-theme/fonts/source-sans-3/missing-600.woff2 (net::ERR_ABORTED) vs no errors · fix the path or add the missing file; every path is relative and same-origin
```

A remote URL:

```
cover/0 · network-error · remote https://example.com/f.woff2 (blocked: only same-origin requests are allowed, spec §3) vs no errors · fix the path or add the missing file; every path is relative and same-origin
```

## Write palettes.json

`palettes.json` holds the theme's palettes by name and names the default palette of each kind:

```json
{
  "$comment": "What these palettes are and how they were checked.",
  "default": { "categorical": "okabe-ito-dark", "sequential": "viridis", "diverging": "blue-red" },
  "palettes": {
    "okabe-ito-dark": {
      "kind": "categorical",
      "description": "Okabe-Ito, darkened for at least 3:1 contrast on a white background ...",
      "source": "Okabe, M. and Ito, K. (2008). ...",
      "colors": [
        { "id": "blue", "value": "#0072b2", "names": { "en": "blue", "es": "azul" } },
        { "id": "orange", "value": "#c38602", "names": { "en": "orange", "es": "naranja" } }
      ],
      "roles": { "accent": "blue", "alert": "vermillion" }
    }
  }
}
```

(Shortened from `themes/academic-light/palettes.json`; the real palette has six colors and `vermillion` among them.)

| Field | Rule |
| --- | --- |
| `default.categorical`, `default.sequential`, `default.diverging` | The name of a palette in `palettes`, of that kind. Neither the runtime nor `validate` checks the kind, and a default that names no palette is silently skipped (`ctx.palette(kind)` returns `null`), so get these right by hand. |
| `palettes.<name>.kind` | `categorical`, `sequential` or `diverging`. A deck's `palette: "<name>"` replaces the default of its own kind only. |
| `colors[].id` | Unique within the palette. Roles point at it, and `validate`'s palette problems name it (`<palette>/<id>`). |
| `colors[].value` | A hex color. The checks parse it as hex. |
| `colors[].names` | The color word per language, used by `{{color:<role>}}` in markdown. The runtime uses `names[lang]`, then `names.en`, then the id, so give at least `en`, and `es` for Spanish decks. |
| `roles` | Role name to color id. Keep `accent` and `alert` in the categorical palette, and `low` and `high` (plus `mid` for diverging) in the others. |
| `description`, `source` | Documentation: what the palette is and where it comes from. |

Keep `--sd-color-accent` and `--sd-color-alert` in `tokens.css` equal to the values of the colors that the `accent` and `alert` roles point at. Then `{{color:accent}}` names the color the audience actually sees.

### Pass palette-contrast and palette-cvd

`validate` checks the categorical palette a deck uses (its `deck.palette` when that is categorical, otherwise the theme's default) against `--sd-color-background`:

| Rule | Requirement |
| --- | --- |
| `palette-contrast` | Every color reaches WCAG contrast 3:1 on the background. The fix names a darkened value that passes. |
| `palette-cvd` | Every pair of colors differs by CIEDE2000 8 or more under simulated protanopia, deuteranopia and tritanopia. |

Sequential and diverging palettes are not checked: their light ends are meant to approach the background. Only the palettes a deck uses are checked, so to check a second categorical palette, set `palette: "<name>"` in the test deck.

The checks depend on the background as well as the colors. Keeping the `academic-light` palette but changing the background to `#eeeeee` already fails:

```
okabe-ito-dark/orange · palette-contrast · 2.6:1 vs 3:1 · darken orange (#c38602) to #b87e00 or darker (marks need 3:1 on #eeeeee), in themes/my-theme/palettes.json
okabe-ito-dark/sky · palette-contrast · 2.6:1 vs 3:1 · darken sky (#3a9bce) to #2e92c4 or darker (marks need 3:1 on #eeeeee), in themes/my-theme/palettes.json
```

And two colors that are too close:

```
okabe-ito-dark/blue+blue2 · palette-cvd · ΔE 0.7 (deuteranopia) vs ΔE 8 · change the lightness of blue (#0072b2) or blue2 (#0a70b0) so they differ for deuteranopia, or drop one, in themes/my-theme/palettes.json
```

Darken a color in steps until both rules pass. The `academic-light` README explains how `okabe-ito-dark` was derived from the Okabe-Ito colors. The checker is `checkPalette(palette, background)` in [`cli/palettes.js`](../../cli/palettes.js) if you want to call it from a script.

## Write theme.css

`theme.css` is optional. It is loaded after `tokens.css` and sits in the `sd-theme` cascade layer, so its rules beat core's hook defaults and every layout, and lose to a slide's own `style`. Start from the rules in [`themes/modern/theme.css`](../../engine/themes/modern/theme.css). The published hooks and the rules for writing them are in [Themes: styling hooks](../reference/themes.md#styling-hooks). The ones that trip people up:

- Target hook classes (`.sd-title`, `.sd-kicker`, `.sd-accent`, `.sd-subtitle`, `.sd-meta`, `.sd-statement`), `[data-kind="cover"]` and component part classes. Never `[data-layout]`, a region name or `!important`.
- A hook class sits on its region and on every element wrapper inside it. A box property (padding, margin, border, background, outline, box-shadow) on a bare hook class is drawn once per wrapper. Put it on the region only: `.sd-region.sd-meta`.
- Set inherited properties (colour, weight, tracking, transform) on the element that carries the hook, `.sd-title` or `.sd-kicker`, not on its inner `.sd-text` or `.sd-markdown`. The text inherits them, and a slide's `style` on the hook element still wins; a rule on the inner node would beat it.
- Do not set `font-size` on `.sd-title`: it would override core's cover and cover-figure sizes. Use `--sd-font-size-title`, `--sd-font-size-cover` and `--sd-font-size-cover-figure`.
- Take colours and sizes from tokens (`var(--sd-…)`), so a deck's or a slide's token overrides still apply.
- Check the result with `check --played` on the kit and on a deck with a cover that has a `section` and a `*phrase*` in its title.

## README and name

`catalog` uses the first paragraph of `README.md` as the theme's description, and the first sentence of that paragraph as its summary in `catalog/index.json`. The first paragraph is the first block after the heading that does not start with `#`, `|` or a code fence. Write it fresh: a copied README starts with the summary of the theme you copied (for example "A neutral modern theme"), which is wrong for yours. Then document the theme's tokens, fonts and palettes below it, as the `modern` README does.

A README with no such paragraph gives a warning:

```
warning: my-theme · catalog-schema · themes/my-theme/README.md has no first paragraph vs a README whose first paragraph is the summary · add a short paragraph under the heading of themes/my-theme/README.md
```

`catalog` writes one `catalog/<name>.json` per entry, so a theme must not share its name with a layout (or a component). On a clash, `catalog` keeps the layout and drops the theme:

```
warning: statement · catalog-name · theme 'statement' and layout 'statement' vs one entry per name (catalog/<name>.json) · rename the theme, e.g. with a namespace such as 'my.statement'
```

Both are warnings and `catalog` still exits 0, but agents read the catalog to find themes, so fix them. Check the entry with:

```sh
node cli/index.js catalog my-theme <deck>     # or: node cli/index.js catalog my-theme  (from the repo root)
```

## Check the theme on the slide kit

`examples/kit` uses every layout and component, so it is the deck to test a theme on. It uses the repository as its engine, so a theme in the repository's `themes/` is available to it at once.

To look at it, serve the deck and add `?theme=` to the URL:

```sh
node cli/index.js serve examples/kit
# open http://127.0.0.1:8000/examples/kit/?theme=my-theme
```

`?theme=` overrides `deck.theme` in the page, and `STEPDECK.flags.theme` shows which theme the page uses. An empty `?theme=` is ignored.

`validate` has no `?theme=`: it reads `deck.theme`. The browser commands take the same override as a flag, `--theme <name>`, so the kit can be checked under your theme without editing it (the kit deck is on `modern`):

```sh
node cli/index.js validate examples/kit                      # reads deck.js: theme-background, palette-contrast, palette-cvd, diagram-overlap
node cli/index.js check examples/kit --played --theme my-theme   # fonts, text contrast, font-too-small, layout fit
node cli/index.js shoot examples/kit --theme my-theme            # PNGs in examples/kit/shots/960/; look at every one
```

To run `validate` on your theme too, set it in `examples/kit/deck.js` for the run:

```js
  theme: "my-theme",
```

All three must be clean (`validate: 10 slides, 0 errors, 0 warnings` and `check: ... 0 problems`). Set `theme` back to `"modern"` before you commit: `test/browser/kit.test.mjs` checks that the kit deck stays clean as shipped. Also run `check examples/kit --played --theme academic-light` and the same for `examples/spike`, to see that the built-in themes still pass.

For a theme in one deck, set `theme: "my-theme"` in that deck's `deck.js` and run the same three commands on the deck folder. To try a deck theme against the slide kit without touching the repository, make a scratch deck and copy the kit into it:

```sh
node cli/index.js new /tmp/theme-kit
cd /tmp/theme-kit
rm -rf slides data
cp -R <repo>/examples/kit/{slides,data,assets,deck.js} .
cp -R <your theme folder> stepdeck/themes/my-theme
# set theme: "my-theme" in deck.js, then call the CLI by its full path:
node <repo>/cli/index.js validate .
node <repo>/cli/index.js check . --played
node <repo>/cli/index.js shoot .
```

The browser commands need Chrome and Playwright; see [Set up](index.md#set-up).

## Before you commit a built-in theme

- **Unit tests.** `test/unit/catalog.test.mjs` asserts the exact list of built-in themes (`["academic-light", "modern"]`). Add your theme to it, then run `npm test` and `npm run test:browser`.
- **Licences.** Add the fonts (family, weights, files, licence file) and any palette sources to `THIRD_PARTY_NOTICES.md`, which `new` copies into every deck.
- **Docs.** Update the [themes reference](../reference/themes.md), [Using layouts and themes](../guide/layouts-and-themes.md) and `skill/references/themes-layouts.md`, which list the built-in themes. See [Keep the docs in sync](index.md#keep-the-docs-in-sync).

Adding a theme does not change the default. Decks without `theme` use `DEFAULT_THEME` in [`core/constants.js`](../../engine/core/constants.js), which is `modern`. Changing it also changes `templates/talk/deck.js`, `examples/kit/deck.js` and the tests that expect the default theme's font paths (`test/unit/new.test.mjs`, `test/browser/new.test.mjs`). `examples/spike` names `academic-light` on purpose, so the plain theme stays exercised.

## Checklist

| Item | Checked by |
| --- | --- |
| Folder in the engine's `themes/` (`<deck>/stepdeck/themes/` for a deck), holding `tokens.css` | `validate` (`unknown-theme`) |
| Every token name of `modern` (the seven optional ones may be omitted), inside `:root` | the `diff` above; nothing else |
| `theme.css`, if any: hooks and part classes only; no `[data-layout]`, region names or `!important`; no box properties on a bare hook class | `test/unit/layout-contract.test.mjs`, `test/unit/theme-modern.test.mjs` |
| `--sd-color-background` as `#rgb` or `#rrggbb` | `validate` (`theme-background`) |
| Ink and muted text at 4.5:1 on the background | `check` (`contrast`) |
| `--min-audience-font` and its alias; no non-source size below it | `check` (`font-too-small`) |
| `--sd-diagram-gap` at least twice `--sd-diagram-pad` | `validate` (`diagram-overlap`) |
| Fonts vendored, relative URLs, `font-display: block`, licence alongside | `check` (`render-error`, `network-error`) |
| `palettes.json` readable, defaults name palettes of the right kind | `validate` (`theme-palettes`); the kinds by hand |
| Categorical palette passes on the background | `validate` (`palette-contrast`, `palette-cvd`) |
| `accent` and `alert` token values equal their role colors | by hand |
| README first paragraph written for this theme; name not used by a layout or component | `catalog` (`catalog-schema`, `catalog-name`) |
| Slide kit clean and screenshots reviewed | `validate`, `check --played`, `shoot` |
