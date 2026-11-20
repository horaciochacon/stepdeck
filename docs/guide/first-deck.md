# Your first deck

This page walks you through a small deck written by hand, from an empty folder to a deck that passes `validate` and `check`. It covers `deck.js`, slide files, layouts and regions, elements, a chart with a source line, steps, speaker notes, boxed elements and per-slide style. It shows how each piece works; every key is listed in [Deck and slide reference](../reference/deck-and-slide.md).

If you work with an agent, the agent follows the [stepdeck skill](../../skill/SKILL.md) instead. This page is for people writing slides themselves.

The deck you build has four slides:

| Slide | Layout | Shows |
|---|---|---|
| `cover` | `title` | Title, subtitle, author line |
| `question` | `statement` | One sentence |
| `trend` | `figure-notes` | A line chart that builds over four steps, with notes and a source line |
| `compare` | `halves` | Two columns, a boxed label, slide style and a region override |

Every slide below, including the first, step-less version of `trend`, was run through `validate` and `check`; the finished deck passes `check --played` too.

## Start a deck

In the commands on this page, `/path/to/stepdeck` is your clone of the engine repo; run `npm install` there first. Create the deck folder with `new`. It copies the `talk` template and a copy of the engine into `my-talk/stepdeck/`, which the browser commands need.

```sh
node /path/to/stepdeck/cli/index.js new my-talk
```

The template ships three slides (`title`, `chart`, `closing`) and a data script, `data/make-data.mjs`, which wrote `data/series.csv` and `data/summary.json`. This walkthrough replaces the slides and keeps `data/series.csv`, whose columns are `year,group,value`:

```csv
year,group,value
2015,Group B,22
2015,Group A,24
...
```

Delete the three files in `slides/` before you start.

## Write deck.js

`deck.js` holds the deck settings and the ordered list of slides. It is plain data: it must import in Node, so no DOM, no `fetch` and no top-level `await`.

```js
export default {
  title: "My first deck",
  lang: "en",
  theme: "modern",
  slides: ["cover", "question", "trend", "compare"],
};
```

| Key | Required | What it does |
|---|---|---|
| `title` | yes | Deck metadata. The engine never reads it; it does not set the page title or appear on a slide. |
| `slides` | yes | Slide ids in show order, at least one, no duplicates. |
| `lang` | no | Language for number formats and built-in labels. `en` and `es` are built in; the default is `en`. |
| `theme` | no | Theme folder name. The built-in themes are `modern` (the default) and `academic-light`. |
| `palette` | no | Another palette from the theme, by name. |
| `components` | no | Deck components in `components/<name>/` (see `new-component`). |

Each slide id must match `^[A-Za-z0-9][A-Za-z0-9_-]*$` and names a file: the id `trend` loads `slides/trend.js`. That file's default export must have `id: "trend"`. Otherwise the slide shows an error such as `trend: cannot load slide: slide file exports id 'x', expected 'trend'`.

## Write a slide file

A slide file default-exports one object. Here is the cover:

```js
// slides/cover.js
export default {
  id: "cover",
  layout: "title",
  title: "My first deck",
  elements: [
    { id: "subtitle", region: "subtitle", type: "text", props: { text: "Two groups, ten years, one turning point" } },
    { id: "meta", region: "meta", type: "text", props: { text: "A. Speaker · Example Institute · 2026" } },
    { id: "footer", region: "footer", type: "text", props: { role: "source", text: "All data in this deck is synthetic." } },
  ],
};
```

- **`id`** (required) equals the file name.
- **`layout`** picks the grid. Leave it out and you get `full-bleed`.
- **`title`** is shorthand. A string title becomes a `text` element with id `title` in the region `title`, placed before the other elements. If one of your elements already has the id `title`, the shorthand is skipped and your element is used instead.
- **`elements`** (required) are drawn in the order listed. Each has an `id`, a `type` (`text`, `markdown` or a component such as `chart.line`) and `props` for that component. Elements in the same region stack top to bottom.
- **`region`** names the layout region an element goes into. The default is `main`. A region the layout does not have is an `unknown-region` error.
- **`notes`** holds speaker notes for every step that has none of its own.

The second slide shows the defaults at work. It has no title, and its one element has no `region`, so it lands in `main`:

```js
// slides/question.js
export default {
  id: "question",
  layout: "statement",
  elements: [
    { id: "claim", type: "markdown", props: { md: "When did **Group B** overtake **Group A**?" } },
  ],
  notes: "Pause here and let the audience guess.",
};
```

To see what a component accepts, run `catalog <name> my-talk`, for example `catalog chart.line my-talk`.

## Choose a layout

| Layout | Use it for | Regions |
|---|---|---|
| `title` | A cover or a closing slide | `title`, `subtitle`, `meta`, `figure`, `footer` |
| `statement` | One large sentence or question | `title`, `main`, `footer` |
| `halves` | Two things side by side | `title`, `left`, `right`, `footer` |
| `figure-notes` | A figure with notes beside it | `title`, `main`, `notes`, `footer` |
| `full-bleed` (default) | Content across the full width | `title`, `main` |

