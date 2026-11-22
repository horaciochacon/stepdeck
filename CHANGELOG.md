# Changelog

All notable changes to stepdeck are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- **Elements enter and leave with motion.** On a forward step (motion on, not in capture), every element that
  becomes visible now enters: its box plays the theme's entrance (`rise` in `modern`, `fade` in
  `academic-light`), and the elements that appear on one step enter one after another, in slide order. Elements
  that become hidden fade out, except those with `collapse: true`, which are hidden at once. Decks that did not
  ask for motion now move: set `enter: "none"` (and `exit: "none"`) on an element to turn it off, or give a step
  `transition: { duration: 0 }`. For a whole deck, a theme with `--sd-enter: none` turns off the box entrances;
  components that build themselves (below) still build, so give those elements `enter: "none"`, and entering
  elements still appear one stagger apart unless the theme also sets `--sd-stagger: 0ms`. Jumps, backward
  moves, slide changes, screenshots and reduced motion still render at once, and a played step still ends exactly
  where a jump does. A hidden page (a covered or minimized window) never animates either, and hiding the page
  ends the motion in flight at its end state, so a long run cannot stall there until the watchdog fails it.
- **The focus-dim look changed.** `highlight` in `chart.line` and `diagram` no longer fades the other marks by
  opacity: they turn a neutral grey (see Focus-dim below), as in `chart.bar`. `chart.bar`'s dimmed bars change too:
  their fill is the new `--sd-color-dim` instead of `--sd-color-rule`.
- **Built-ins follow the theme's timing.** Every motion now reads `--sd-duration` and `--sd-easing`, chart draws and
  morphs included (before, most components used a fixed 400 ms and a cubic ease; typing keeps its constant speed), and items in a build are `--sd-stagger` apart. `text`,
  `markdown` and `image` no longer fade themselves in when they appear (their box does); a changed `text`
  crossfades instead of fading in from nothing.
- **Custom components** that fade themselves in when `info.entered` is true now move twice (the box moves too).
  They still end in the right state; drop the fade, or declare `"x-enter": "own"` and build on `info.entrance`.
  While a box moves, the engine writes inline `opacity`, `transform` and `clip-path` on it, so a slide `style` rule
  on those properties of the element box waits until the motion ends: style a node inside the box instead.
- **A blank-looking cell is missing, never zero.** A CSV cell that holds only spaces keeps its column as text, and
  `chart.bar` and `chart.line` drew it as 0: a bar labelled `0`, a line that dropped to the axis. Every chart now
  reads it as missing, as an empty cell: no bar and no label (a waterfall reports the category as empty), no point on
  the line, "no data" in `chart.points`. Decks with such cells change: they were drawn wrong. `chart.line` also
  leaves out a cell that is not a number, such as `NA`, instead of drawing a broken point.
- **`chart.line` keeps its last x tick label inside the element.** A chart without `series` kept one font size of
  room on the right, less than half a four-character tick label such as `2050`, which then overhung the element.
  The right margin is now at least half the widest x tick label, so in such decks the plot is about 13 px narrower.
- **A vertical `chart.bar` whose bar changes sign ends a played step as a jump does.** A value label above its bar
  now carries `dy="0em"`, so its attributes keep their order when it moves below the bar. Before, the played step's
  markup differed from the jump's in attribute order (the pixels were the same).
- **A step's `transition` has bounds.** `transition.stagger` is at most 1000 ms and `transition.duration` at most
  5000 ms (`validate` reports `spec-invalid` above them), like an element's own `delay` and `duration`.
- **The engine lives in `engine/`.** `core/`, `components/`, `layouts/`, `themes/`, `vendor/` and `schema/` moved
  there from the repository root. Decks are unchanged: `stepdeck new` copies the same folders into
  `<deck>/stepdeck/`.
- The TypeScript types moved to `engine/schema/stepdeck.d.ts`, so new decks get them in `stepdeck/schema/`.
- One CSS rule makes a chart, diagram, image or terminal fill the room its region leaves. A diagram that failed now
  shows its error box at the box's own height instead of stretching it over the region.
- `stepdeck catalog` recognises this repository by its `engine/` folder, so a symlinked or differently cased path
  to it works.
- `.nojekyll` is gone: Pages deploys from an Actions artifact, which never runs Jekyll.
- CI uploads the site while the fast gate runs, and splits the browser suite over six runners.
- `npm run test:browser` runs six test files at a time, so the full suite takes about 5 minutes instead of 20.

### Added

- **Named motions.** One vocabulary for every entrance and exit: `fade`, `rise`, `wipe`, `pop` (new), `draw` and
  `none`. A `rise` leaves moving up as it fades, a `pop` leaves shrinking slightly, and a `draw` exit is a fade. An element's `enter` and `exit` take a name or `{ motion, delay, duration }` (ms; `delay` for entrances).
  `validate` suggests the closest name for a misspelt one, in both forms, and names the bound of a `delay` or
  `duration` over 5000.
- **Choreography.** The elements that enter on one step take stagger slots: each is held until its slot, then
  plays its entrance. A step's `transition.stagger` sets the gap (it was accepted before but did nothing).
  `validate` warns `motion-budget` for an element whose hold plus entrance reaches 8 s (each element has 10 s to
  settle), and `exit-delay-ignored` for a `delay` in an `exit` (exits start at once).
