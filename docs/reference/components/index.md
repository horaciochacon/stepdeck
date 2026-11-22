# Components

This page lists the 13 built-in components and the rules they all share. Use it to pick a component, see which props you must set and which props animate, and learn how to read the per-component pages. It is for people who write slides by hand and for agents that build decks.

Agents look components up in the catalog, as described in [skill/references/components.md](../../../skill/references/components.md). The catalog and these pages are built from the same files.

## The built-in components

The order is the order of `components/index.json`. **Required** lists the props the schema requires. **Animated** lists the props whose `x-transition` is not `snap`. These are the props a forward step can animate, and they match the catalog's `animates` list. **Entrance** is the catalog's `enter`: `own` when the component builds its own entrance (its schema declares `"x-enter": "own"`), `box` when the engine moves the element's box in.

| Component | What it shows | Required props | Animated props | Entrance | Page |
| --- | --- | --- | --- | --- | --- |
| `text` | One paragraph of plain text: body copy, a source line, a note, a label, the message line under a title or a badge. | `text` | `text`, `tone` | box | [text](text.md) |
| `chart.line` | Lines from a CSV, one per series, over a numeric x. It has direct series labels, a one-step highlight, vertical annotations and an optional interval band. | `data`, `x`, `y`, `axes` | `y`, `series_shown`, `highlight`, `annotate`, `interval`, `points`, `forecast`, `until` | own: the lines draw | [chart.line](chart-line.md) |
| `chart.bar` | Bars from a CSV, one per category, horizontal or vertical. Each bar has a value label and an optional interval whisker. | `data`, `x`, `y` | `y`, `interval`, `shown`, `highlight`, `domain` | own: the bars grow | [chart.bar](chart-bar.md) |
| `chart.points` | Estimates from a CSV, one row per category: a dot with an optional interval whisker and a value label, against an optional reference line; or, with `id`, beeswarm strips of many points with a summary tick and one item followed across them. An empty value reads "no data". | `data`, `x`, `y` | `y`, `from`, `interval`, `axes`, `domain`, `shown`, `highlight`, `reference`, `summary`, `focus` | own: the dots grow out of the reference; strips fade in from left to right | [chart.points](chart-points.md) |
| `terminal` | A recorded agent session in a terminal window: a typed command, an activity log, a task list and a file list. | `script`, `shown` | `shown`, `typing` | own: types, then the lines fade in | [terminal](terminal.md) |
| `markdown` | A block of Markdown: paragraphs, headings, lists, emphasis, code and links. | `md` | `md` | box | [markdown](markdown.md) |
| `big-number` | One large figure with an optional label and 95% interval. It counts up when its value changes. | `value`, `format` | `value`, `label`, `ci` | own: counts up | [big-number](big-number.md) |
| `list` | Numbered, lettered, bulleted or checklist items revealed one by one. | `items`, `marker` | `shown`, `done`, `active` | own: the items rise in turn | [list](list.md) |
| `diagram` | Nodes, arrows and nested groups on an explicit grid, appearing by step. | `cols`, `rows`, `nodes` | `shown`, `highlight` | own: groups, nodes, then edges | [diagram](diagram.md) |
| `chat` | An exchange shown as bubbles, or a single prompt or quote shown as a card. | `messages` | `shown`, `typing` | own: the messages rise in turn | [chat](chat.md) |
| `timeline` | A track between stops that fills as `progress` grows. Each stop lights up as the fill passes it. | `stops`, `progress` | `progress`, `current` | own: the track fills | [timeline](timeline.md) |
| `image` | A local image with required alt text, an optional caption and a fit mode. | `src`, `alt` | `src`, `caption` | box | [image](image.md) |
| `map` | Regions from a GeoJSON file with layers of data over them: a choropleth from a CSV in the theme's palettes, with a hatch for a region without a value, highlighted regions, names on the map and a legend. | `boundaries` | `layers`, `shown`, `highlight`, `labels` | box | [map](map.md) |