Grid variables and full descriptions are in [Layouts](../reference/layouts.md).

> **A chart fills the room its region leaves.** A `chart.line` or `chart.bar` takes the height the other elements in its region do not use, so a source line beside it is fine. The exception is `statement` `main`, which has no set height and leaves the chart none. No rule checks chart height, so look at a shot if a chart looks wrong. See [Layouts and themes](layouts-and-themes.md#give-figures-room).

## Add a figure with a source line

The third slide puts a line chart alone in `main` of `figure-notes`, text in `notes`, and the source line in `footer`:

```js
// slides/trend.js (first version, no steps yet)
export default {
  id: "trend",
  layout: "figure-notes",
  title: "Group B overtakes Group A after 2020",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/series.csv", x: "year", y: "value", series: "group",
               axes: { x: "Year", y: "Indicator per 1,000" },
               format: { x: "d", y: ",.0f" } } },
    { id: "lead", region: "notes", type: "text", props: { text: "Group A grows slowly." } },
    { id: "source", region: "footer", type: "text",
      props: { role: "source", text: "Source: synthetic example data (data/make-data.mjs)." } },
  ],
};
```

- `data` is a path relative to the deck folder. `x`, `y` and `series` are column names in the CSV; `validate` checks them against the header (`missing-column`).
- `chart.line` requires `data`, `x`, `y` and `axes`.
- The `source` element is required. Any slide with a `chart.*` or `big-number` element needs an element with `props.role: "source"`, or `validate` reports `figure-source`. Source text is exempt from the minimum font size, and so is everything in a `footer` region.

Keep figures in data files written by a script, such as `data/make-data.mjs`, rather than typing numbers into slides.

## Add steps

A slide without `steps` has one state. With `steps`, it has one state per step, and each step changes what the previous one showed. Here is the finished `trend` slide:

```js
// slides/trend.js
export default {
  id: "trend",
  layout: "figure-notes",
  title: "Group B overtakes Group A after 2020",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/series.csv", x: "year", y: "value", series: "group",
               series_shown: ["Group A"],
               axes: { x: "Year", y: "Indicator per 1,000" },
               format: { x: "d", y: ",.0f" } } },
    { id: "lead", region: "notes", type: "text", props: { text: "Group A grows slowly." } },
    { id: "turn", region: "notes", type: "text", from: "mark",
      props: { role: "note", text: "From 2020 on, Group B rises three times faster than before." } },
    { id: "source", region: "footer", type: "text",
      props: { role: "source", text: "Source: synthetic example data (data/make-data.mjs)." } },
  ],
  steps: [
    { id: "base", notes: "Start with one series." },
    { id: "compare", set: { chart: { series_shown: ["Group A", "Group B"] } },
      notes: "Now add Group B." },
    { id: "mark", set: { chart: { annotate: [{ x: 2020, label: "2020" }] } } },
    { id: "focus", only: { chart: { highlight: "Group B" } }, notes: "Land on Group B." },
  ],
};
```

What each piece does:

| Piece | Effect in this slide |
|---|---|
| `props` on the element | The state at the first step: only Group A is drawn. |
| `set` | Merges a patch into an element's props, and the change carries forward to later steps. `compare` adds Group B; `mark` adds an annotation at 2020. A `null` value in a patch removes that prop. |
| `from: "mark"` | The `turn` note is hidden before step `mark` and visible from it on. Hidden elements keep their space, so nothing moves when they appear; add `collapse: true` to take no space until then. |
| `at: [...]` | Visible only at the listed steps (used on the next slide). If an element has both `from` and `at`, `from` wins. |
| `only` | A patch for that step alone; it does not carry forward. `focus` highlights Group B. |
| `notes` | Speaker notes for that step. A step without notes uses the slide's `notes`, if any. |

**Step ids.** Give every step an id and refer to steps by id in `from`, `at`, `--step` and URLs. An id must not be digits only: `"1"` would be confused with step number 1, and `validate` reports `step-id-numeric`.

**Order inside one step:** `replace`, then `set`, then `show`, then `hide`. The [step model guide](step-model.md) covers `replace`, `show`, `hide`, `advance`, transitions and how jumping to a step gives the same result as playing up to it.

## Position an element with a box

The last slide uses the `halves` layout and one element that sits outside the grid:

```js
// slides/compare.js
export default {
  id: "compare",
  layout: "halves",
  title: "Before and after 2020",
  regions: { "--align": "center" },
  style: ":scope { --sd-region-gap: 40px; }",
  elements: [
    { id: "before", region: "left", type: "text", props: { text: "Before 2020: the groups move together." } },
    { id: "after", region: "right", type: "text", from: "after",
      props: { text: "After 2020: Group B pulls ahead." } },
    { id: "badge", type: "text", box: { x: 1440, y: 900, w: 400, h: 60 }, at: ["after"],
      props: { role: "label", text: "Synthetic data" } },
  ],
  steps: [{ id: "before" }, { id: "after" }],
};
```

`box: { x, y, w, h }` places an element at a fixed position on the 1920x1080 canvas, in canvas pixels, whatever the window size. Give all four values; `w` and `h` must be greater than 0.

- A boxed element floats above the regions. It is drawn after them, so it covers anything underneath.
- A boxed element is not placed in a region, so `text-outside-region` skips it, and `unknown-region` skips it too when it names no `region`. It still counts for `text-overlap`, `text-outside-canvas`, `font-too-small` and `contrast` in `check`.

Use boxes sparingly; regions keep a slide in line with the rest of the deck.

## Adjust one slide: style and regions

Two keys change the look of a single slide.

**`regions`** overrides the layout's grid variables for this slide. Only keys that start with `--` are allowed (`--align`, `--split`, `--notes-width` and so on; [Layouts](../reference/layouts.md) lists each layout's variables). In `compare`, `"--align": "center"` centres short content in both halves. A misspelled variable name is accepted and silently has no effect, so check the name in the layout reference.

