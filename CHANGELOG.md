# Changelog

All notable changes to stepdeck are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0] · 2026-11-19 · first public release

The first public release: the step-fold engine, 11 components, 5 layouts, 2 themes (`modern` and
`academic-light`), the command line, the agent skill and the Pages site. The entries below are changes
since the last internal milestone.

### Changed

- **The examples are a synthetic dose–response study.** The spike deck and the engine's example slides chart
  participants responding by dose under two regimens (`data/dose-response.csv`: `dose_mg`, `regimen`,
  `responders`, `rate`).
- **A `chart.line` or `chart.bar` fills the room its region leaves**, as a diagram or image does, so a source
  line beside it in the same region (full-bleed has no footer) no longer shrinks it to the browser's default
  150px.
- `dump` (and so `check`) rounds an element box's half pixel the same way in every shell: a scaled shell's
  measurement is snapped to Chrome's 1/64 px layout unit before it is rounded to whole canvas pixels.

- **The default theme is now `modern`** (`DEFAULT_THEME` in `core/constants.js`). A deck with no `theme`
  uses it, and so do the `talk` starter template and `examples/kit`. `academic-light` stays available as
  the plain alternative, and `examples/spike` stays on it.
  - Decks made with `stepdeck new` carry their own copy of the engine in `<deck>/stepdeck/`, so they are
    unaffected until that copy is upgraded. A deck that wants to keep the old look after an upgrade sets
    `theme: "academic-light"`.
- **Titles with two literal `*` now render an accent phrase.** `*phrase*` in a slide's `title` (or in a
  `text` element with id `title`) is drawn in the accent colour, upright. Write `\*` for a literal
  asterisk and `\\` for a literal backslash. `**` still renders as two asterisks, with a warning. A
  `markdown` title keeps markdown emphasis. `STEPDECK.state().title` stays the raw string.
- **The `title` layout is a cover with new geometry.** The kicker sits on the top margin, the title and
  subtitle in the upper middle, the meta block on the bottom margin and the footer below it. Existing
  covers move accordingly. `--meta-gap` now means the least space between the subtitle and the meta
  block (it was padding above `meta`). At `modern`'s 140px cover size, three lines fit; a kicker plus
  four lines overflows (four can too with a two-line meta block and a footer), five or more always do, and
  `check` reports `text-outside-region`.
- A slide's `section` is no longer inert: it is the kicker above the title (see Added). Slides that
  already set `section` now show it, so their content starts lower on layouts with a `title` region.
- Layout CSS is placement only (see Added), so `title` and `statement` no longer set type or colour
  themselves; core's hook defaults and the theme do. Under `academic-light` they look as before.
- Theme folder names must be lowercase letters, digits and hyphens (`THEME_NAME` in `core/constants.js`).
  A theme folder named otherwise no longer loads, and `validate` reports `unknown-theme` with a rename hint.
- `chart.line`'s x-axis title now sits on the bottom edge of its SVG instead of overhanging it by about
  2.6px under `academic-light`.
- **`big-number`'s figure uses `var(--sd-line-height-tight)`** instead of a fixed `1.05` line height, so a
  font with tall metrics no longer reaches up into the title above it. The figure's line box is slightly taller in some themes.

### Added

- **A public site** at https://horaciochacon.github.io/stepdeck/, static files served as they are in the
  repository, with no build step: a landing page (`index.html`), a docs viewer (`site/docs/`) that renders
  the Markdown in `docs/` in the browser, and a gallery (`site/gallery/`), a stepdeck deck with a slide for
  every layout and every component. A test keeps the gallery in step with `components/index.json` and
  `layouts/`.
- **CI and Pages deploy** (`.github/workflows/ci.yml`): the unit tests and a site smoke test gate a deploy of
  the repository tree to GitHub Pages (about a minute from push to live), while the full browser suite runs
  alongside on four parallel runners as the status check. `npm run site` previews the site locally under
  `/stepdeck/`, as Pages serves it. CI runs on Node 22 because the test scripts need Node 22.15+
  (`module.registerHooks`); the CLI's own floor (`engines`) is still Node 20.