`typing` (on `terminal` and `chat`) is a boolean that turns on a typing animation. It is listed as animated because its transition is `draw`, not because toggling it moves anything.

The engine animates only when you move forward by exactly one step. A jump, a backward move and the first render all draw the target state directly. On an animating step an element that appears enters in its stagger slot: its box plays the element's `enter` (default: the theme's `--sd-enter`), or a component with an `own` entrance builds itself, and an element that leaves plays its `exit` (default `fade`). See [Animation and motion](../../guide/animation-and-motion.md).

## Rules every component shares

### Props are checked against a closed schema

Every component has a `schema.json`, and every schema sets `additionalProperties: false`. A prop the schema does not name is an error, so a typo does not get silently ignored.

`validate` folds every step of every slide. At each step it checks each element's resolved props against its component's schema, hidden elements included. It reports two rules:

| Rule | When |
| --- | --- |
| `unknown-prop` | A prop the component does not have. The problem line lists the props it does have. |
| `prop-invalid` | A prop with the wrong type, a value outside its enum or range, or a missing required prop. |

Each problem is reported once per element, at the first step where it appears. Here is `validate` on a starter deck after a misspelled prop was added to a `big-number`:

```text
chart/latest/base · unknown-prop · prop 'colour' vs props of big-number: value, format, label, ci, prefix, suffix · remove 'colour'; allowed keys are value, format, label, ci, prefix, suffix (props of big-number)
```

A slide that names a component that does not exist gets `unknown-component` instead. All rules are listed in [Rules](../rules.md).

### Props may be bindings

A string prop can be a data binding, `{{path#/json/pointer}}` or `{{path#/json/pointer | format}}`. The path is relative to the deck root. A binding that fills the whole string and has no format gives the raw value, such as a number or an array. A binding with a format, or one embedded in other text, gives a string. `validate` resolves bindings before it checks the schema, so the schema sees the resolved value.

```js
{ id: "latest", region: "notes", type: "big-number", from: "latest",
  props: { value: "{{data/summary.json#/latest_b}}", format: ",.1f", label: "Group B in 2024, per 1,000" } },
```

This element comes from `templates/talk/slides/chart.js`. `big-number` takes the number unformatted and applies `format` itself. See [Data and bindings](../../guide/data-and-bindings.md) for pointers, formats and CSV column types.

`{{color:<role>}}`, which gives the palette's name for a color, is resolved only in `markdown`.

### An element error fails only that element

When a component cannot render, for example because a column is missing from the CSV, an id is unknown, or an image file cannot be decoded, the error affects only that element:

- The message is recorded as `<slide>/<element>: <message>` in `STEPDECK.errors`, and the same text is shown on the canvas inside the element's box (`div.sd-error`, `role="alert"`).
- The failed element is forced visible, so the error can be seen at every step. It gets no further updates.
- The other elements on the slide keep working.
- A mount or update that has not settled after 10 seconds fails with `did not settle within 10s`.

`check` reports these messages as `render-error`. `dump` lists them in each step's `errors`.

## Figures need a source line

`chart.line`, `chart.bar`, `chart.points`, `map` and `big-number` are figures. A slide that has a figure must also have an element whose props include `role: "source"`, which is usually a `text` element in the `footer` region. Without one, `validate` reports `figure-source` on the first figure:

```text
chart/chart · figure-source · chart (chart.line), latest (big-number) without a source vs an element with role: "source" · add { id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: …" } }
```

The starter deck's chart slide does this:

```js
{ id: "source", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic example data (data/make-data.mjs)." } },
```

The source element can be hidden until a later step (for example with `from:`), but `role: "source"` must be in its declared props. A role added by a later step's `set` or `replace` does not count.

## How to read a component page

Component pages use these sections where they apply. Every page has Use it, Props and Motion. The others appear only when the component needs them: some pages have no Errors or Gotchas section, and some put the markup under "What it renders" or "Markup and size". Many pages also add sections of their own, such as scales, layout or sizing.

