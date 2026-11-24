# Adding a layout

This page shows how to write a layout: the folder it lives in, the `layout.css` grid, the `schema.json` descriptor, how a figure fills its region, the `footer` region, and the commands that check the result. It is for contributors who add a built-in layout to the repository, and for deck authors who add a layout to one deck's engine copy. To use the existing layouts, read [Using layouts and themes](../guide/layouts-and-themes.md); every built-in is listed in the [Layouts reference](../reference/layouts.md). Agents follow [skill/references/themes-layouts.md](../../skill/references/themes-layouts.md).

The running example is `wide-figure`: one chart across the full width under a title band, with a footer line for its source. No built-in layout does this today. `full-bleed` has no footer, so its source line has to share `main` with the chart. Every command output on this page comes from running it on a scratch deck made with `new`.

## Choose where the layout goes

A layout is a folder named after the layout, in the `layouts/` folder of the engine that the deck uses:

| You are adding | Folder | Who gets it |
|---|---|---|
| A built-in layout | `engine/layouts/<name>/` in this repository | The example decks right away (they use `engine/` as their engine), and every deck made afterwards by `new`, which copies `layouts/` into `<deck>/stepdeck/`. |
| A layout for one deck | `<deck>/stepdeck/layouts/<name>/` | Only that deck. |

The CLI uses the engine copy at `<deck>/stepdeck/` when that folder holds `core/render.html`, and the repository's `engine/` otherwise (`engineFor` in [`cli/engine.js`](../../cli/engine.js)). The runtime loads `layouts/<name>/layout.css` and `layouts/<name>/schema.json` from the same engine root. A layout folder placed directly in the deck (`<deck>/layouts/`) is never read.

The folder holds these files:

| File | Required | Purpose |
|---|---|---|
| `layout.css` | yes | The CSS grid and per-region rules. |
| `schema.json` | yes | The descriptor: name, description, regions and variables. |
| `README.md` | for built-ins | Human notes. `catalog` serves the file. |
| `example.js` | for built-ins | An example slide. `catalog` gives its path. |

