# Components, bindings and data

## Look components up in the catalog

The catalog is the single source for props. This page never repeats the props tables.

```sh
node "$STEPDECK/cli/index.js" catalog my-talk                  # writes my-talk/catalog/index.json and one <name>.json each
node "$STEPDECK/cli/index.js" catalog chart.line my-talk       # one entry, readable
node "$STEPDECK/cli/index.js" catalog chart.line my-talk --json  # the full entry, README included
```

The two files the catalog writes:
- **`catalog/index.json`** has one line per component, layout and theme: `kind`, `name`, a one-sentence `summary`, `animates` (the props whose change animates) and `enter`: `own` when the component builds its own entrance (charts draw, lists build, big numbers count up), `box` when its box moves in with the theme's motion.
- **`catalog/<name>.json`**, or `catalog <name> --json`, adds:
  - `props`: each prop's `required`, `x-transition`, `description`, `examples`, `default` and JSON `schema`;
  - the component's `readme`, which holds the behaviour notes and file shapes;
  - an `example` slide path, relative to the engine and so at `my-talk/stepdeck/<example>`.

Run `catalog` again after adding a custom component; it then lists that component with `origin: "deck"`.

Only the components in the catalog exist. `mark`, `callout`, `table` and the like are not there yet. If you need something the catalog lacks, write a [custom component](custom-components.md).

## The built-ins, in one paragraph each

**`text`.** One paragraph of plain text. Its `role` sets the type:
- `body` (40px, the default);
- `note` (32px, muted), for side notes;
- `label`;
- `source` (28px, muted), for the source line every figure slide needs;
- `lede` (36px in `modern`, muted), the message line under the title: write the slide's `lede` key rather than an element;
- `badge` (28px, an uppercase pill), with an optional `tone`: the index of its colour in the categorical palette. Every tone passes the 4.5:1 text contrast: the border takes the palette colour, and the text the same colour darkened until it reads. Pick the tone for its meaning, such as the colour of the series it names.