| Section | What it gives you |
| --- | --- |
| Use it | An element using the component, taken from a real deck in the repository. |
| Props | One row per prop: type, default, whether it is required, and its transition (`tween`, `draw`, `fade` or `snap`). |
| Motion | What each animated prop does on a forward step, and how long it takes. |
| Markup (or "What it renders", "Markup and size") | The classes and data attributes the component renders, for slide `style` and for reading `dump` output. |
| Errors (or "Errors and problems") | The element error messages the component can raise, word for word. |
| Gotchas | Behavior that is easy to get wrong, such as what happens on enter, silent fallbacks, and layout needs. |
| For agents | Where agents find this component: the skill reference and the `catalog` command. |
| See also | Links to related guides and components. |

The transition column describes how a change to that prop plays out:

| Transition | Meaning |
| --- | --- |
| `tween` | The value interpolates, for example lines morph, bars grow or a number counts up. |
| `draw` | Strokes draw along their length, or new parts draw in. |
| `fade` | The changed part fades in. |
| `snap` | The new value is drawn at once, with no motion. |

The transition is a schema annotation (`x-transition`). It documents the motion and feeds the catalog. The motion itself is written in each component's `index.js`, and the engine never reads the annotation.

Sizes on the component pages, such as body text at 40px or `big-number` at 128px, are values from `academic-light`; the default theme, `modern`, has the same sizes and its own colors and fonts. A theme can change them, but the token names stay the same. See [Themes](../themes.md).

## The catalog mirrors these pages

The catalog gives the same props data as these pages, from the same `schema.json` files:

```sh
node cli/index.js catalog text examples/kit          # one entry, readable
node cli/index.js catalog chart.line my-talk --json  # the full entry, README included
node cli/index.js catalog my-talk                    # writes my-talk/catalog/index.json and one <name>.json per entry
```

A named entry is printed and nothing is written. Without a name, `catalog` rewrites the `catalog/` folder of the deck, or `<repo>/catalog/` (built from `engine/`) when it is run in the repository root. Here is the readable output for `text`:

```text
text · component (built-in)
One paragraph of plain text: body copy, a source line, a note, a label, a message line under a title or a badge.

enter: box (the element's box moves in)

props (name, transition, required, description):
  text    fade   required  The text to show. May be a data binding such as {{data/summary.json#/responders | ,.0f}}.
          e.g. "Above 250 mg the curve steepens.", "{{data/summary.json#/responders | ,.0f}}"
  role    snap   optional  Typographic role: body copy, a source or citation line, a side note, a short label, a message line under a title (lede), or a badge (an uppercase pill). …
          e.g. "body", "badge"
  tone    fade   optional  For role badge: the index of the badge's colour in the deck's categorical palette (0 is the first colour). …
          e.g. 0, 1
  accent  snap   optional  Render `*phrase*` in the text as an accent phrase …
          e.g. true, false

example: components/text/example.js
```

(Long descriptions are cut here with `…`; the command prints them whole.)

Each component folder in `components/` holds four files, and some hold helpers as well:

| File | What it is |
| --- | --- |
| `schema.json` | The props schema. It is the source of truth for props, defaults and transitions. |
| `index.js` | The component code. |
| `README.md` | Behavior notes. The catalog includes this as `readme`. |
| `example.js` | An example slide using the component. |

The `example.js` files are slides that show usage. Each one runs in the [gallery deck](../../../site/gallery/), which validates and checks clean. Some read data files that a new deck does not have, such as `data/durations.csv` for `chart.bar` or `data/session.json` for `terminal`; the gallery keeps them in `site/gallery/data/`. Before you copy an example into a deck, copy the data it needs too, then run `validate`.

## Custom components

If none of the built-ins fits, write a deck component. Its name needs a dot namespace, such as `my.map`, and it must not reuse a built-in name.

- [Custom components](../../guide/custom-components.md) shows how to create one with `new-component` and test it.
- [Component contract](../component-contract.md) is the reference for `mount`, `update`, the `info` argument and `ctx`.