**`style`** is CSS scoped to the slide:
- Every selector is prefixed with the slide, so the rules cannot affect other slides.
- A selector that starts with `:scope` or `&` targets the slide's canvas itself. `:scope { --sd-region-gap: 40px; }` overrides a theme token for this slide only.
- `@media` and `@supports` blocks are scoped too.
- `@import` is not allowed (`style-import`), and neither are remote URLs (`remote-url`). Copy an asset into the deck, for example `assets/`, and use a relative `url()`.

Never use `style` to shrink text below the minimum audience font size (28px on the canvas); `check` reports it as `font-too-small`.

## Check the deck

Run `validate` first, then `check`, then `check --played`:

```sh
node /path/to/stepdeck/cli/index.js validate my-talk
STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node /path/to/stepdeck/cli/index.js check my-talk
STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node /path/to/stepdeck/cli/index.js check my-talk --played
```

| Command | Runs in | Checks |
|---|---|---|
| `validate` | Node | Deck and slide schemas, props at every step, data files and columns, paths, `figure-source` |
| `check` | Chrome, via Playwright | Layout of every step: text outside the canvas or its region, overlaps, font size, contrast, render and console errors |
| `check --played` | Chrome | Also compares each step reached by playing forward or back against the same step jumped to directly |

`validate` needs the engine repo's dependencies (`npm install` there). `check`, `dump` and `shoot` need Playwright: set `STEPDECK_PLAYWRIGHT` to a `playwright` package folder or install it where Node can find it. They use the system Chrome.

A clean run of this deck prints one summary line per command (`validate`, `check`, `check --played`):

```text
validate: 4 slides, 0 errors, 0 warnings
check: 4 slides, 8 steps, 0 problems
check: 4 slides, 8 steps, 8 played arrivals compared, 0 problems
```

Each problem is one line in the form `slide/element/step · rule · measured vs limit · fix`. If you remove the source line from `trend` and rename its first step to `"1"`, `validate` prints:

```text
trend/1 · step-id-numeric · step id '1' vs not digits only (digits mean a step number) · rename step '1' to a word, e.g. 'step-1', and update its references
trend/chart · figure-source · chart (chart.line) without a source vs an element with role: "source" · add { id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: …" } }
validate: 4 slides, 2 errors, 0 warnings
```

Read each line left to right: where the problem is (`trend/chart`), which rule fired (`figure-source`), what was found against what is allowed, and the suggested fix. Exit codes: `0` clean (warnings alone still exit 0 for `validate`), `1` problems found, `2` a usage error or a run that could not finish. Add `--slide <id>` to check one slide, and `--json` for machine-readable output. The full rule list is in [checks](../../skill/references/checks.md).

To present the deck, run `serve my-talk` and open the URL it prints. `shoot my-talk` writes a PNG per step to `shots/960/` so you can look at every state.

## Learn from the examples

Two decks in the repo are clean baselines: both pass `validate`, `check` and `check --played` with no problems.

- [`examples/kit`](../../examples/kit/) uses all five layouts and the slide-kit components (`chart.bar`, `list`, `diagram`, `chat`, `timeline`, `image`). Most build step by step; `image` sits on the step-less cover. `slides/estimate.js` is a `chart.bar` with interval whiskers; `slides/question.js` is a `statement` slide.
- [`examples/spike`](../../examples/spike/) covers the first components (`chart.line`, `big-number`, `terminal`) and a deck component, `demo.story`.

Their `index.html` maps the engine to the repo's `engine/` folder (`"stepdeck/": "../../engine/"`) instead of a copied `./stepdeck/`, so they run from inside the repo; copy slide files from them, not the whole folder. The [cookbook](../../skill/references/cookbook.md) has more complete slides.

Do not copy a component's `example.js` (for example `components/chart.line/example.js`) as a slide unchanged. Those files show one component's props and are not complete, valid slides: some have no source line, and some point to data files that are not in your deck.