The element with id `title` is styled as the slide title. When it appears its box moves in (the theme's entrance); when its `text` changes while it stays on screen, it crossfades (the title, the `lede` and badges too). Bindings inside `text` are resolved. `{{color:…}}` words are **not** resolved in `text`; use `markdown` for them.

**`markdown`.**
- What it renders: paragraphs, headings, lists, emphasis, code and links (relative links only; validate rejects remote URLs).
- Raw HTML is shown as text.
- `{{color:accent}}` becomes the palette's name for that role in the deck language ("blue" in `en`, "azul" in `es`). An unknown role is an element error shown on the slide.
- Use it for any text that mixes emphasis or lists.

**`chart.line`.** One or more series over a numeric x, read from a CSV with one row per series and x.
- **Labels.** Each line is labelled directly at its end; there is no legend.
- **Colors.** Series take palette colors in order of first appearance in the CSV, at every step. A series keeps its color when others appear or leave, so the CSV order decides the colors of the final, full chart. A series shown alone at the first step may not be the accent color. Put the series that should carry the accent first in the CSV.
- **The y axis.** It covers every series (not only the shown ones) and includes 0, so it does not jump when a series appears.
- **Typical builds:**
  - `series_shown` grows, and new series draw in;
  - `annotate` adds vertical rules with labels;
  - `highlight` dims the others to a neutral grey (opacity stays 1, labels turn muted), set with `only` so it lasts one step, or with `set` to move the focus step by step;
  - changing `y` morphs the lines to another column;
  - `until` sweeps the lines along the x axis, cut exactly at that x (the axis never moves), with `ticker: true` for a large counting label of the x; `ticker` without `until` does nothing, and `validate` warns.
- **Year axes.** Use `format: { x: "d" }` so years print as `2020`, not `2,020`.
- **The `axes` prop is required.** It gives the axis titles.

**`big-number`.** One large figure (128px), with an optional label, `ci` (95% interval), `prefix` and `suffix`.
- **Binding.** Bind `value` with **no format**: `"{{data/summary.json#/total}}"` resolves to the raw number. Put the d3 format in the separate `format` prop, which is required.
- **Count-up.** In an animated step it counts up: from 0 when it appears (its own entrance), from the old value when `value` changes.
- **Source line.** It counts as a figure: the slide needs a `role: "source"` element.

**`terminal`.** A terminal window that replays a recorded session from a JSON `script` file (`title`, `command`, `tasks`, `events`). A complete example script is in `catalog terminal --json`, in the `readme` field. A new deck has no session file, so create one in `data/`.

**What the events show:**
- **Every event is one log line, task and file events included.** For example, `{ "type": "task", "index": 0, "status": "done" }` prints the line `task  Check the data: done`.
- **Markers.** `note`, `read`, `run`, `result` (shown as `out`), `error` and `code` show their `text`.
- **Files.** `file` events also fill the Files list.
- **Tasks.**
  - `task` events set a task's status in the Tasks list: `[ ]` pending, `[~]` active, `[x]` done.
  - The list shows the last **shown** status, and a task that no shown event names stays `[ ]`.
  - For every box to be ticked at the end, emit a `done` event for each task within the events shown at the last step. `active` first is optional.
- **Plan the log.** Task events cost log lines, so emit them only when a status changes.

**Stepping:**
- **`shown` per step.** The slide drives `shown`, the number of events visible, with `advance`: `values: [0, 4, 8, 11]` means four steps.
- **The first step.** `shown: 0` is an empty prompt, a deliberate "before" state. Start above 0 to open on activity. Either way `step0-shows-all` does not fire, because `shown` changes.
- **Scrolling.** Only the newest lines that fit stay visible, and lines never wrap (long text is cut with an ellipsis), so keep event text short.
- **Typing.** With `typing: true`, the command is typed out only in an animated step that takes `shown` from 0 to above 0. Otherwise it appears whole.

## The slide-kit components

Each paragraph says what the piece is for and how a step drives it. The props are in `catalog <name>`, and every piece has a recipe in the [cookbook](cookbook.md). The recipes come from `examples/kit` in the stepdeck repository, a deck that shows all of them building step by step.

**What they share:**
- State props (`shown`, `done`, `active`, `progress`, `current`, `highlight`) are set per step with `advance` or `set`. The component renders them and never reads the step.
- `list`, `diagram`, `chart.bar`, `chart.points`, `chat` and `timeline` build their own entrance (`enter: own`): when the element appears on a forward step, it plays its build from nothing to that step's state (items rise in turn, nodes pop in and edges draw, bars grow, dots grow out of the reference line, the track fills). Item motions use the shared names and the theme's timing.
- Hidden parts keep their space, so nothing reflows when a part appears.
- Going backward undoes a step: a tick comes off, a fill retracts, a node hides, a bar shrinks back.
- Author text (`text`, `label`, `sub`) is inline Markdown and wraps inside its box. Two labels are plain text instead: a diagram edge `label` and a chat message `label`. Every piece of audience text is at least 28px, so trim long labels rather than shrink them.
- An unknown id, category or column is an element error that names it.

**`list`** (`catalog list`). Numbered, lettered, bulleted or checklist items.
- `marker` is `number`, `letter` (always a, b, c, also in Spanish), `bullet` or `check`.
- `shown` reveals items one by one, and `done` ticks a checklist, by count or by ids.
- `active` emphasises one item and dims the rest. `rule: true` draws an accent rule on the left.

**`diagram`** (`catalog diagram`). Nodes, arrows and nested groups on an explicit grid.
- Each node sits in a cell (`col`, `row`, 0-based). Its `shape` is `box`, `pill`, `circle` or `text`.
- An edge's id is its `id`, else `"<from>-><to>"`. Its `label` sits beside the arrow.
- A group's `contains` lists node and group ids, so groups nest. A group's box covers all its members, shown or not, so it never resizes between steps.
- `shown` lists the visible ids, edges included. An edge is visible only when its id is listed. `highlight` dims everything else: outlines and lines turn a neutral grey, labels turn muted.
- A diagram takes the height the other elements in its region leave, so a source line can share the region.

**`chart.bar`** (`catalog chart.bar`). Horizontal or vertical bars from a CSV, one row per category, each with its value at the end of the bar.
- Switching `y` between columns grows or shrinks the bars. Set an explicit `domain: [min, max]` then, so the axis stays put and the change is visible.
- `interval` adds a whisker from a lower to an upper column.
- `shown` brings categories in one by one; hidden ones keep their band. `highlight` dims the other bars to a neutral grey.
- `sort` orders the bands: `"value"` (lowest first), `"-value"` (highest first), `{ by: "<column>", order }` or a list of categories first. Hidden bars keep their place, empty values come last, and changing it on a step slides every bar, with its label and whisker, to its new band.
- It counts as a figure, so the slide needs a `role: "source"` line.
- A chart fills the room its region leaves, so a source line may share the region (in `full-bleed` it goes in `main`, under the chart). In `figure-notes` and `halves` it can go in `footer`. In `statement` `main` the region has no set height and the chart collapses.

**`chart.points`** (`catalog chart.points`). Estimates from a CSV, one row per category: a dot, an optional interval whisker and the value beside it.
- `interval` adds the whisker; `reference` (a number, or `{ value, label }`) draws a dashed line across every row, such as an average.
- `from` (a column) makes each row a before and after pair: a hollow dot at `from`, a quiet connector and the filled dot at `y`. Put `y: "before"` on one step and `y: "now", from: "before"` on the next: the dots slide while the connectors grow. An empty `from` shows the end dot alone.
- The value axis covers `y`, `from`, the interval columns and `reference` of every step of the slide, so switching `y` moves the dots and never the axis. Set `domain` only to fix the range yourself; an estimate outside it is an element error.
- `shown` brings rows in one by one, each growing out of the reference line; hidden rows keep their place. `highlight` dims the other rows; use `only` so it lasts one step.
- `sort` orders the rows: `"value"` (lowest first), `"-value"` (highest first), `{ by: "<column>", order }` or a list of categories first. Hidden rows keep their place, empty values come last, and changing it on a step slides every row to its new place.
- An empty `y` cell shows "no data" (`sin datos` in Spanish) beside the label, never a dot at zero.
- `id` (a column) turns it into strips: one row per point, each category a beeswarm strip with a summary tick (`summary`: `"median"`, `"mean"` or `"none"`). `focus: "<id>"` rings that item in every strip, joins it with a line and dims the rest; `sort` ranks strips by their summary. With `domain`, points outside it are not drawn and a box at that end counts them.
- It counts as a figure, so the slide needs a `role: "source"` line. It fills the room its region leaves, like `chart.bar`.

**`chat`** (`catalog chat`). An exchange as bubbles, or a prompt or quote as a bordered card.
- `style: "bubbles"` puts `user` on the right and `agent` and `note` on the left. `style: "card"` gives full-width cards with the label on top.
- `shown` reveals messages one by one. `typing: true` types the newest message on a forward step; jumping or going backward shows it whole.

**`timeline`** (`catalog timeline`). A track between stops that fills.
- `progress` (0 to 1) says how far the fill has gone, and a stop lights up once the fill passes it.
- `current` emphasises one stop. `dashed` draws the unfilled track dashed.
- It is only as tall as its stops and labels, so it suits a `statement` slide with a short lead line, or a `full-bleed` slide with text above it.

**`image`** (`catalog image`). A local image with required `alt` text, an optional `caption` and a `fit` mode.
- The usual home is the `figure` region of a `title` cover.
- `src` is relative to the deck root, under `assets/`. Remote URLs, paths that leave the deck and paths with `%` are refused.
- The image finishes loading before the step settles. A missing file is an element error naming the path.

## Bindings: `{{path#/pointer | format}}`

Any string prop, at any depth (inside arrays and objects too), can bind to a data file:

| Written | Result |
|---|---|
| `"{{data/summary.json#/total}}"`, the whole string with no format | the **raw value**: a number, array or object |
| `"{{data/summary.json#/total \| ,.0f}}"`, the whole string with a format | a **string** (`"53,265"`) |
| `"About {{data/summary.json#/share \| .0%}} of cases"`, embedded in text | a string; an embedded object or array is an error |

- **`path`** is relative to the deck root and must match the case on disk. It can name `.json`, `.geojson` or `.csv`.
- **`pointer`** is an RFC 6901 JSON pointer. `#` alone is the whole file; `#/rows/0/value` is the `value` of the first row. A CSV loads as an array of row objects.
- **`format`** is a d3-format specifier, localized by the deck's `lang`. `es` uses the decimal comma and the period for thousands: `,.0f` gives `53.265`.
- **What validate checks.** The file, the pointer and the format must exist. A wrong pointer lists the keys that are there.
- **Prefer JSON for bound figures.** A binding cannot declare CSV column types.
- **Types in CSVs.** An undeclared CSV column becomes a number only when every non-empty value is a plain decimal with no leading zero, so the code `080101` stays a string. Declare types where a component offers it (`chart.line` `types`).
- **Read-only data.** Loaded data is cached and shared by every element.

**No figure is ever typed by hand.**
- Every number on a slide comes from a data file, either through a binding or as a chart column.
- Generate the data with a script in the deck, such as `data/make-data.mjs`, and check the script in.
- A `chart.*` or `big-number` slide without a `role: "source"` element fails validate (`figure-source`).

## Files, paths and URLs

- Every path in props is relative to the deck root (`data/…`, `assets/…`) and case-exact. Validate checks this against the file listing, so it also catches case errors on macOS.
- Any string prop that looks like a deck file is checked to exist. That is a whitespace-free string ending in `.json`, `.csv`, `.png` or another data, image or media extension.
- No remote URLs (`http://`, `https://`, `//host`): a talk must run offline, so copy the file into `assets/`.
- No hex colors in props. Colors come from the theme. In text, name colors with `{{color:role}}` (markdown).