- **Theme motion tokens.** `--sd-stagger` (80ms in `modern`, 60ms in `academic-light`), `--sd-enter` (`rise`,
  `fade`) and `--sd-motion-distance` (24px, 16px). `--sd-duration-fast` and `--sd-easing`, unused before, now
  time quick changes and ease every motion.
- **Components that build themselves.** `chart.line`, `chart.bar`, `chart.points`, `big-number`, `list`, `chat`,
  `diagram`, `terminal` and `timeline` declare `"x-enter": "own"`: when they appear they play their build (lines draw, bars
  grow, items rise in turn, the figure counts up) while their box stays still, in their stagger slot. A list that
  appears with its items already shown now builds them. `catalog` shows each entry's `enter` (`own` or `box`).
- **For component authors:** `ctx.motion` (`in`, `out`, `timing`), `info.entrance`, and `"x-enter": "own"` in a
  schema. The starter that `new-component` writes uses `ctx.motion` and no longer fades the element in.
- **Ghost placeholders.** `ghost: true` or `ghost: "<label>"` on an element shows a dashed frame, with the label,
  in its space while it is hidden (`false`, the default, shows none). `dump` reports it; `validate` reports `ghost-collapse` for a ghost on a
  collapsing element.
- **The gallery** has five motion slides: the named motions, a step's choreography, focus-dim, the message
  line with a badge, and ghost placeholders.
- **Data stories in the gallery.** Seven more slides, in a landing-page group "Data stories", play the new chart
  moves on synthetic data: a forecast and sweep, the draw fan, estimates with a re-sort, before and after pairs, strips
  with a followed item, a waterfall with a total, and a back-to-back pyramid.
- **Message line and badges.** A slide `lede` string is a muted line under the title (the `text` role `lede`, sized
  by the new theme token `--sd-font-size-lede`: 36px in `modern`, 32px in `academic-light`); a step can change it
  and the text crossfades; its box carries the new hook class `sd-lede`. The `text` component also has a `badge`
  role (an inline uppercase pill) with an optional `tone`, the index of its colour in the categorical palette:
  the border takes that colour and the text the same colour darkened to 4.5:1, so every tone passes `check`.
  `validate` warns `lede-on-cover` for a `lede` on a cover layout.
- **Focus-dim.** `highlight` now looks the same in `chart.line`, `chart.bar` and `diagram`: what is out of focus
  turns to the new optional theme token `--sd-color-dim` (opacity stays 1, text turns `--sd-color-muted`), the
  focused marks are drawn above the dimmed ones, and the change tweens over `--sd-duration-fast`. A theme
  without `--sd-color-dim` falls back to `--sd-color-rule`.
- **`chart.points`, a twelfth built-in.** Estimates from a CSV, one row per category: a dot, an optional interval
  whisker and the value beside it, against an optional `reference` line. `from` turns each row into a before and
  after pair (a hollow dot, a connector that grows, the filled dot); `shown`, `highlight` and `sort` work as in
  `chart.bar`; an empty value reads "no data", never a dot at zero. With `id` it draws beeswarm strips of many
  points per category, with a summary tick and one item followed across the strips (`focus`). Its dots grow out of the
  reference value, or out of the `from` value of a pair.
- **`chart.line` for data stories.** `points` puts a dot on every data point. `forecast: { from, label? }` dots the
  lines from an x on and shades the plot from there. `until` sweeps the lines along the x axis behind a cursor,
  with `ticker: true` for a large counting label of the x, so a story can run from data into forecast. `draws`
  paints a fan of uncertainty draws on a canvas under the lines; `shown` raises or lowers how many.
- **`chart.bar` re-sorts and takes two new modes.** `sort` orders the bars by value, by another column or by a
  list, and a change slides the bars to their new places. `mode: "waterfall"` stacks the bars into a running
  total (`total`, `invert`); `mode: "back-to-back"` puts two groups left and right of a centre rule, as in a
  population pyramid (`group`, `groups`).
- **Charts keep one scale across steps.** `chart.points`, a waterfall or back-to-back `chart.bar`, and the draw
  fan size their axis from every step of the slide, so a step that shows more never moves the axis. `domain`
  is still used as given.
- **For component authors:** `ctx.stepProps` (the element's props at every step) and `ctx.chart`, 28 building
  blocks of the built-in charts: table loading, extents, the plot frame, keyed joins, dots, whiskers, rules, a
  value axis, halos, a canvas layer, morph, entrance and `lerp` helpers, and colour helpers. The guide has a new
  section, "Build a chart from the engine's pieces", and the contract an example per group. The gallery shows them at work in a
  group of its own, "Custom components": `gallery.slope`, a slope chart of about 100 lines with no `import`,
  whose labels slide to their new rank, whose `highlight` dims the rest and whose lines draw in as its entrance.
- `validate` warns `chart-prop-unused` for `ticker` without `until` and for `invert` or `total` outside a
  waterfall, and reports `chart-orient` for a back-to-back chart with `orient: "vertical"`. `dump` reports a
  chart's canvas layer, and `check --played` compares it. The engine strings gain `forecast`, `total` and
  `noData`.

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
