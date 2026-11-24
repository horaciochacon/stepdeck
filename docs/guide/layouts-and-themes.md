# Using layouts and themes

This page shows how to pick a layout for a slide, put elements in its regions, resize regions per slide, add a little slide-specific CSS, and choose a theme, a palette and a language for the deck. It is for people who write slides by hand. It covers the tasks; every region, variable and token is listed in [Layouts](../reference/layouts.md) and [Themes](../reference/themes.md). If an agent builds your deck, the same rules are in [skill/references/themes-layouts.md](../../skill/references/themes-layouts.md).

The canvas is always 1920×1080. Every size and position on this page is in canvas pixels, whatever the window size.

## Pick a layout

A slide names its layout with `layout`. Without one it gets `full-bleed`.

| You want to show | Layout | Regions |
|---|---|---|
| A cover: kicker, title, subtitle, authors, an optional picture | `title` | `title`, `subtitle`, `meta`, `figure`, `footer` |
| A chart or other figure with a few notes beside it | `figure-notes` | `title`, `main`, `notes`, `footer` |
| One large thing that needs the whole canvas: a terminal, a diagram, an image, a chat | `full-bleed` (default) | `title`, `main` |
| One sentence or question, large and centred | `statement` | `title`, `main`, `footer` |
| Two things side by side: before and after, a prompt and its tasks | `halves` | `title`, `left`, `right`, `footer` |

