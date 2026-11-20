# Layouts

This page lists every built-in layout: its regions, its grid variables and their defaults, how its grid behaves, which regions let a figure fill them, and the gotchas. It also documents the layout descriptor format (`schema.json`) and the checks that use it. It is for everyone who writes slides, and for contributors who add a layout.

For the task-oriented version (picking a layout, placing elements, resizing a region), read [Using layouts and themes](../guide/layouts-and-themes.md). Agents use [skill/references/themes-layouts.md](../../skill/references/themes-layouts.md). Theme tokens such as `--sd-canvas-margin` and `--sd-region-gap` are listed in [Themes](themes.md); the pixel values quoted here do not depend on the theme, except the type sizes, which are given for `modern` (the default theme) and `academic-light`.

## How layouts work

A layout is a folder `layouts/<name>/` of the engine:

| File | Required | What it holds |
|---|---|---|
| `layout.css` | yes | The CSS grid: `grid-template-columns`, `-rows`, `-areas`, padding, and per-region rules, all scoped with `.sd-canvas[data-layout="<name>"]`. Placement only: see [Layout CSS is placement only](#layout-css-is-placement-only). |
| `schema.json` | yes | The layout descriptor: name, description, regions, variables, and optionally `hooks` and `kind`. See [Layout descriptor](#layout-descriptor). |
| `README.md` | no | Human notes; the catalog serves it. |
| `example.js` | no | An example slide; the catalog points to it. |

When a slide is mounted, the runtime fetches `layouts/<layout>/layout.css` and `schema.json` from the engine root, then [`core/layout.js`](../../engine/core/layout.js) builds the canvas:

- The canvas is `div.sd-canvas[data-slide][data-layout][data-kind]`, 1920×1080, `display: grid` ([`core/stepdeck.css`](../../engine/core/stepdeck.css)). `data-kind` is the layout's `kind` (`content` unless the descriptor says `cover`).
- Each region named in `schema.json` becomes one `div.sd-region[data-region="<name>"]`, in schema order, with `grid-area: <name>` set inline. The layout CSS only declares the grid; it never has to assign areas. A region is created even when no element uses it.
- A region is a column flexbox with `gap: var(--sd-region-gap)` (24px), `min-width: 0` and `min-height: 0`. Elements stack top to bottom in the order the slide lists them.
- An element without `region` goes to `main`. An element with a `box` is positioned absolutely on the canvas instead and floats above every region.
- A slide without `layout` uses `full-bleed` (`DEFAULT_LAYOUT` in [`core/constants.js`](../../engine/core/constants.js)).
- The slide's `title` string is shorthand for a `text` element with id `title` in the `title` region. Every built-in layout has a `title` region.
- The `title` region is an inline-size container named `sd-title` (`container: sd-title / inline-size`, set inline by core). Its width therefore never comes from its content: see [Layout CSS is placement only](#layout-css-is-placement-only).
- The layout's `layout.css` is injected in the `sd-layout` cascade layer, between core and the theme (see [Cascade layers](themes.md#cascade-layers)). A region and the element wrappers in it get a hook class `sd-<hook>` when the descriptor maps the region to a hook, and the reserved `title` element gets `sd-title`. Styling a hook is the theme's job, not the layout's.
- The slide's `section` becomes a `kicker` text element, first in the `title` region (above the title), when the layout has a `title` region. On a layout without one, the kicker is dropped quietly and `validate` warns `kicker-no-region`.
- Hidden elements keep their space (`visibility: hidden`); elements with `collapse: true` take none while hidden (`display: none`).

If an element names a region the layout does not declare, the element is still rendered (in an extra region whose `grid-area` names an area the grid does not define, so it can push the grid out of shape), its box shows the error, and the line `<slide>/<element>: unknown region '<name>' in layout '<layout>' (regions: …)` goes to `STEPDECK.errors`. If the layout itself is missing, the slide shows `<slide>: layout '<name>' not found (…)`.

## Layouts at a glance

| Layout | Regions | Variables (default) | Any lone element fills |
|---|---|---|---|
| [`title`](#title) | `title`, `subtitle`, `meta`, `figure`, `footer` | `--title-width` (`1400px`), `--meta-gap` (`64px`), `--figure-width` (`720px`) | `figure` |
| [`figure-notes`](#figure-notes) | `title`, `main`, `notes`, `footer` | `--notes-width` (`560px`), `--notes-gap` (`72px`) | `main` |
| [`full-bleed`](#full-bleed) (default) | `title`, `main` | `--title-height` (`auto`) | none |
| [`statement`](#statement) | `title`, `main`, `footer` | `--statement-width` (`1500px`) | none |
| [`halves`](#halves) | `title`, `left`, `right`, `footer` | `--split` (`1fr 1fr`), `--gutter` (`var(--sd-region-gap)`), `--align` (`start`) | `left`, `right` |

Unless noted, the canvas padding is `--sd-canvas-margin` (96px) on the top and sides and half of it (48px) at the bottom, under the footer.

## title

A cover slide, laid out like a printed cover (`kind: "cover"`). The `title` region spans the top rows: the slide's `section` (the kicker, a small label) sits on the top margin and the title sits at the bottom of that band, so the title and the subtitle land in the upper middle. The meta block (authors, affiliation, date) sits on the bottom margin, and the footer line is below it. An optional figure can sit on the right.

| Region | Meaning |
|---|---|
| `title` | The kicker (from `section`) on the top margin, then the talk title at `--sd-font-size-cover` (`modern` 140px, `academic-light` 88px), title weight, tight line height, balanced lines. |
| `subtitle` | Below the title, at `--sd-font-size-heading` (48px) in `--sd-color-muted`, with `2 × --sd-space` (32px) above it. |
| `meta` | Authors, affiliation, venue, date, on the bottom margin above the footer. Elements stack with a gap of `--sd-space / 2` (8px), at `--sd-font-size-note` (32px). `modern` draws a thin accent rule along its left edge. |
| `figure` | Optional figure on the right margin, spanning every row above the footer, centred vertically. |
| `footer` | Footer line across the canvas, below the meta block, with `--sd-region-gap` above it. |

| Variable | Default | Meaning |
|---|---|---|
| `--title-width` | `1400px` | Maximum width of the title, subtitle and meta column. |
| `--meta-gap` | `64px` | The least space between the subtitle and the meta block. It is a minimum: the row between them takes all the free height above it. (It used to be padding above `meta`.) |
| `--figure-width` | `720px` | Width of the figure column, only while `figure` holds an element. |

**Grid.** Columns `minmax(0, var(--title-width, 1400px)) minmax(0, 1fr)`; rows `minmax(min-content, 1fr) auto minmax(var(--meta-gap, 64px), 1fr) auto auto`; areas `"title figure" "subtitle figure" ". figure" "meta figure" "footer footer"`. The title row grows with a tall title (`min-content`), so a long title pushes the rest down instead of overflowing onto the subtitle.

**Cover geometry.** The `title` region is a column that ends at its bottom (`justify-content: flex-end`), and the kicker inside it takes the free space after it (`margin-block-end: auto`). So the kicker is on the top margin and the title is at the bottom of the band, in the upper middle of the canvas. A cover with no `section` has no kicker; its title is still at the bottom of the band. The flexible row between the subtitle and `meta` pushes `meta` onto the bottom margin. Measured with `dump` on a cover with a section, a one-line title, a subtitle, two meta lines and a footer (`academic-light`, 88px title, 1920×1080): kicker at y 96, title at y 343, subtitle at y 477, meta at y 880 and 930, footer at y 996. The title and subtitle move with the title's height; the kicker, the meta block and the footer do not.

**Figure.** The cover title's size is chosen by core, not by the layout. A `kind: "cover"` layout gets `--sd-font-size-cover`, and, while a region named `figure` holds an element, the smaller `--sd-font-size-cover-figure` (`modern` 96px; a theme without the token falls back to the cover size). This is a convention by name: a cover layout whose figure region is called something else never gets the smaller size. The trigger is the figure's presence, the same test the layout uses for two columns, so the two cannot disagree. With the figure, a title of about 40 characters stays within three lines at 1920×1080.

**Overflow.** Titles are meant to be one to three lines. At `modern`'s 140px cover size three lines fit. A kicker plus four lines overflows, and so can four lines without a kicker once the meta block has two lines and there is a footer; five or more lines overflow always. `check` reports `text-outside-region`. Shorten the title or widen it with `--title-width` before shrinking type.

**Two-column switch.** When the `figure` region holds any element, the columns become `minmax(0, 1fr) var(--figure-width, 720px)` with a column gap of `--sd-canvas-margin`. The title column then takes the rest of the width and no longer stops at `--title-width`. The selector is `:has(> [data-region="figure"] > .sd-el)`, so the switch happens as soon as the figure region contains an element, **even one that is hidden until a later step** (hidden and collapsed elements are still children). An element revealed at step 1 does not change the layout between steps: the cover is two-column from step 0, and its title size is the same at every step. Measured with `dump`: with a figure element, the title column is 912px wide at every step; the figure region is 720×876 with a one-line footer (720×912 with an empty footer).

**Fill.** A chart, diagram, image or terminal in `figure` takes the height the other elements leave; any other element fills it only when it is alone (`flex: 1 1 0; min-height: 0`). See [Fill rules](#fill-rules).

From [`templates/talk/slides/title.js`](../../templates/talk/slides/title.js):

```js
export default {
  id: "title",
  layout: "title",
  section: "Event name",
  title: "Your *talk title*",
  elements: [
    { id: "subtitle", region: "subtitle", type: "text", props: { text: "A subtitle that says what the audience will take away" } },
    { id: "meta", region: "meta", type: "text", props: { text: "Author name · Affiliation · Date" } },
    { id: "footer", region: "footer", type: "text", props: { role: "source", text: "Made with stepdeck" } },
  ],
};
```

`section` is the kicker, and the asterisks in `title` mark an accent phrase: see [Deck and slide](deck-and-slide.md#section-the-kicker) and [Text](components/text.md#accent-phrase).

## figure-notes

A figure with a column of notes beside it: a title band, the figure in `main` on the left, `notes` on the right and a `footer` line for the source. The usual layout for a results slide.

| Region | Meaning |
|---|---|
| `title` | Title band across the canvas, with `2 × --sd-region-gap` (48px) below it. |
| `main` | The figure. A chart, diagram, image or terminal takes the height the other elements leave. |
| `notes` | Notes column right of the figure. Elements stack centred vertically, `1.5 × --sd-region-gap` (36px) apart. |
| `footer` | Footer line across the canvas, typically the source, with `--sd-region-gap` above it. |

| Variable | Default | Meaning |
|---|---|---|
| `--notes-width` | `560px` | Width of the notes column; `main` takes the rest. |
| `--notes-gap` | `72px` | Space between the figure and the notes column. |

**Grid.** Columns `minmax(0, 1fr) var(--notes-width, 560px)`; rows `auto minmax(0, 1fr) auto`; areas `"title title" "main notes" "footer footer"`; column gap `var(--notes-gap, 72px)`. At the defaults `main` is 1728 − 560 − 72 = 1096px wide.

**Fill.** `> [data-region="main"] > .sd-el:only-child { flex: 1 1 0; min-height: 0; }`. Only `main` has this rule; the notes column does not. A chart, diagram, image or terminal fills `main` whatever else is there, so a source line may share `main` with it or go in `footer` (see [Fill rules](#fill-rules)).

The starter deck's chart slide ([`templates/talk/slides/chart.js`](../../templates/talk/slides/chart.js)) uses this layout: a `chart.line` alone in `main`, a note and a `big-number` in `notes`, the source in `footer`.

## full-bleed

One `main` region filling the canvas, with an optional title band on top. It is the default layout.

| Region | Meaning |
|---|---|
| `title` | Title band. Its row is `auto`, so it has zero height when the slide has no title. |
| `main` | Everything else; elements stack in the order listed. |

| Variable | Default | Meaning |
|---|---|---|
| `--title-height` | `auto` | Height of the title band row. |

**Grid.** Columns `1fr`; rows `var(--title-height, auto) 1fr`; areas `"title" "main"`. Unlike the other layouts, the canvas has no padding: the regions carry it. `title` is padded `--sd-canvas-margin` on the top and sides and 0 at the bottom; `main` is padded `--sd-region-gap` (24px) on top and `--sd-canvas-margin` on the sides and the bottom (the full margin, not half).

**Gotchas.**
- There is no `footer` region. A source line goes in `main`, under the figure (`validate`'s `figure-source` fix suggests `region: "main"` for this layout).
- There is no only-child fill rule, and none is needed for a figure. A `chart.line`, `chart.bar`, `diagram`, `image` or `terminal` fills the height the other elements leave: a chart with a one-line source below it in a slide with a title measures 1728×730, and 1728×790 alone (see [Fill rules](#fill-rules)). Another type of element is only as tall as its content.

## statement

One large centred sentence or question, with an optional title on top and a footer line at the bottom.

| Region | Meaning |
|---|---|
| `title` | Optional title, aligned to the top of its row. |
| `main` | The statement, centred both ways. |
| `footer` | Footer line on the bottom margin, aligned to the bottom of its row, with `--sd-region-gap` above it. |

| Variable | Default | Meaning |
|---|---|---|
| `--statement-width` | `1500px` | Measure (width) of the statement. |

**Grid.** Columns `minmax(0, 1fr) minmax(0, var(--statement-width, 1500px)) minmax(0, 1fr)`; rows `minmax(0, 1fr) auto minmax(0, 1fr)`; areas `"title title title" ". main ." "footer footer footer"`. The `main` row is `auto` between two equal flexible rows, so the statement sits in the middle, between the title and footer rows.

**Text styling.** The descriptor maps `main` to the `statement` hook. Every `text` and `markdown` element in `main` is set at `--sd-font-size-statement` (64px), tight line height, centred, with balanced lines, by core's hook rule (the layout CSS only places `main`). Use a `markdown` element to make key words bold. A list, a chart or any other component in `main` keeps its own type. A theme can restyle the hook as `.sd-statement`.

**Gotchas.** `main` has an `auto` height, so there is no room for a filling type to take: a chart there measures 1500×0, and a diagram, image or terminal collapses the same way. `check` can report it as `text-outside-region`, but only as a side effect: the chart's axis text spills out of the empty region. There is no squashed-chart check, so that report may not fire. This layout is for words.

From [`examples/kit/slides/question.js`](../../examples/kit/slides/question.js):

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

## halves

Two halves side by side under a title band, with a footer line: before and after, a prompt and its tasks, two options.

| Region | Meaning |
|---|---|
| `title` | Title band across the canvas, with `2 × --sd-region-gap` (48px) below it. |
| `left` | The left half. A chart, diagram, image or terminal takes the height the other elements leave; any other element fills it only when alone. |
| `right` | The right half, same rules as `left`. |
| `footer` | Footer line across the canvas, with `--sd-region-gap` above it. |

| Variable | Default | Meaning |
|---|---|---|
| `--split` | `1fr 1fr` | Column tracks of the two halves, for example `2fr 1fr`. Give exactly two tracks. |
| `--gutter` | `var(--sd-region-gap)` | Space between the halves. |
| `--align` | `start` | Vertical alignment of each half's content: `start`, `center` or `end`. |

**Grid.** Columns `var(--split, 1fr 1fr)`; rows `auto minmax(0, 1fr) auto`; areas `"title title" "left right" "footer footer"`; column gap `var(--gutter, var(--sd-region-gap))`. At the defaults each half is (1728 − 24) / 2 = **852px** wide.

**Fill and alignment.** A chart, diagram, image or terminal in `left` or `right` takes the height the other elements leave, and any other element fills the half when it is alone (`flex: 1 1 0; min-height: 0`). `--align` sets `justify-content: safe <align>` on each half, which moves stacked elements; for a lone element it sets `align-content: safe <align>` on the element instead, so the element keeps filling the half (a chart still measures the full height) and its own content moves inside it. `safe` stops overflowing content from being pushed above the half.

From [`examples/kit/slides/tasks.js`](../../examples/kit/slides/tasks.js), which widens the gutter and centres short halves:

```js
export default {
  id: "tasks",
  layout: "halves",
  title: "One prompt, four tasks",
  regions: { "--gutter": "96px", "--align": "center" },
  elements: [
    { id: "prompt", region: "left", type: "chat",
      props: { style: "card", messages: [ /* … */ ] } },
    { id: "todo", region: "right", type: "list",
      props: { marker: "check", done: 0, items: [ /* … */ ] },
      advance: { prop: "done", values: [0, 1, 2, 3, 4], start: "prompt" } },
  ],
  steps: [{ id: "prompt" }, { id: "checked" }, { id: "fitted" }, { id: "drawn" }, { id: "written" }],
};
```

With a 96px gutter each half is (1728 − 96) / 2 = 816px wide.

## Fill rules

Components measure their element's size at mount (`offsetWidth` and `offsetHeight`). An element in a region only gets height if a CSS rule lets it grow; otherwise it is as tall as its content, and a chart, whose SVG has no intrinsic height, would come out about 150px tall.

One rule in [`core/stepdeck.css`](../../engine/core/stepdeck.css) applies to every layout: in a region, an element of type `chart.line`, `chart.bar`, `diagram`, `image` or `terminal` gets `flex: 1 1 0; min-height: 0`. It takes the height the other elements in the region leave, alone or not (`image`, `terminal` and the charts only while not collapsed or failed). `timeline` does not fill: it is a horizontal strip sized by its labels.

A layout can add a second rule, `> .sd-el:only-child { flex: 1 1 0; min-height: 0; }`, for a region. It fills any other component, such as a deck's own, when it is the only element there. These regions have it:

| Layout | Region with the only-child rule |
|---|---|
| `title` | `figure` |
| `figure-notes` | `main` |
| `halves` | `left`, `right` |
| `full-bleed` | none |
| `statement` | none |

Sizes of a `chart.line`, measured with `dump` at the defaults (title text present, footer region empty unless noted):

| Placement | Size (px) |
|---|---|
| `figure-notes` `main`, alone | 1096×790 (about 754 tall with a one-line source in `footer`) |
| `figure-notes` `main`, with a one-line source also in `main` | 1096×730 |
| `halves` `left`, alone | 852×790 |
| `title` `figure`, alone | 720×912 (about 876 tall with a one-line footer) |
| `full-bleed` `main`, alone | 1728×790 |
| `full-bleed` `main`, with a one-line source below it | 1728×730 |
| `statement` `main` | 1500×0 |

Gotchas:
- A region with no height of its own gives a filling element nothing to take. `statement` `main` is `auto` high, so a chart, diagram, image or terminal there collapses to zero height.
- The only-child rule counts every element in the region, hidden and collapsed ones included. Adding a second element to the region turns it off from step 0. A chart, diagram, image or terminal is not affected; it is the other types that stay as tall as their content.
- A deck's own component does not get the type rule: it is written per built-in type in core CSS.
- No rule checks a chart's height. A collapsed chart is caught only incidentally, when its axis text spills out of the region (`text-outside-region`, as in `statement`). Look at `dump` boxes or `shoot` images.
- Any element can be given a `box` instead, which sets its size directly.

## Overriding variables per slide

A slide changes a layout's variables with `regions`:

```js
regions: { "--notes-width": "700px" }
```

The renderer sets every key that starts with `--` as a custom property on that slide's canvas (`root.style.setProperty`). Keys that do not start with `--` are ignored. The slide schema requires names matching `^--[a-z0-9-]+$` and string values.

The names are **not** checked against the layout's declared variables. A typo such as `--note-width` passes `validate` and has no effect, and any custom property can be set this way, theme tokens included (for example `"--sd-region-gap": "40px"` for one slide). Check the variable name against the tables above or `catalog <layout>`.

## Layout descriptor

Every `layouts/<name>/schema.json` is a layout descriptor, validated against [`schema/layout.schema.json`](../../engine/schema/layout.schema.json) (JSON Schema draft 2020-12). It is not a props schema: it declares names and documents variables.

| Key | Type | Required | Rule |
|---|---|---|---|
| `name` | string | yes | Pattern `^[a-z0-9][a-z0-9-]*$`. |
| `description` | string | yes | Non-empty. Its first sentence is the catalog summary. |
| `regions` | array | yes | At least one item. |
| `regions[].name` | string | yes | Pattern `^[a-z][a-z0-9-]*$`. |
| `regions[].description` | string | yes | Non-empty. |
| `variables` | array | yes | May be `[]`. |
| `variables[].name` | string | yes | Pattern `^--[a-z0-9-]+$`. |
| `variables[].default` | string | yes | The fallback used in `layout.css`, as text. |
| `variables[].description` | string | yes | Non-empty. |
| `hooks` | object | no | Region name to a published hook: one of `title`, `kicker`, `accent`, `subtitle`, `meta`, `statement` (`HOOKS` in [`core/constants.js`](../../engine/core/constants.js)). Core adds the class `sd-<hook>` to that region and to every element wrapper in it. |
| `kind` | string | no | `content` (default) or `cover` (`LAYOUT_KINDS` in `core/constants.js`). Core sets it as `data-kind` on the canvas. A `cover` title takes `--sd-font-size-cover`, and `--sd-font-size-cover-figure` while a region named `figure` holds an element. |

No other keys are allowed at any level (`additionalProperties: false`).

What the engine uses:
- **Runtime**: `regions[].name`, in order, to create the region elements, and `hooks` and `kind` for the hook classes and `data-kind`. Variables are documentation; their real defaults are the fallbacks in `layout.css` (`var(--notes-width, 560px)`), so keep the two in step.
- **validate** ([`cli/validate.js`](../../cli/validate.js)): region names, and the rules below.
- **catalog** ([`cli/catalog.js`](../../cli/catalog.js)): a layout entry is `{ kind: "layout", name, summary, animates: [] }`, and `catalog <name>` adds `description`, `regions`, `variables`, `readme` (the README text) and `example` (`layouts/<name>/example.js`, or `null`). Layouts are found as the folders of `layouts/` that hold a `schema.json`; an unreadable one gives a `catalog-schema` warning, and a layout with the same name as a theme gives `catalog-name`.

The `title` descriptor, from [`layouts/title/schema.json`](../../engine/layouts/title/schema.json) (long descriptions shortened with `…`):

```json
{
  "name": "title",
  "description": "A cover slide: title, subtitle and meta (authors, affiliation, date) on the left margin, an optional figure on the right, and a footer line at the bottom.",
  "kind": "cover",
  "hooks": { "subtitle": "subtitle", "meta": "meta" },
  "regions": [
    { "name": "title", "description": "The talk title, in the cover size (the slide's `title` sugar goes here), under the kicker from the slide's `section`; …" },
    { "name": "subtitle", "description": "Subtitle below the title, in the heading size and the muted color." },
    { "name": "meta", "description": "Authors, affiliation, venue and date, on the bottom margin above the footer; …" },
    { "name": "figure", "description": "Optional figure on the right margin, beside the title column. Empty: the cover is unchanged. With an element: two columns." },
    { "name": "footer", "description": "Footer line on the bottom margin, typically a source, license or event line." }
  ],
  "variables": [
    { "name": "--title-width", "default": "1400px", "description": "Measure (maximum width) of the title, subtitle and meta column." },
    { "name": "--meta-gap", "default": "64px", "description": "The least space between the subtitle and the meta block." },
    { "name": "--figure-width", "default": "720px", "description": "Width of the figure column when the figure region holds an element; the title column takes the rest." }
  ]
}
```

### Layout CSS is placement only

A layout's `layout.css` decides where regions go and how elements are aligned inside them. It does not style text: type and colour belong to core's hook defaults and to the theme's `theme.css`, so one layout looks right under every theme and a fourth layout that knows nothing about themes still gets the right title, kicker and accent styling. The unit test `test/unit/layout-contract.test.mjs` scans every layout's CSS (comments stripped) and fails on any of:

- `color`, `font`, `font-family`, `font-weight`, `font-style`, `letter-spacing`, `text-transform`, `line-height`, `text-align` or `-webkit-text-fill-color`;
- any `--sd-*` custom property;
- `!important`;
- a `font-size` that is not `var(--sd-…)` with no literal fallback.

Because of inline-size containment, the `title` region must sit in a stretched or sized track (a `1fr` or fixed column, or `stretch` alignment). Core makes that region a size container (`container: sd-title / inline-size`), so its width never comes from its content. A layout that puts `title` in an `auto` or `max-content` track, or sets `justify-self: start` or `center` on it, collapses the title to zero width. No built-in layout does.

### Checks

| Rule | Command | Fires when | Fix it gives |
|---|---|---|---|
| `layout-schema` | `validate` | Any engine `layouts/<name>/schema.json`, used by the deck or not, is missing, unreadable or does not match the descriptor schema. | `add a valid layouts/<name>/schema.json (see schema/layout.schema.json)`, or the schema error's fix |
| `unknown-layout` | `validate` | A slide's `layout` (default `full-bleed`) has no readable `schema.json`. The lookup is exact-case. Limit: `layouts: <known list>`. | `set layout: "<closest>"`, or `set layout to one of …` |
| `unknown-region` | `validate` | An element's `region` (default `main`) is not declared by its layout. Elements with a `box` and no `region` are exempt. | `set region: "<closest>"`, or `set region to one of …, or give the element a box` |
| `figure-source` | `validate` | A slide with a figure has no `role: "source"` element. | The suggested element goes in `footer` when the layout has one, else in `main`. |
| `font-too-small` | `check` | Text below `--sd-min-audience-font` (28px by default). Elements in the `footer` region and `role: "source"` text (in any region) are exempt, which is why a layout's footer region must be called `footer`. | `use a larger font size; only sources (role: "source") and the footer may go smaller` |

### Adding a layout

The runtime and `validate` read layouts from the engine root only: the repository's `engine/`, or a deck's `stepdeck/` copy made by `stepdeck new`. `catalog` run on a deck also lists any `<deck>/layouts/` folder, but the runtime does not use it: such a layout is listed, then fails as `unknown-layout` or `layout '<name>' not found`. So a new layout for one deck goes in `<deck>/stepdeck/layouts/<name>/`. Step by step, see [Adding a layout](../contributing/adding-a-layout.md). In short:

1. Write `schema.json` with every region the slides may use, and list each grid variable with the same default you use in the CSS fallback.
2. Write `layout.css` scoped with `.sd-canvas[data-layout="<name>"]`: grid templates and areas named after the regions, and canvas padding (the built-ins with a footer use `var(--sd-canvas-margin) var(--sd-canvas-margin) calc(var(--sd-canvas-margin) / 2)`).
3. Charts, diagrams, images and terminals fill any region through core CSS, so they need nothing from the layout. Add `> [data-region="<r>"] > .sd-el:only-child { flex: 1 1 0; min-height: 0; }` to a region meant to hold one lone element of another type, such as a deck's own component. Give a filling element a region with a height of its own (not `auto`).
4. Name the region for source lines `footer`, so the `font-too-small` exemption and the `figure-source` fix apply.
5. Add a `README.md` and an `example.js`, then run `validate` (for `layout-schema`) and `check` on a deck that uses the layout.