The runtime and the CLI need only the first two. For a built-in, `test/unit/layouts.test.mjs` requires all four (see [Run the unit tests](#run-the-unit-tests)).

Name the folder with lowercase letters, digits and hyphens (the descriptor's `name` must match `^[a-z0-9][a-z0-9-]*$`), and give `name` the same value as the folder. Slides refer to the folder name. Lookups are exact-case.

## Know what the runtime builds

You write only the grid. [`core/layout.js`](../../engine/core/layout.js) builds the rest of the canvas for every slide:

- The canvas is `div.sd-canvas[data-slide][data-layout="<name>"][data-kind]`, 1920×1080, with `display: grid` and `overflow: hidden` ([`core/stepdeck.css`](../../engine/core/stepdeck.css)).
- Each region listed in `schema.json` becomes a `div.sd-region[data-region="<region>"]`, in the order the descriptor lists them, with `grid-area: <region>` set inline. The region exists even when no element uses it.
- A region is a column flexbox with `gap: var(--sd-region-gap)`, `min-width: 0` and `min-height: 0`. Elements are `div.sd-el[data-el][data-type]` and stack in the order the slide lists them.
- An element without `region` goes to `main`. An element with a `box` is placed absolutely on the canvas, above every region.
- A slide's `title` string becomes a `text` element in the region named `title`, and its `section` string a `kicker` text element above it, when the layout has a `title` region. Both get hook classes (`sd-title`, `sd-kicker`) that core and the theme style, so the layout does not have to.
- The `title` region is made an inline-size container (`container: sd-title / inline-size`).
- A slide's `regions: { "--name": "value" }` sets those custom properties inline on the canvas. Only keys that start with `--` are applied.

From this follow three naming rules:

| Region name | Why it matters |
|---|---|
| `title` | Needed if slides on the layout use the `title` sugar. Without it, every slide with a `title` fails validate with `unknown-region`, and a slide's `section` (the kicker) is dropped with a `kicker-no-region` warning. Keep it in a stretched or sized grid track, never `auto` or `max-content`: it is an inline-size container, so a title in an `auto` track collapses to zero width. |
| `main` | The default region. Without it, every element that has no `region` fails validate with `unknown-region`. |
| `footer` | Text in this region is exempt from `font-too-small`, and validate's `figure-source` fix places the source line there. See [Name the source region footer](#name-the-source-region-footer). |

Every built-in layout has a `title` region, and every one except `title` and `halves` has `main`. `title` uses `title`, `subtitle`, `meta`, `figure` and `footer`; `halves` uses `title`, `left`, `right` and `footer`, so every element on a `halves` slide must name its region.

## Write layout.css

Scope every selector to `.sd-canvas[data-layout="<name>"]`, so the rules cannot reach slides on other layouts. The runtime injects each layout's CSS once per page and keeps it there, and the reveal shell mounts neighbouring slides at the same time, so an unscoped rule would apply to them too.

Here is `wide-figure/layout.css` in full:

```css
/* wide-figure: a title band, one figure across the full width in `main`, and a `footer` line.
   Grid variable: --figure-inset (default 0px), extra space on the left and right of the figure. */
.sd-canvas[data-layout="wide-figure"] {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-areas: "title" "main" "footer";
  padding: var(--sd-canvas-margin) var(--sd-canvas-margin) calc(var(--sd-canvas-margin) / 2);
}
.sd-canvas[data-layout="wide-figure"] > [data-region="title"] { padding-bottom: calc(var(--sd-region-gap) * 2); }
.sd-canvas[data-layout="wide-figure"] > [data-region="main"] { padding: 0 var(--figure-inset, 0px); }
.sd-canvas[data-layout="wide-figure"] > [data-region="footer"] { padding-top: var(--sd-region-gap); }
```

### Declare the grid

Set `grid-template-columns`, `grid-template-rows` and `grid-template-areas` on the canvas. Use the region names from `schema.json` as the area names, spelled the same way. Leave out `grid-area` on the regions, since the runtime sets it inline. Use `.` for empty cells, as `statement` does (`". main ."`).

Wrap flexible tracks in `minmax(0, …)`, as `figure-notes`, `statement` and `title` do (`minmax(0, 1fr)`). `halves` wraps its rows but not its default columns (`--split` is `1fr 1fr`), and `full-bleed` uses a plain `1fr` throughout. A plain `1fr` track cannot shrink below its content, so a long word or a wide figure would push the grid past the canvas.

### Pad the canvas the way the built-ins do

Use the theme's spacing tokens rather than pixel values:

| Layout kind | Padding | Built-ins |
|---|---|---|
| With a `footer` row at the bottom | `padding: var(--sd-canvas-margin) var(--sd-canvas-margin) calc(var(--sd-canvas-margin) / 2);` on the canvas: the full margin on top and at the sides, half of it under the footer. | `title`, `figure-notes`, `statement`, `halves` |
| Without a footer | The full margin on all sides. `full-bleed` sets it on its two regions instead of the canvas: `title` gets `margin margin 0`, `main` gets `var(--sd-region-gap) margin margin`. | `full-bleed` |

In both built-in themes, `--sd-canvas-margin` is 96px and `--sd-region-gap` is 24px. All theme tokens are listed in [Themes](../reference/themes.md).

Give the title band room below it with `padding-bottom: calc(var(--sd-region-gap) * 2)`, as the built-ins with a title band above content do (`figure-notes`, `halves`). Give the footer `padding-top: var(--sd-region-gap)`, as every built-in with a footer does. Without that space, the title or the source line can touch the content, and `check` reports `text-overlap`.

### Read grid variables with their default

Write each variable as `var(--name, <default>)`, with the same default that `schema.json` declares, for example `var(--figure-inset, 0px)`. A slide that does not set the variable then gets the default, and the unit test for built-ins checks that the exact string `var(<name>, <default>)` appears in `layout.css`.

A default can be another token: `halves` declares `--gutter` with the default `var(--sd-region-gap)` and reads it as `var(--gutter, var(--sd-region-gap))`.

### Placement only: leave text and color to core and the theme

`layout.css` places things; it does not style text. Colors, fonts, weights, tracking and sizes of titles, kickers, subtitles and statements come from core's hook defaults and the theme's `theme.css`, so the layout looks right under every theme and a layout that knows nothing about themes still gets the right title, kicker and accent. Take spacing from theme tokens (`--sd-space`, `--sd-region-gap`, `--sd-canvas-margin`).

`test/unit/layout-contract.test.mjs` scans every layout's CSS (comments stripped) and rejects:
- `color`, `font`, `font-family`, `font-weight`, `font-style`, `letter-spacing`, `text-transform`, `line-height`, `text-align` and `-webkit-text-fill-color`;
- any `--sd-*` custom property (your own grid variables, such as `--figure-inset`, are fine);
- `!important`;
- `font-size`, unless it is exactly `var(--sd-…)` with no fallback.

`layouts.test.mjs` also rejects hex colors, `rgb()` and gradients. To style a role, map a region to a published hook instead (next section).

### Map regions to hooks

A hook is a class core puts on a region and on every element wrapper in it, and a theme styles it. Declare the map in `schema.json` as `hooks`: the name of a region the layout declares, to one of `subtitle`, `meta` or `statement` (`REGION_HOOKS` in [`core/constants.js`](../../engine/core/constants.js)). `title`, `kicker`, `lede` and `accent` are core's own hooks (on the title element, the kicker, the lede and the accent phrase) and cannot be mapped; `validate` reports a `layout-schema` problem for those, and for a key that is not a declared region. `title` maps `subtitle` and `meta`; `statement` maps `main` to `statement`. Core's defaults then give the region its type (for `statement`: the statement size, centred, balanced, on text and markdown only).

The element with id `title` always gets `sd-title`, the `kicker` element `sd-kicker` and the `lede` element `sd-lede`; no mapping is needed for them.

A hook class is on the region and on its wrappers, so give the layout no box properties through it, and tell theme authors the same: a theme targets the region as `.sd-region.sd-<hook>`.

### Declare the kind

Add `"kind": "cover"` to `schema.json` if the layout is a cover slide; the default is `"content"`. Core puts it on the canvas as `data-kind`, and a cover's title takes `--sd-font-size-cover`. A cover layout may have a region named exactly `figure`: while it holds an element, the title drops to the smaller `--sd-font-size-cover-figure`. This is a convention by name, so a cover layout that calls its picture region something else never gets the smaller size.

## Let a figure fill its region

A region is a column flexbox, so by default each element is only as tall as its content. Charts read their own height when they mount, so they need a region that gives them some. A layout does not have to do anything for this: `core/stepdeck.css` makes a `chart.line`, `chart.bar`, `chart.points`, `diagram`, `image`, `map` or `terminal` take the height the other elements in its region leave, in any layout. What the layout must provide is a region with a height of its own: a grid row that is `1fr` or `minmax(0, 1fr)`, as `main` is in `wide-figure`. In a row that is `auto`, as `main` is in `statement`, a chart collapses to zero height. See the [Fill rules](../reference/layouts.md#fill-rules) table.

`dump` on the scratch deck shows the result for `wide-figure` `main`, a 1728px-wide region, with and without a layout rule of its own:

| Elements in `main` | `layout.css` | Chart box from `dump` |
|---|---|---|
| the chart, with the source line in `footer` | with the `:only-child` rule | `96,218 1728×754` |
| the chart, with the source line in `footer` | without it | `96,218 1728×754` |
| the chart and the source line | without it | `96,218 1728×730` |

The `:only-child` rule is only for other components, such as a deck's own. To let one lone element of any type fill a region, add the rule for that region:

```css
.sd-canvas[data-layout="<name>"] > [data-region="<region>"] > .sd-el:only-child { flex: 1 1 0; min-height: 0; }
```

The built-ins use it for `figure-notes` `main`, both `halves` regions and the `title` `figure` region. It counts every child, so an element hidden until a later step stops it from applying.

No `validate` or `check` rule reports a collapsed chart. Check the chart's height with `dump` (see [Check it on a scratch deck](#check-it-on-a-scratch-deck)).

## Name the source region footer

`check`'s `font-too-small` rule flags visible text below the theme's `--sd-min-audience-font` (28px in both built-in themes). That token is the theme's alias of `--min-audience-font`, which is the name `check` prints. It exempts text with `role: "source"`, and every element in a region whose name is exactly `footer` ([`cli/check.js`](../../cli/check.js)). The exemption comes from the name alone: a region called `sources` or `bottom` gets none.

The scratch deck tested this with a 20px credit line set through slide `style`:

```text
# credit in region "footer"
check: 1 slide, 1 step, 0 problems

# the same element moved to region "main"
wide/credit/0 · font-too-small · 20px "Slides made with stepdeck" vs 28px (--min-audience-font) · use a larger font size; only sources (role: "source") and the footer may go smaller
check: 1 slide, 1 step, 1 problem
```

`validate`'s `figure-source` rule also reads the region list. When a slide has a figure (`chart.*`, `map`/`map.*` or `big-number`) and no `role: "source"` text, its fix suggests `region: "footer"` if the layout has one, and `region: "main"` otherwise.

## Write schema.json

`schema.json` is a descriptor of the layout, not a JSON Schema for props. `validate` checks it against [`schema/layout.schema.json`](../../engine/schema/layout.schema.json):

| Key | Required | Shape |
|---|---|---|
| `name` | yes | String matching `^[a-z0-9][a-z0-9-]*$`. Same as the folder name. |
| `description` | yes | Non-empty string. Its first sentence is the layout's `catalog` summary. |
| `regions` | yes | At least one `{ name, description }`. `name` matches `^[a-z][a-z0-9-]*$`; `description` is non-empty. List them in the order the regions should appear in the DOM. |
| `variables` | yes, may be `[]` | `{ name, default, description }` each. `name` matches `^--[a-z0-9-]+$`; `default` is a string; `description` is non-empty. |
| `hooks` | no | Region name to a published hook (see [Map regions to hooks](#map-regions-to-hooks)). |
| `kind` | no | `"content"` (default) or `"cover"`. |

No other keys are allowed at any level. Here is `wide-figure/schema.json`:

```json
{
  "name": "wide-figure",
  "description": "One figure across the full width under a title band, with a footer line for its source.",
  "regions": [
    { "name": "title", "description": "Title band across the canvas (the slide's `title` sugar goes here)." },
    { "name": "main", "description": "The figure. A chart, diagram, image or terminal takes the height the other elements leave." },
    { "name": "footer", "description": "Footer line across the canvas, typically the source (`role: \"source\"`)." }
  ],
  "variables": [
    { "name": "--figure-inset", "default": "0px", "description": "Extra space on the left and right of the figure." }
  ]
}
```

Several tools read the descriptor:

- The runtime builds one region per entry in `regions`.
- `validate` takes the region names from it for `unknown-region`.
- `catalog` shows the regions and variables to authors and agents.

Nothing checks the `regions` keys of a slide against `variables`. A slide that sets a misspelled variable such as `--figure-insets` gets no error; the layout just keeps the default. List every variable your CSS reads, with an accurate default, because the descriptor is the only place authors learn about it.

For built-ins, the unit test is stricter than the JSON Schema: variable names must match `^--[a-z-]+$` (no digits).

## Write the README and example

For a built-in, write `README.md` in the shape of the existing ones (see [`layouts/figure-notes/README.md`](../../engine/layouts/figure-notes/README.md)):

- A heading with the layout name, then one paragraph on what the layout is for.
- A table of regions (`| Region | Meaning |`) naming each region in backticks.
- A table of variables (`| Variable | Default | Meaning |`) naming each variable in backticks, with a `regions: { … }` override example.
- Notes on sizes, such as how many characters fit per line at the body size, and which regions let a figure fill them.
- `See \`example.js\`.`

`example.js` is a slide module whose default export uses the layout and only its regions. Here is the example slide for `wide-figure`, written in the same way as the built-in examples:

```js
// Example slide using the wide-figure layout: one chart across the width, its source in the footer.
export default {
  id: "wide-figure-example",
  layout: "wide-figure",
  title: "Group B overtakes Group A after 2020",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/series.csv", x: "year", y: "value", series: "group",
               axes: { x: "Year", y: "Indicator per 1,000" }, format: { x: "d", y: ",.0f" } } },
    { id: "source", region: "footer", type: "text",
      props: { role: "source", text: "Source: synthetic example data (data/make-data.mjs)." } },
  ],
};
```

Data paths in a layout example are relative to the deck that would use the slide. The unit test never loads them; it checks only the layout, the regions and the props.

## Check it

### Validate the descriptor

`validate` checks the `schema.json` of every layout in the deck's engine, whether a slide uses it or not (rule `layout-schema`). On the scratch deck, a descriptor with no `variables` key and a region renamed to `Title` gave:

```text
deck · layout-schema · layouts/wide-figure/schema.json: 'variables' missing vs required · add 'variables' in layouts/wide-figure/schema.json (see schema/layout.schema.json)
wide/title · unknown-region · region 'title' vs regions of wide-figure: Title, main, footer · set region: "Title"
validate: 4 slides, 2 errors, 0 warnings
```

The second line shows how region names reach slides: validate took the region list from the faulty descriptor, so the slide's `title` sugar no longer matched.

The rules that apply to layouts are listed below:

| Rule | Tool | Fires when |
|---|---|---|
| `layout-schema` | validate | A `layouts/<name>/schema.json` is missing or does not match `schema/layout.schema.json`. |
| `unknown-layout` | validate | A slide names a layout with no `layouts/<name>/schema.json` (exact case). The fix suggests the closest name. |
| `unknown-region` | validate | An element without a `box` names a region the descriptor does not list. |
| `text-overlap`, `text-outside-region`, `text-outside-canvas` | check | The grid leaves text overlapping other text or outside its region or the canvas. |
| `font-too-small` | check | Text below the minimum audience font, outside a `footer` region and without `role: "source"`. |
| `render-error` | check | Anything on the canvas failed, including `<slide>: layout '<name>' not found (…)` when `layout.css` or `schema.json` cannot be loaded. |

`validate` looks only for `schema.json`. A missing or misspelled `layout.css` passes validate and shows up only in the browser, as a `render-error` from `check`.

Full rule details are in [Checking a deck](../guide/checking-a-deck.md) and [skill/references/checks.md](../../skill/references/checks.md).

### Look it up in the catalog

```sh
node cli/index.js catalog wide-figure ../my-talk
```

```text
wide-figure · layout
One figure across the full width under a title band, with a footer line for its source.

regions:
  title  Title band across the canvas (the slide's `title` sugar goes here).
  main  The figure. A chart, diagram, image or terminal takes the height the other elements leave.
  footer  Footer line across the canvas, typically the source (`role: "source"`).

variables (slide `regions`):
  --figure-inset: 0px  Extra space on the left and right of the figure.
```

`catalog` lists a folder of `layouts/` as a layout only when it holds `schema.json`. Run with no name, it rewrites `<deck>/catalog/`, or `<repo>/catalog/` when run from the repository root with no deck; that folder is git-ignored. A layout and a theme with the same name give a `catalog-name` warning.

### Check it on a scratch deck

Try every new layout in a throwaway deck before you use it in a real one, or before you add it to the repository. Make the deck outside the repository and put the layout in its engine copy:

```sh
node cli/index.js new /tmp/layout-test
mkdir -p /tmp/layout-test/stepdeck/layouts/wide-figure
# write layout.css and schema.json there, save the example slide as slides/wide.js with id: "wide",
# and list "wide" in deck.js slides
node cli/index.js validate /tmp/layout-test
node cli/index.js check /tmp/layout-test --slide wide
node cli/index.js dump /tmp/layout-test --slide wide
node cli/index.js shoot /tmp/layout-test
```

`check`, `dump` and `shoot` drive Chrome through Playwright. Set `STEPDECK_PLAYWRIGHT` to a `playwright` package folder if Node cannot resolve it on its own. A slide's `id` must match its file name (rule `slide-id`), so change the example's `id` from `"wide-figure-example"` to `"wide"`; validate otherwise fails with `id 'wide-figure-example' vs 'wide' (the file name)`. The rest of the slide works as written, because the `talk` template already has `data/series.csv`. On the scratch deck the run gave:

```text
validate: 4 slides, 0 errors, 0 warnings
check: 1 slide, 1 step, 0 problems
wide · step 0 (0)
  visible  title   text        96,96 1728×74         "Group B overtakes Group A after 2020"
  visible  chart   chart.line  96,218 1728×754       "0 10 20 30 40 2016 2018 2020 2022 2024 Group B …"
  visible  source  text        96,996 1728×36        "Source: synthetic example data (data/make-data.…"
  changed: title, chart, source
```

Read the `dump` boxes against what you meant:

- The title starts at the margin (96,96).
- The chart fills the width inside the margins (1728px) and has real height (754px).
- The footer ends inside the bottom half-margin (996 + 36 = 1032, 48px above 1080).

Then look at the PNGs in `shots/960/`. Try the cases your layout has to handle: long titles, an empty optional region, and each variable overridden through the slide's `regions`.

### Run the unit tests

For a built-in layout, `test/unit/layouts.test.mjs` runs on every folder of `layouts/` and requires:

- `layout.css`, `schema.json`, `example.js` and `README.md` all present;
- `schema.json` with the keys `name`, `description`, `regions` and `variables` (and optionally `hooks` and `kind`), a `name` equal to the folder name, at least one region, and variable names matching `^--[a-z-]+$`;
- `layout.css` containing `var(<name>, <default>)` for every variable, and no hex colors, `rgb()` or gradients (`layout-contract.test.mjs` adds the placement-only scan above);
- the README naming every region and every variable in backticks;
- `example.js` importing in plain Node, using this layout and only its regions, with props that validate against each component's schema.

`test/unit/schemas.test.mjs` also validates every descriptor against `schema/layout.schema.json`. A built-in layout also needs a slide in the gallery deck: add its name to `LAYOUTS` in `site/gallery/deck.js` (in folder order) and a file `site/gallery/slides/<name>-example.js` that re-exports `example.js` with a `notes` line naming the layout's README, as the others do. `test/unit/gallery.test.mjs` fails until it exists. Run `npm test`.

For geometry that only a browser can see, add slides to the fixture deck `test/fixtures/decks/layouts-kit/` and assertions to `test/browser/layouts-kit.test.mjs`. That file already measures region and element boxes for `statement`, `halves` and the `title` figure column. See [Testing](testing.md).

## Finish a built-in layout

Adding a layout to the repository is not done until:

- `node cli/index.js validate examples/kit` and `node cli/index.js check examples/kit --played` are still clean (see the [development loop](index.md#development-loop));
- `npm test` passes, and `npm run test:browser` passes if you added browser tests;
- the [Layouts reference](../reference/layouts.md) lists the layout, its regions, variables and fill regions, and [Using layouts and themes](../guide/layouts-and-themes.md) says when to pick it;
- [skill/references/themes-layouts.md](../../skill/references/themes-layouts.md) describes it for agents, and any list of layout names in the skill (such as the `unknown-layout` row of [skill/references/checks.md](../../skill/references/checks.md)) includes it.

Existing decks made by `new` keep their own copy of `layouts/` and do not get the new layout until it is copied into their `stepdeck/` folder.