Rules of thumb:
- A chart goes in `figure-notes` (or one half of `halves`), with its source line in `footer`. It also works in `full-bleed`, with the source line below it in `main`. See [Give figures room](#give-figures-room).
- `full-bleed` has no `footer`. Anything you add, a source line included, stacks in `main`.
- `statement` styles every `text` and `markdown` element in `main` at `--sd-font-size-statement`, centred (a list or chart there keeps its own type). Use `markdown` to make key words bold.

`node cli/index.js catalog <layout> <deck>` prints a layout's regions and variables from its `schema.json`.

## Put elements in regions

Each element names a region with `region`. Without one it goes to `main`. Elements in the same region stack top to bottom in the order you list them. The slide's `title` key is shorthand for a `text` element with id `title` in the `title` region.

This is the starter deck's chart slide (`templates/talk/slides/chart.js`):

```js
export default {
  id: "chart",
  layout: "figure-notes",
  title: "Group B overtakes Group A after 2020",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/series.csv", x: "year", y: "value", series: "group",
               series_shown: ["Group A"],
               axes: { x: "Year", y: "Indicator per 1,000" },
               format: { x: "d", y: ",.0f" } } },
    { id: "note", region: "notes", type: "text", from: "mark",
      props: { role: "note", text: "From 2020 on, Group B rises three times faster than before." } },
    { id: "latest", region: "notes", type: "big-number", from: "latest",
      props: { value: "{{data/summary.json#/latest_b}}", format: ",.1f", label: "Group B in 2024, per 1,000" } },
    { id: "source", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic example data (data/make-data.mjs)." } },
  ],
  steps: [
    { id: "base", notes: "Start with one series." },
    { id: "compare", set: { chart: { series_shown: ["Group A", "Group B"] } } },
    { id: "mark", set: { chart: { annotate: [{ x: 2020, label: "2020" }] } } },
    { id: "latest", only: { chart: { highlight: "Group B" } }, notes: "Land on the figure." },
  ],
};
```

### Wrong region names

If an element names a region the layout does not have, the slide still renders. The runtime shows an error box in the element's place, records the error in `STEPDECK.errors`, and the stray region can push the rest of the grid out of shape. `validate` reports it before you open the deck. Here a `full-bleed` slide `quote` gives its source line `region: "foot"`:

```text
quote/src · unknown-region · region 'foot' vs regions of full-bleed: title, main · set region to one of 'title', 'main', or give the element a box
```

When the name is close to a real one, the fix says which (`set region: "footer"`).

### Floating elements with `box`

An element with `box: { x, y, w, h }` is placed at those canvas pixels, above the regions, and is not part of any region. A boxed element with no `region` is exempt from `unknown-region`. The schema requires all four of `x`, `y`, `w` and `h`.

```js
{ id: "tag", type: "text", box: { x: 1500, y: 40, w: 300, h: 60 }, props: { role: "label", text: "Draft" } }
```

## Give figures room

`chart.line`, `chart.bar`, `chart.points`, `diagram`, `image`, `map` and `terminal` fill the room their region leaves, in every layout. A chart next to a source line in the same region takes the height the source line does not use. A chart alone in `figure-notes` `main` is 1096×790 (754 with a source line in `footer`). In `full-bleed` `main` a chart with a source line below it is 1728×730 at the 1920×1080 canvas.

The one place a chart gets no room is `statement` `main`: that region has no set height, so the chart collapses to zero height there. Use `statement` for words. `timeline` does not fill; it is a horizontal strip sized by its labels.

The sizes for every layout, and the rule behind them, are in the [Fill rules](../reference/layouts.md#fill-rules) table. No `validate` or `check` rule flags a collapsed chart, so look at a shot (`node cli/index.js shoot <deck> --slide <id>`) or at the boxes in `dump` (browser commands need Playwright, see [Checking a deck](checking-a-deck.md#dump-what-is-on-screen-at-each-step-as-text)).

Every slide with a chart, a `map` or a `big-number` needs a `text` element with `role: "source"`, or `validate` reports `figure-source`. Put it in `footer` when the layout has one. `full-bleed` has none, so the source line goes in `main`, under the chart.

## The title layout's figure column

On a `title` slide, the `figure` region takes no room while it is empty, and the cover is a single column. As soon as `figure` holds any element, the layout switches to two columns: the figure gets `--figure-width` (720px) on the right, and the title column takes the rest.

The switch counts every element in the region, including one hidden until a later step. An element shown with `from` therefore leaves the two-column layout in place from step 0, with an empty right column until it appears. A dump of such a slide (here with a `footer` source line too) shows the hidden element already sized:

```text
title · step 0 (one)
  visible  title   text  96,407 912×110        "Your talk title"
  hidden   fig     text  1104,96 720×876       "Figure later"
  visible  ft      text  96,996 1728×36        "Footer"
```

The cover title's size follows the same test, so it does not change when the figure appears: with a figure it is `--sd-font-size-cover-figure` (96px in `modern`) from step 0. If you want the cover to change shape, use two slides.

## Kicker and accent phrase

Two small things make a slide read like a designed one, and both live in the slide file:

- **Kicker.** `section: "Methods"` shows a small label above the title, on every layout that has a `title` region. On the `title` layout it sits on the top margin of the cover. `modern` draws it in the accent colour, `academic-light` in the muted ink. The kicker comes from `section` alone, so give each slide of a section the same string. To hide it on one slide, add `style: '[data-el="kicker"] { display: none }'`. On a layout without a `title` region the section is not shown, and `validate` warns `kicker-no-region`.
- **Accent phrase.** In a title, `*phrase*` is drawn in the accent colour: `title: "Analysing data with *an agent*"`. Use one phrase per title. It is upright, not italic. A literal asterisk is `\*`. An odd number of `*` or an empty `**` gives a `validate` warning (`title-accent`, `accent-empty`), and the text then shows the asterisks as written. A `markdown` title keeps markdown emphasis instead.

Both are described in [Deck and slide](../reference/deck-and-slide.md#section-the-kicker).

## Tune a layout per slide

Layouts read CSS variables with defaults, such as `--notes-width` (560px) in `figure-notes`. Override them for one slide with `regions`:

```js
regions: { "--notes-width": "640px" }
```

This is from the kit deck's `halves` slide (`examples/kit/slides/tasks.js`), which widens the gutter and centres short halves:

```js
layout: "halves",
regions: { "--gutter": "96px", "--align": "center" },
```

How `regions` works:
- Each key is set as a CSS custom property on the slide's canvas. Keys must be lowercase custom-property names (`--[a-z0-9-]+`); any other key, such as `gap` or `--Notes-Width`, fails `validate` as `spec-invalid`.
- Names are **not** checked against the layout's variables. A typo such as `--note-width` passes `validate` and changes nothing.
- Any custom property works, theme tokens included: `regions: { "--sd-region-gap": "40px" }` changes the gap for this slide only.
- Values are strings.

Widen a region when `check` reports `text-outside-region`, or when a long title wraps badly.

## Add slide-specific CSS

`style` is a string of CSS for one slide. The runtime scopes it to the slide, so it cannot leak to other slides:
- every selector is prefixed with `[data-slide="<id>"]`;
- a selector that starts with `:scope` or `&` targets the slide's canvas itself;
- rules inside `@media` and `@supports` are scoped too; `@keyframes` are kept as they are.

From `examples/kit/slides/track.js`, which widens the gap between the lead line and the timeline:

```js
style: ":scope > [data-region=\"main\"] { gap: calc(var(--sd-region-gap) * 3); }",
```

Limits:
- No `@import`. The browser drops it without a word; `validate` reports `style-import`.
- No remote URLs (`http://`, `https://`, `//host`). Copy the file into the deck and use a relative `url()`; `validate` reports `remote-url`.
- Use tokens for colors and sizes: `color: var(--sd-color-accent)`, `font-size: var(--sd-font-size-note)`.

Colors in element props come from the theme, not from hex values. A hex color in any prop string is reported as `hex-color`:

```text
chart/tag/base · hex-color · text has #ff0000 vs no hex colors in props · remove #ff0000 from text; colors come from the theme palette (use {{color:accent}} words in text)
```

To name a color in text, use a palette role in a `markdown` element: `{{color:accent}}` becomes the color's name in the deck language, such as "blue" or "azul".

## Choose a theme

A theme is a folder of tokens (`tokens.css`), palettes (`palettes.json`), fonts and, optionally, hook rules (`theme.css`). The deck picks one in `deck.js`:

```js
theme: "modern",
```

To try another theme without editing the deck, add `?theme=<name>` to the page URL. The URL flag wins over `deck.theme`; with neither, the engine uses its default. The browser commands take the same override as `--theme <name>` (`check --theme academic-light`).

Two themes are built in. `modern` is the default: Geist type, a deep blue accent, near-black titles with tight tracking, and a large cover title. `academic-light` is the plain alternative (Source Sans 3, a muted palette). Both declare the same tokens, so a deck works under either. A deck made by `stepdeck new` carries its own copy of the engine, so changing the engine's default does not change an existing deck until its `stepdeck/` copy is upgraded (see [How do I update the engine in an existing deck?](../troubleshooting.md#how-do-i-update-the-engine-in-an-existing-deck)). `validate` reports a theme the engine does not have as `unknown-theme`. A theme lives in the deck's engine copy, `<deck>/stepdeck/themes/<name>/`; adding one is covered in [Adding a theme](../contributing/adding-a-theme.md), and the theme files are listed in [Themes](../reference/themes.md).

Every token can be overridden per slide, through `regions` or a `:scope` rule in `style`:

```js
style: ":scope { --sd-font-size-body: 44px; }"
```

## Choose a palette

A theme has palettes of three kinds: `categorical` (series and categories), `sequential` and `diverging`. For each kind it names a default: `modern` uses `modern`, `viridis` and `blue-red`; `academic-light` uses `okabe-ito-dark`, `viridis` and `blue-red`.

A deck can name one palette in `deck.js`:

```js
palette: "viridis",
```

`deck.palette` applies only to its own kind. Components that ask for another kind still get the theme's default for that kind. A name the theme does not have is reported as `unknown-palette`.

`validate` checks the categorical palette the deck uses against the theme background:
- `palette-contrast`: every color needs at least 3:1 contrast, enough for lines and bars;
- `palette-cvd`: every pair of colors must stay distinguishable under simulated protanopia, deuteranopia and tritanopia.

Only the categorical palette is checked. Text needs 4.5:1, which `check` measures as `contrast`; `chart.line` darkens its series labels to reach it.

## Set the language

`deck.lang` (or `?lang=` in the URL, which wins) sets the deck language. It defaults to `en`; `en` and `es` are built in. A regional code uses its language (`es-PE` reads as `es`), and any other code falls back to English. The language affects:

| What | `en` | `es` |
|---|---|---|
| Number formats in bindings and charts | `1,234.5` | `1.234,5` |
| Engine strings, such as the `big-number` interval label | `95% CI` | `IC 95%` |
| Color names from `{{color:<role>}}` in `markdown` | `blue` | `azul` |

Negative numbers use the minus sign (U+2212) in both. Your own slide text is not translated.

## Footers and the minimum font size

`check` reports any audience text smaller than the theme's minimum, 28px in both built-in themes, as `font-too-small`. Two kinds of text are exempt, so source lines can be small:
- every element in a region named `footer`;
- `text` with `role: "source"`, wherever it is.

Put source, license and event lines in `footer` with `role: "source"`:

```js
{ id: "source", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic example data." } }
```

Do not shrink other text below the minimum through `style` or `regions`; `check` will report it.

## Check your changes

Run `validate` for names (layouts, regions, themes, palettes, hex colors, `style` rules), then `check` for what the browser lays out (text outside its region, overlap, font size, contrast). `dump` prints each element's box, which is the quickest way to see whether a chart got its height:

```sh
node cli/index.js dump <deck> --slide chart
```

`check` and `dump` drive Chrome through Playwright, which is not a dependency: install it or set `STEPDECK_PLAYWRIGHT`. See [Checking a deck](checking-a-deck.md).

## See also

- [Layouts](../reference/layouts.md): every region and variable of the five layouts.
- [Themes](../reference/themes.md): every token and the palette file format.
- [Adding a theme](../contributing/adding-a-theme.md): making a new theme.
- [The step model](step-model.md): `from`, `at` and steps that show elements later.
- [skill/references/themes-layouts.md](../../skill/references/themes-layouts.md): the same material for agents.
