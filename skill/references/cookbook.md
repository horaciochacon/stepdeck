# Cookbook

These are complete slide specs. Each one passes `validate`, `check` and `check --played` in a deck made with `new`.

To use one:
1. Save it as `slides/<id>.js`, where `<id>` is the spec's `id`.
2. Add the id to `slides` in `deck.js`.
3. Create the data files it names.

Data files below are shown as their contents. In a real deck, a script such as `data/make-data.mjs` generates them, so no figure is typed by hand.

## A cover

On the `title` layout, with no steps. `section` is the kicker above the title, and `*…*` in the title is the accent phrase.

```js
export default {
  id: "cover",
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

## Text that appears step by step

`reveal` keeps its space while hidden, so nothing moves when it appears. `aside` collapses until its step, so the source line moves down at that step.

```js
export default {
  id: "hello",
  layout: "full-bleed",
  title: "Hello, stepdeck",
  elements: [
    { id: "lead", region: "main", type: "text", props: { text: "Slides are data: a layout, elements and steps." } },
    { id: "reveal", region: "main", type: "text", from: "two", props: { text: "This paragraph appears at step two; its space was reserved." } },
    { id: "aside", region: "main", type: "text", from: "two", collapse: true, props: { role: "note", text: "This note takes no space until it appears." } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Source: synthetic example." } },
  ],
  steps: [{ id: "one" }, { id: "two" }],
};
```

## A line chart that builds in four steps, with a note and a big number

The chart sits in `main` and the notes beside it. The source line in `footer` is required, because the slide has a figure.
- The data is `data/series.csv`, with columns `year,group,value` and one row per group and year.
- `data/summary.json` is `{ "latest_a": 33.9, "latest_b": 37.3 }`.

Both come with the `talk` template (`data/make-data.mjs` writes them).

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

Variations:
- **Morph to another column.** Add a step `{ id: "rate", set: { chart: { y: "rate", axes: { y: "Rate" } } } }`; the CSV needs a `rate` column. The lines morph and the axis rescales.
- **An interval band.** `interval: { lower: "value_lo", upper: "value_hi" }`, with those columns in the CSV.
- **A wider notes column.** Slide-level `regions: { "--notes-width": "700px" }`.

## A terminal session over four steps

`advance` sets `shown`, the number of visible events, at each step; the last value holds after that. The slide never patches the terminal's content.

`data/session.json`:

```json
{
  "title": "Agent session",
  "command": "assistant \"summarize survey.csv\"",
  "tasks": ["Check the data", "Summarize", "Write the report"],
  "events": [
    { "type": "note", "text": "Goal: a short summary of the survey." },
    { "type": "task", "index": 0, "status": "active" },
    { "type": "read", "text": "data/survey.csv" },
    { "type": "result", "text": "1,204 rows, 12 columns" },
    { "type": "task", "index": 0, "status": "done" },
    { "type": "task", "index": 1, "status": "active" },
    { "type": "run", "text": "python summarize.py" },
    { "type": "result", "text": "summary table written" },
    { "type": "task", "index": 1, "status": "done" },
    { "type": "file", "text": "report.md", "status": "created" },
    { "type": "task", "index": 2, "status": "done" }
  ]
}
```

```js
export default {
  id: "session",
  layout: "full-bleed",
  title: "An agent works through a task",
  elements: [
    { id: "term", region: "main", type: "terminal",
      props: { script: "data/session.json", shown: 0, typing: true },
      advance: { prop: "shown", values: [0, 4, 9, 11], start: "open" } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic agent session." } },
  ],
  steps: [{ id: "open" }, { id: "inspect" }, { id: "work" }, { id: "done" }],
};
```

A terminal is not a figure, so the source line is optional here; the recipe keeps it anyway.

## Markdown with a color word and a title that changes

`{{color:accent}}` reads "blue" in an `en` deck and "azul" in an `es` deck. The title is the element `title`, so a step can `set` its text.

```js
export default {
  id: "notes",
  layout: "full-bleed",
  title: "Three things to remember",
  elements: [
    { id: "lead", region: "main", type: "markdown",
      props: { md: "- Figures in **{{color:accent}}** are the ones to remember.\n- Every figure comes from a data file.\n- Steps are patches, not slides." } },
    { id: "more", region: "main", type: "markdown", from: "more",
      props: { md: "And one more: *ids*, not numbers, for steps." } },
  ],
  steps: [
    { id: "start" },
    { id: "more", set: { title: { text: "Four things to remember" } } },
  ],
};
```

## A headline figure with an interval, floating in a box

`data/headline.json`, generated:

```json
{ "share": 0.274, "share_ci": [0.251, 0.298] }
```

```js
export default {
  id: "headline",
  layout: "full-bleed",
  title: "One in four",
  elements: [
    { id: "lead", region: "main", type: "text",
      props: { text: "Share of respondents who reported the outcome: {{data/headline.json#/share | .0%}}." } },
    { id: "big", type: "big-number", from: "figure",
      box: { x: 96, y: 420, w: 900, h: 400 },
      props: { value: "{{data/headline.json#/share}}", format: ".1%",
               ci: "{{data/headline.json#/share_ci}}", label: "reported the outcome" } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Source: synthetic survey data." } },
  ],
  steps: [{ id: "intro" }, { id: "figure" }],
};
```

`value` and `ci` are whole-string bindings with no format, so they resolve to a number and an array. The `.0%` binding inside the `lead` text is formatted.

## The slide kit

These recipes are copied from `examples/kit` in the stepdeck repository. Each passes `validate`, `check` and `check --played`; the data files are shown as their contents and come from a `data/make-data.mjs` script in the kit deck.

### A cover with an image

On the `title` layout, an element in the `figure` region switches the cover to two columns: the title column on the left, the figure on the right (`--figure-width`, 720px by default). Put any SVG or PNG in `assets/`; `alt` is required.

```js
export default {
  id: "cover",
  layout: "title",
  section: "Slide kit",
  title: "Analysing data with *an agent*",
  elements: [
    { id: "subtitle", region: "subtitle", type: "text", props: { text: "A slide kit, built step by step" } },
    { id: "meta", region: "meta", type: "text", props: { text: "A. Speaker · Example Institute · 2026" } },
    { id: "figure", region: "figure", type: "image",
      props: { src: "assets/cover.svg", alt: "A chat prompt and an agent's reply above a bar chart whose bars get shorter" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "All content in this deck is synthetic." } },
  ],
};
```

### A statement with two bold terms

The `statement` layout centres one sentence in the statement size (`--sd-font-size-statement`). Use `markdown` for the bold terms; `text` has no emphasis. The title is optional.

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

### A diagram with a labelled arrow, in three steps

When `shown` is set, an edge is visible only when its id is listed. This edge has an explicit `id`; without one it would be `"exposure->outcome"`. The outcome's label is deliberately long: labels wrap inside their box.

```js
export default {
  id: "concept",
  layout: "full-bleed",
  title: "The idea in one arrow",
  elements: [
    { id: "idea", region: "main", type: "diagram",
      props: {
        cols: 3, rows: 1,
        nodes: [
          { id: "exposure", label: "Exposure", sub: "how much, how long", shape: "box", col: 0, row: 0 },
          { id: "outcome", label: "Outcome measured a year later in the same people", sub: "cases per 100", shape: "box", col: 2, row: 0 },
        ],
        edges: [{ id: "link", from: "exposure", to: "outcome", label: "raises the risk of" }],
        shown: ["exposure"],
      } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic concept diagram." } },
  ],
  steps: [
    { id: "exposure" },
    { id: "outcome", set: { idea: { shown: ["exposure", "outcome"] } } },
    { id: "link", set: { idea: { shown: ["exposure", "outcome", "link"] } } },
  ],
};
```

### Nested groups, in four steps

Each group's box covers all its members, shown or not, so the outer boxes are drawn at full size from the first step and never resize. Edges are named by their default ids.

```js
const pills = ["read", "run", "edit"];
const files = ["data", "scripts", "report"];
const arrows = ["read->data", "run->scripts", "edit->report"];
export default {
  id: "sandbox",
  layout: "full-bleed",
  title: "Where the agent works",
  elements: [
    { id: "nest", region: "main", type: "diagram",
      props: {
        cols: 2, rows: 3,
        nodes: [
          { id: "data", label: "`data/`", shape: "box", col: 0, row: 0 },
          { id: "scripts", label: "`scripts/`", shape: "box", col: 0, row: 1 },
          { id: "report", label: "`report.md`", shape: "box", col: 0, row: 2 },
          { id: "read", label: "Reads files", shape: "pill", col: 1, row: 0 },
          { id: "run", label: "Runs commands", shape: "pill", col: 1, row: 1 },
          { id: "edit", label: "Writes code", shape: "pill", col: 1, row: 2 },
        ],
        edges: [{ from: "read", to: "data" }, { from: "run", to: "scripts" }, { from: "edit", to: "report" }],
        groups: [
          { id: "agent", label: "Agent", contains: pills },
          { id: "folder", label: "Project folder", contains: ["agent", ...files], dashed: true },
          { id: "computer", label: "Your computer", contains: ["folder"] },
        ],
        shown: ["computer"],
      } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic diagram of an agent's workspace." } },
  ],
  steps: [
    { id: "computer" },
    { id: "folder", set: { nest: { shown: ["computer", "folder", ...files] } } },
    { id: "agent", set: { nest: { shown: ["computer", "folder", ...files, "agent"] } } },
    { id: "tools", set: { nest: { shown: ["computer", "folder", ...files, "agent", ...pills, ...arrows] } } },
  ],
};
```

### A lettered list revealed one item per step

`advance` drives `shown`. On `statement` the list sits in the middle of the canvas; on `full-bleed` it hangs under the title. The third item is deliberately long and wraps.

```js
export default {
  id: "criteria",
  layout: "statement",
  title: "How we check the agent's work",
  elements: [
    { id: "list", region: "main", type: "list",
      props: { marker: "letter", rule: true, shown: 1, items: [
        { text: "The numbers match a **hand count** on a sample" },
        { text: "Every step is in a script we can rerun" },
        { text: "Each figure in the report traces back to one file in `data/`, with the code that made it and the date it was run, so that a reviewer can rebuild it alone", sub: "No figure is typed by hand" },
        { text: "A second person reviews the code" },
      ] },
      advance: { prop: "shown", values: [1, 2, 3, 4], start: "a" } },
  ],
  steps: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
};
```

### A prompt card and a checklist that ticks, side by side

On `halves`, the prompt is a `chat` card on the left and the checklist a `list` on the right. Every item is visible from the start and only `done` advances. `--gutter` widens the space between the halves, and `--align: center` centres both halves vertically.

```js
export default {
  id: "tasks",
  layout: "halves",
  title: "One prompt, four tasks",
  regions: { "--gutter": "96px", "--align": "center" },
  elements: [
    { id: "prompt", region: "left", type: "chat",
      props: { style: "card", messages: [
        { role: "user", label: "The prompt", text: "Check the survey data, fit the model, make the two figures and write a **one-page** summary." },
        { role: "note", label: "The rule", text: "Work only inside the project folder. Never change `data/raw/`." },
      ] } },
    { id: "todo", region: "right", type: "list",
      props: { marker: "check", done: 0, items: [
        { id: "check", text: "Check the data", sub: "missing values, duplicates" },
        { id: "fit", text: "Fit the model", sub: "with its 95% interval" },
        { id: "figures", text: "Make the figures", sub: "saved in `figures/`" },
        { id: "summary", text: "Write the summary", sub: "one page, plain words" },
      ] },
      advance: { prop: "done", values: [0, 1, 2, 3, 4], start: "prompt" } },
  ],
  steps: [{ id: "prompt" }, { id: "checked" }, { id: "fitted" }, { id: "drawn" }, { id: "written" }],
};
```

### Bars that shrink when `y` switches

Both columns are in the same unit, and the explicit `domain` keeps the axis put, so the shrink is visible. The chart needs the height of the `figure-notes` main; the notes start at the first step.

`data/speed.csv`:

```csv
task,before_days,agent_days
Clean the data,25,3
Write the report,18,3
```

```js
export default {
  id: "speed",
  layout: "figure-notes",
  title: "From weeks to days",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/speed.csv", x: "task", y: "before_days", domain: [0, 30], format: { y: ",.0f" },
               axes: { y: "Days, before" } } },
    { id: "before", region: "notes", type: "text", props: { text: "Before: weeks of work per task." } },
    { id: "after", region: "notes", type: "text", from: "agent", props: { text: "With an agent: a few days." } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic task durations (data/make-data.mjs)." } },
  ],
  steps: [
    { id: "before" },
    { id: "agent", set: { bars: { y: "agent_days", axes: { y: "Days, with an agent" } } } },
  ],
};
```

### One estimate with its interval, then a second

`shown` brings categories in by name; the hidden one keeps its band. `interval` names the lower and upper columns.

`data/estimate.csv`:

```csv
group,per100,low,high
Less exposed,8.5,6.9,10.1
More exposed,16,13.9,18.1
```

```js
export default {
  id: "estimate",
  layout: "figure-notes",
  title: "More exposure, more cases",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/estimate.csv", x: "group", y: "per100", interval: { lower: "low", upper: "high" },
               shown: ["Less exposed"], format: { y: ",.1f" }, axes: { y: "Cases per 100" } } },
    { id: "n1", region: "notes", type: "text", props: { text: "Each bar is an estimate with its 95% interval." } },
    { id: "n2", region: "notes", type: "text", from: "both", props: { text: "The intervals do not overlap." } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic cohort (data/make-data.mjs)." } },
  ],
  steps: [
    { id: "one" },
    { id: "both", set: { bars: { shown: ["Less exposed", "More exposed"] } } },
  ],
};
```

### A chat exchange with typing

`advance` drives `shown`, and `typing` types the newest message on a forward step. The agent's message is deliberately long and wraps inside its bubble.

```js
export default {
  id: "exchange",
  layout: "full-bleed",
  title: "Asking before acting",
  elements: [
    { id: "chat", region: "main", type: "chat",
      props: { style: "bubbles", typing: true, shown: 1, messages: [
        { role: "user", label: "You", text: "Can you check whether the effect holds in **new** data?" },
        { role: "agent", label: "Agent", text: "Yes. I propose to hold out a fifth of the data, refit on the rest, and compare the error on both parts, repeated with three different seeds so the result is not luck. Shall I go ahead?" },
        { role: "user", label: "You", text: "Go ahead." },
      ] },
      advance: { prop: "shown", values: [1, 2, 3], start: "ask" } },
  ],
  steps: [{ id: "ask" }, { id: "propose" }, { id: "agree" }],
};
```

### A timeline that fills

`advance` drives `progress` and `set` moves `current`. A timeline is only as tall as its stops, so on `statement` it sits in the middle with a lead line above; the slide `style` widens the gap between them.

```js
export default {
  id: "track",
  layout: "statement",
  title: "From first draft to final",
  style: ":scope > [data-region=\"main\"] { gap: calc(var(--sd-region-gap) * 3); }",
  elements: [
    { id: "lead", region: "main", type: "text", props: { text: "Every report takes the same path." } },
    { id: "path", region: "main", type: "timeline",
      props: { progress: 0, current: "draft", stops: [
        { id: "draft", label: "First draft", sub: "written with the agent" },
        { id: "review", label: "Review", sub: "by a person" },
        { id: "final", label: "Final" },
      ] },
      advance: { prop: "progress", values: [0, 0.5, 1], start: "draft" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic workflow." } },
  ],
  steps: [
    { id: "draft" },
    { id: "review", set: { path: { current: "review" } } },
    { id: "final", set: { path: { current: "final" } } },
  ],
};
```

## Data stories

Recipes for the chart props that tell a story over several steps. Each is a complete slide in a deck made with `new`; the data is synthetic.

### Data, then forecast

The forecast starts in 2023, a year with no data, so every line gets an interpolated point there and the solid line ends where the dotted one starts. `until` sweeps the lines along the x axis, and `ticker: true` counts the year. The first step stops at 2010; the second stops at 2023, where the lines are still all solid and no region is shaded; the third carries them into the dotted forecast, and the shaded region appears as the sweep passes. The x axis never moves. A jump or a backward move shows a step at once.

`data/trend.csv`:

```csv
year,series,rate,lo,hi
2000,north,18,16,20
2005,north,22.5,20.2,24.8
2010,north,27,24.4,29.6
2015,north,27,24.1,29.9
2020,north,31.5,28.3,34.7
2025,north,36,32.5,39.5
2030,north,36,32.2,39.8
2035,north,40.5,36.4,44.6
2040,north,45,40.6,49.4
2045,north,45,40.3,49.7
2050,north,49.5,44.5,54.5
2000,south,12,10,14
2005,south,18.6,16.3,20.9
2010,south,25.2,22.6,27.8
2015,south,27.3,24.4,30.2
2020,south,33.9,30.7,37.1
2025,south,40.5,37,44
2030,south,42.6,38.8,46.4
2035,south,49.2,45.1,53.3
2040,south,55.8,51.4,60.2
2045,south,57.9,53.2,62.6
2050,south,64.5,59.5,69.5
```

```js
export default {
  id: "data-forecast",
  layout: "full-bleed",
  title: "Data, then forecast",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/trend.csv", x: "year", y: "rate", series: "series", interval: { lower: "lo", upper: "hi" },
               points: true, forecast: { from: 2023 }, until: 2010, ticker: true,
               format: { x: "d" }, axes: { x: "Year", y: "Rate" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Source: synthetic example data." } },
  ],
  steps: [
    { id: "start" },
    { id: "observed", set: { chart: { until: 2023 } } },
    { id: "forecast", set: { chart: { until: 2050 } } },
  ],
};
```

### More draws

`draws` paints a fan of uncertainty draws under the lines, from a second CSV: the chart's `x`, `y` and `series` columns and a column that names the draw. `shown` is how many. Raise it step by step, and the draws already on screen stay while more join them; lower it on a later step to go back. The y axis already covers every draw, so it does not move when the fan appears. The lines stay on top, so the story is still the trend. Keep the file small (at most 2000 draws and 500 x values per series; a few hundred draws are plenty).

`data/draws.csv` has one row per draw, series and year, written by a script. This recipe's file has 300 draws, 11 years and 2 series, so 6,600 rows; its first rows:

```csv
year,series,rate,draw
2000,north,16.9,1
2005,north,20.7,1
2010,north,24.5,1
2015,north,21.8,1
2020,north,28.0,1
```

It draws on the `data/trend.csv` of the previous recipe.

```js
export default {
  id: "more-draws",
  layout: "full-bleed",
  title: "Uncertainty draws",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/trend.csv", x: "year", y: "rate", series: "series",
               draws: { data: "data/draws.csv", id: "draw", shown: 0 },
               format: { x: "d" }, axes: { x: "Year", y: "Rate" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Source: synthetic example data." } },
  ],
  steps: [
    { id: "none" },
    { id: "one", set: { chart: { draws: { shown: 1 } } } },
    { id: "few", set: { chart: { draws: { shown: 20 } } } },
    { id: "many", set: { chart: { draws: { shown: 200 } } } },
  ],
};
```

### Re-sort to make the point

A changed `sort` slides every bar, with its label and whisker, to its new band. Hidden categories keep their place, so the ranking never reflows, and an empty value comes last. Open in the data order, rank the bars, then put two chosen categories first. `chart.points` takes the same `sort`.

`data/values.csv`:

```csv
group,score,low,high
North,12.4,9.8,15.1
South,8.6,6.9,10.4
East,15.2,12.1,18.4
West,6.1,4.2,8.3
Centre,17.5,14.3,20.9
```

```js
export default {
  id: "re-sort",
  layout: "full-bleed",
  title: "Highest first",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/values.csv", x: "group", y: "score", interval: { lower: "low", upper: "high" },
               format: { y: ",.1f" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Source: synthetic example data." } },
  ],
  steps: [
    { id: "data" },
    { id: "desc", set: { bars: { sort: "-value" } } },
    { id: "list", set: { bars: { sort: ["West", "Centre"] } } },
  ],
};
```

### Before and after

`from` makes every row a before and after pair: a hollow dot at the `from` column, a quiet connector, and the filled dot at `y`. Show `y: "before"` first; on the next step set `y: "now"` and `from: "before"`, and the dots slide while the connectors grow. A row with an empty `from` (West) shows its end dot alone, never a dot at zero. Set `from: null` on a later step to fold the pairs back into plain dots.

`data/pairs.csv`:

```csv
region,before,now
North,14.2,10.1
South,11.8,9.6
East,16.5,12.0
West,,8.3
Centre,9.4,13.2
```

```js
export default {
  id: "before-after",
  layout: "figure-notes",
  title: "Before and now",
  elements: [
    { id: "points", region: "main", type: "chart.points",
      props: { data: "data/pairs.csv", x: "region", y: "before", format: { y: ",.1f" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic example data." } },
  ],
  steps: [
    { id: "before" },
    { id: "now", set: { points: { y: "now", from: "before" } } },
  ],
};
```

## Motion

Every element that appears on a forward step enters in turn: its box plays the theme's entrance (`rise` in `modern`), or a component whose catalog entry says `enter: own` builds itself. These recipes use the data of a deck made with `new` (`data/series.csv`, `data/summary.json`). They pass `validate`, `check` and `check --played` there. The stepdeck gallery's motion slides (`site/gallery/slides/motion-*.js` in the repository) show the same devices at full size.

### Cards that rise in turn, then a list that builds

All four elements enter on the step `go`, one stagger slot apart: `transition.stagger` (here 220 ms, instead of the theme's 80 ms) spaces them so the order reads. The list owns its entrance: in the fourth slot its three items rise one after another, with no `shown` to advance. The slide `style` lays the main region out as a three-column grid and draws the cards with theme tokens only.

```js
export default {
  id: "cards",
  layout: "full-bleed",
  title: "Three steps, in order",
  style: `
    :scope > [data-region="main"] { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-content: start; gap: calc(var(--sd-space) * 2); }
    [data-el^="card-"] { padding: calc(var(--sd-space) * 1.5); border: var(--sd-rule-width) solid var(--sd-color-rule); border-radius: calc(var(--sd-grid) * 2); background: var(--sd-color-surface); }
    [data-el="next"] { grid-column: 1 / -1; }
  `,
  elements: [
    { id: "card-collect", region: "main", type: "markdown", from: "go", props: { md: "### Collect\n\nOne file per source." } },
    { id: "card-clean", region: "main", type: "markdown", from: "go", props: { md: "### Clean\n\nOne script, rerun every time." } },
    { id: "card-model", region: "main", type: "markdown", from: "go", props: { md: "### Model\n\nOne estimate, with its interval." } },
    { id: "next", region: "main", type: "list", from: "go",
      props: { marker: "number", items: [{ text: "Check the data" }, { text: "Fit the model" }, { text: "Write it up" }] } },
  ],
  steps: [{ id: "start" }, { id: "go", transition: { stagger: 220 } }],
};
```

To give one element a motion of its own, set `enter`: a name (`fade`, `rise`, `wipe`, `pop`, `none`) or `{ motion: "pop", delay: 300, duration: 600 }` (ms; `delay` is added to its slot).

### A message line that changes with each step, and a badge

The slide's `lede` is the muted line under the title. Each step sets its text, and it crossfades. The badge in the notes column flips its text with the same crossfade. `tone: 0` is the first palette colour; any tone reads, because the badge darkens its text to 4.5:1 and keeps the palette colour for its border.

```js
export default {
  id: "message",
  layout: "figure-notes",
  title: "Two groups, one indicator",
  lede: "Group A rises slowly from 2015.",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/series.csv", x: "year", y: "value", series: "group", series_shown: ["Group A"],
               axes: { x: "Year", y: "Indicator per 1,000" }, format: { x: "d", y: ",.0f" } } },
    { id: "status", region: "notes", type: "text", props: { role: "badge", tone: 0, text: "One group" } },
    { id: "note", region: "notes", type: "text", props: { role: "note", text: "Each step changes the line under the title." } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic example data." } },
  ],
  steps: [
    { id: "one" },
    { id: "two", set: { chart: { series_shown: ["Group A", "Group B"] }, status: { text: "Both groups" },
                        lede: { text: "Group B starts lower, then overtakes it." } } },
    { id: "turn", set: { chart: { annotate: [{ x: 2020, label: "2020" }] },
                         lede: { text: "The turn comes in 2020." } } },
  ],
};
```

`lede` needs a `title` region (every built-in layout has one); on the `title` cover, put the line in a `subtitle` text instead (`lede-on-cover`).

### A focus that moves step by step

`highlight` dims every other series to the theme's neutral grey, at full opacity, with muted labels; the series in focus is drawn on top. Set it with `set` to move the focus from step to step, or with `only` for one step. `chart.bar` (a category) and `diagram` (a list of ids) take `highlight` the same way.

```js
export default {
  id: "focus",
  layout: "figure-notes",
  title: "One group at a time",
  elements: [
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/series.csv", x: "year", y: "value", series: "group",
               axes: { x: "Year", y: "Indicator per 1,000" }, format: { x: "d", y: ",.0f" } } },
    { id: "note", region: "notes", type: "text", props: { role: "note", text: "The rest turns grey while one group is in focus." } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic example data." } },
  ],
  steps: [
    { id: "both" },
    { id: "a", set: { chart: { highlight: "Group A" } } },
    { id: "b", set: { chart: { highlight: "Group B" } } },
  ],
};
```

### A panel that holds its place

`ghost` shows a dashed frame, with its label, in the space of an element that is still hidden. The frame goes when the element arrives; here the big number then counts up (its own entrance). `ghost` cannot go with `collapse: true` (`ghost-collapse`).

```js
export default {
  id: "ghost",
  layout: "halves",
  title: "Method first, then the result",
  regions: { "--align": "center" },
  elements: [
    { id: "method", region: "left", type: "markdown",
      props: { md: "### 1 · Method\n\nThe same indicator, measured every year in both groups." } },
    { id: "result", region: "right", type: "big-number", from: "result", ghost: "2 · Result",
      props: { value: "{{data/summary.json#/latest_b}}", format: ",.1f", label: "Group B in 2024, per 1,000" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic example data." } },
  ],
  steps: [{ id: "method" }, { id: "result" }],
};
```

## A custom component driven by `stage`

After `node "$STEPDECK/cli/index.js" new-component my.flow my-talk`, the starter's example slide (`components/my.flow/example.js`) is a complete spec. The component draws a list and marks items up to `stage`; `advance` drives `stage`.

```js
export default {
  id: "my-flow-example",
  layout: "full-bleed",
  title: "my.flow",
  elements: [
    { id: "list", region: "main", type: "my.flow",
      props: { items: ["Collect", "Clean", "Model", "Share"], stage: 0 },
      advance: { prop: "stage", values: [0, 1, 2, 3] } },
  ],
  steps: [{ id: "collect" }, { id: "clean" }, { id: "model" }, { id: "share" }],
};
```

Replace the drawing in `components/my.flow/index.js` and keep its shape: one `render(props)`, animations only when `info.animate` is set, and no residue left behind. See [custom-components](custom-components.md).