- **The gallery deck is a test**: `test/unit/gallery.test.mjs` validates it, so every `example.js` now
  validates as a slide (the `chart.line` and `big-number` examples gained a source line, and the
  `chart.bar` example's `data/durations.csv` exists in the gallery), and `test/browser/gallery.test.mjs`
  checks it with `--played` under `modern` and `academic-light`.
- **Repository metadata and a demo**: a README demo GIF (`docs/media/demo.gif`), a CI badge, and
  `repository`, `homepage` and `keywords` in `package.json` and the plugin manifest, and `bugs` in
  `package.json`.
- **Publishing tests**: `publishable` (no machine paths in the tracked tree) and `doc-links` (every
  relative link in the tracked Markdown resolves to a file or folder that exists).
- **The `modern` theme**: Geist and Geist Mono (vendored variable woff2 under the SIL OFL 1.1), a deep
  blue accent, a rose alert, near-black titles with tight tracking and a 140px cover title. Its muted
  and alert colours are tuned so text in them reaches 4.5:1 on the surface and the chat bubble.
- **Seven optional theme tokens**, with fallbacks when a theme omits them: `--sd-color-title`,
  `--sd-color-grid`, `--sd-color-kicker`, `--sd-letter-spacing-title`, `--sd-letter-spacing-cover`,
  `--sd-font-size-kicker` and `--sd-font-size-cover-figure`.
- **Cascade layers**: `sd-core` (with `components` and `hooks`), `sd-layout`, `sd-theme`, `sd-deck`
  (declared and empty, reserved for per-deck overrides), `sd-slide`. A slide's own `style` always beats the theme. Engine state rules
  (`.sd-hidden`, `.sd-collapsed`, `.sd-failed`) are `!important` in the lowest layer, so no later layer
  can break stepping.
- **`theme.css`**, optional in a theme folder: rules for the published styling hooks, in the `sd-theme`
  layer. A missing file is tolerated by the loader and by `check`.
- **Published styling hooks** (`HOOKS` in `core/constants.js`): `title`, `kicker`, `accent`, `subtitle`,
  `meta`, `statement`. A layout's `schema.json` maps regions to hooks with the new optional `hooks` key
  and declares `kind` (`content`, the default, or `cover`). A cover's title takes the cover size, and the
  smaller cover-figure size while a region named `figure` holds an element.
- **Layout CSS is placement only**, enforced by a unit test: no `color`, `font*`, `letter-spacing`,
  `text-transform`, `line-height`, `text-align`, `-webkit-text-fill-color`, `--sd-*` property or
  `!important`, and `font-size` only as `var(--sd-…)`. The `title` region is an inline-size container, so
  it needs a stretched or sized grid track.
- **Kicker**: a slide's `section` is shown above the title as a `text` element with the reserved id
  `kicker` (hook `sd-kicker`), on layouts that have a `title` region. A slide hides it with
  `style: '[data-el="kicker"] { display: none }'`.
- **Accent phrase** in titles (hook `sd-accent`), parsed by the new `core/accent.js`; the reveal
  placeholder, overview, `dump` and `check` text never show the asterisks.
- **`validate` rules**: `title-accent` (warning, an unmatched `*`), `accent-empty` (warning, `**`),
  `kicker-no-region` (warning, a `section` on a layout without a `title` region) and `reserved-id`
  (error, an element with id `kicker`).
- **`--theme <name>`** on `dump`, `check` and `shoot`: run under another theme (the page's `?theme=`)
  without editing `deck.js`. The name is checked before any browser starts; theme folder names are
  lowercase letters, digits and hyphens.
- The slide canvas carries the deck's `lang`, so `text-transform` follows the language.

### Documentation

- The README and its Spanish mirror link the live site and the gallery, and the quick start begins with
  `git clone https://github.com/horaciochacon/stepdeck.git`.
- The docs and the agent skill describe the layers, hooks, `kind`, the kicker, the accent phrase, the new
  `validate` rules and `--theme`, and no longer call `academic-light` the only or the default theme.
- `THIRD_PARTY_NOTICES.md` records Geist and Geist Mono (no Reserved Font Name) and scopes the Fontsource
  note to `academic-light`.

[Unreleased]: https://github.com/horaciochacon/stepdeck/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/horaciochacon/stepdeck/releases/tag/v0.1.0
