# Deck and slide specification

This page lists every key of `deck.js`, of a slide file, of an element and of a step, with its type, its default and what the engine does with it. It also covers boxes, `advance`, step references and the slide title shortcut, plus the runtime behaviour that the JSON schemas do not express. It is for people who write decks by hand and for agents that generate them.

The schemas are [`schema/deck.schema.json`](../../engine/schema/deck.schema.json) and [`schema/slide.schema.json`](../../engine/schema/slide.schema.json); [`schema/stepdeck.d.ts`](../../engine/schema/stepdeck.d.ts) has the same shapes as TypeScript types. `validate` checks a deck against both schemas. Where the runtime is more lenient than the schema, this page says so; write to the schema.

For how steps fold into states, with worked examples, read [The step model](../guide/step-model.md) first. Agents use [skill/references/step-model.md](../../skill/references/step-model.md).

## Files of a deck

A deck is a folder:

```
my-talk/
  deck.js            export default { title, slides, ... }
  slides/<id>.js     one file per slide id: export default { id, elements, ... }
  index.html         the page: an import map for stepdeck/ and boot({ shell: "reveal" })
  data/              data files the props bind to
  components/<name>/ deck components (optional)
  stepdeck/          the engine copy made by `stepdeck new`
```

`deck.js` and every slide file must import in plain Node: no DOM, no `fetch`, no top-level `await`. They are plain data. `validate` imports them in Node, the browser imports them as ES modules.

## Canvas

Every slide is drawn on a canvas of **1920 x 1080** pixels (`CANVAS` in [`core/constants.js`](../../engine/core/constants.js)) and scaled to fit the screen. Element boxes, `regions` values in pixels, and the boxes `dump` prints are all in canvas pixels.

| Constant | Value | Used for |
| --- | --- | --- |
| `CANVAS` | `{ w: 1920, h: 1080 }` | canvas size |
| `DEFAULT_LAYOUT` | `"full-bleed"` | a slide with no `layout` |
| `DEFAULT_THEME` | `"modern"` | a deck with no `theme` (and no `?theme=`) |

## deck.js

From [`templates/talk/deck.js`](../../templates/talk/deck.js):

```js
export default {
  title: "Your talk title",
  lang: "en",
  theme: "modern",
  // Deck components, each in components/<name>/ (`stepdeck new-component my.thing` adds one here).
  components: [],
  slides: ["title", "chart", "closing"],
};
```

The default export is an object with these keys. No other key is allowed (`additionalProperties: false`): an unknown key is reported by `validate` as `unknown-key`, with a "rename to" fix when a known key is close.

| Key | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `title` | string, non-empty | yes | | The deck title. Required by the schema, but not read by the engine or the CLI. The browser tab title comes from your `index.html`. |
| `slides` | string[], at least 1, unique | yes | | Slide ids in presentation order. Each id must match `^[A-Za-z0-9][A-Za-z0-9_-]*$` and names the file `slides/<id>.js`. |
| `lang` | string matching `^[a-z]{2,3}(-[A-Za-z0-9]+)*$` | no | `"en"` | Language of engine strings and number formats. `en` and `es` are built in; any other language falls back to `en`. The `?lang=` query flag overrides it. |
| `theme` | string, non-empty | no | `"modern"` | Theme folder under the engine's `themes/` (lowercase letters, digits and hyphens). The built-in themes are `modern` and `academic-light`. The `?theme=` query flag overrides it. |
| `palette` | string, non-empty | no | the theme's default per kind | A palette name from the theme's `palettes.json`. It is used only for its own kind (categorical, sequential or diverging); the other kinds keep the theme defaults. |
| `sections` | boolean | no | | **Inert.** The schema describes it as a "Section · n" footer, but nothing in the engine or the components reads it. |
| `components` | string[], unique, each matching `^[a-z0-9][a-z0-9._-]*$` | no | `[]` | Deck components, each a folder `components/<name>/` with `index.js` and `schema.json`. A name must not equal a built-in; use a namespace such as `my.chart`. See [Custom components](../guide/custom-components.md). |

### How the runtime resolves the deck

When the page boots (`loadDeck` in [`core/stepdeck.js`](../../engine/core/stepdeck.js)):

- `lang` is `?lang=` if present and non-empty, else `deck.lang`, else `"en"`.
- `theme` is `?theme=` if present and non-empty, else `deck.theme`, else `modern`.
- Every slide in `slides` is imported from `slides/<id>.js` in parallel.
- An empty or missing `slides` records the boot error `deck: deck.js lists no slides` in `STEPDECK.errors`, and nothing is mounted.
- A `deck.js` that cannot be loaded at all is fatal and shown on the canvas: `deck: cannot load <url>: <message>`.
- A missing theme shows `deck: theme '<t>' not found (…)`; missing palettes show `deck: palettes of theme '<t>' not found (…)`.

`validate` reads `deck.theme` only; it does not know about `?theme=`. The browser commands `dump`, `check` and `shoot` take `--theme <name>`, which adds `?theme=` to every page they load. Query flags are covered in [Runtime API](runtime-api.md).

## Slide files

Each id in `deck.slides` is a file `slides/<id>.js` whose default export is the slide. Its `id` must equal the file name. From [`templates/talk/slides/chart.js`](../../templates/talk/slides/chart.js):

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

| Key | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | string matching `^[A-Za-z0-9][A-Za-z0-9_-]*$` | yes | | Must equal the file name (`slides/<id>.js`). |
| `elements` | [element](#elements)[] | yes | | The slide's elements, in order. Order sets the order inside a region and the mount order. |
| `layout` | string, non-empty | no | `"full-bleed"` | Layout folder under the engine's `layouts/`. See [Layouts](layouts.md). |
| `title` | string | no | | Shortcut for a title element. `*phrase*` in it is an accent phrase. See [The slide title shortcut](#the-slide-title-shortcut). |
| `steps` | [step](#steps)[] | no | one state | The slide's steps. A slide with `n` steps has states `0 … n−1`; with no steps (missing or `[]`) it has one state. |
| `style` | string | no | | Scoped CSS. See [Scoped `style`](#scoped-style). |
| `regions` | object: keys matching `^--[a-z0-9-]+$`, string values | no | | CSS custom properties set on the canvas, mainly to override the layout's grid variables, e.g. `{ "--notes-width": "700px" }`. |
| `notes` | string | no | `""` | Speaker notes for every step that has no `notes` of its own. |
| `section` | string | no | | The kicker: a small label above the title. See [`section`: the kicker](#section-the-kicker). |
| `seconds` | number > 0 | no | | **Inert.** Planned speaking time; nothing reads it yet. |

No other key is allowed: `validate` reports `unknown-key`.

### What the runtime does with a slide file

- A file that fails to import, has no default object export, or exports the wrong `id` is shown as a slide error on its canvas. The other slides still work. The messages are:
  - `<id>: cannot load slide: slide file has no default export`
  - `<id>: cannot load slide: slide file exports id '<x>', expected '<id>'`
  - `<id>: cannot load slide: <import error>`
- `validate` reports the same cases as `slide-missing` (no file), `path-case` (file name differs in case), `slide-load` (import throws, or no default object export) and `slide-id` (wrong `id`). After `slide-id`, the rest of that slide is not checked.
- An unknown layout shows `<id>: layout '<name>' not found (…)` on the canvas and adds it to `STEPDECK.errors`. The elements are still rendered, without the layout's grid CSS. `validate` reports `unknown-layout`.

### `regions`

Every key that starts with `--` is set as an inline custom property on the canvas (`root.style.setProperty`). Keys that do not start with `--` are ignored at runtime; the schema rejects them, so `validate` reports `spec-invalid`. Values must be strings.

The names are not checked against the variables the layout declares, so a misspelt `--note-width` is silently ignored. Any custom property works, theme tokens included. From [`examples/kit/slides/tasks.js`](../../examples/kit/slides/tasks.js):

```js
regions: { "--gutter": "96px", "--align": "center" },
```

### Scoped `style`

`style` is a CSS string added to the slide. Every selector is prefixed with `[data-slide="<id>"] `, so the rules apply to this slide only. A selector that starts with `:scope` or `&` targets the canvas itself. `@media` and `@supports` blocks are scoped recursively; `@keyframes` are kept as they are. From [`examples/kit/slides/track.js`](../../examples/kit/slides/track.js):

```js
style: ":scope > [data-region=\"main\"] { gap: calc(var(--sd-region-gap) * 3); }",
```

`@import` is dropped by the browser's CSS parser; `validate` reports it as `style-import`. Remote URLs (`http://`, `https://`, `//host`) are reported as `remote-url`; copy the file into the deck and use a relative `url()`.

## Elements

An element is one component placed in a region (or in a box) of the slide.

| Key | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | string, non-empty | yes | | Unique within the slide. Steps name elements by this id. |
| `type` | string, non-empty | yes | | A built-in component (`text`, `markdown`, `chart.line`, …) or a deck component listed in `deck.components`. See [Components](components/index.md). |
| `props` | object | no | `{}` | The component's props, plain JSON. Checked at every step against the component's `schema.json`. Strings may hold bindings to data files; see [Data and bindings](../guide/data-and-bindings.md). |
| `region` | string, non-empty | no | `"main"` | The layout region the element goes in. Ignored at runtime when the element has a `box`, but `validate` still checks an explicit `region` on a boxed element. |
| `box` | [box](#box) | no | | Places the element at a fixed position on the canvas instead of in a region. |
| `collapse` | boolean | no | `false` | When hidden, remove the element from the flow (`display: none`) instead of keeping its space (`visibility: hidden`). |
| `from` | [step ref](#step-references) | no | | Visible from this step on, hidden before it. |
| `at` | step ref[] | no | | Visible only at these steps. Ignored when `from` is also set. |
| `advance` | [advance](#advance) | no | | Sets one prop to a list of values, one per step. |
| `enter` | `"fade"`, `"rise"`, `"wipe"`, `"draw"` or `"none"` | no | | **Inert.** Accepted and copied into the element state, but nothing reads it. Entry motion is up to each component. |
| `exit` | same as `enter` | no | | **Inert**, like `enter`. |

No other key is allowed: `validate` reports `unknown-key` and names the element.

Every element starts visible at step 0, with its `props`, unless `from` or `at` hides it there. A hidden element is still mounted, with its step-0 props, so it can appear later without loading.

Element ids must be unique in a slide; a repeated id is reported as `duplicate-id`. Fix it before presenting: the runtime does not report it, and what it renders is undefined.

### Regions and the DOM

Each element becomes `<div class="sd-el" data-el="<id>" data-type="<type>">` inside its region's `<div class="sd-region" data-region="<name>">`, in element order. An element that names a region the layout does not have is still placed, in a region of that name that has no place in the layout's grid. The runtime adds `<slide>/<element>: unknown region '<name>' in layout '<layout>' (regions: …)` to `STEPDECK.errors` and shows it on the element; `check` reports it as `render-error`, and `validate` as `unknown-region`. Each layout's regions are listed in [Layouts](layouts.md).

### Visibility: `from` and `at`

`from` and `at` are shortcuts for `show` and `hide` patches. The engine expands them into the patches of the steps where the element's visibility changes, starting from "visible", and applies them before each step's own patches. So an explicit `show` or `hide` in a step wins at that step, and keeps winning until the shortcut changes the visibility again.

- `from: "mark"`: hidden at steps before `mark`, visible from `mark` on.
- `at: ["a", "c"]`: visible at steps `a` and `c` only.
- Both set: `from` wins and `at` is ignored. `validate` does not warn about this.

A reference that names no step is reported as `step-ref`.

### `collapse`

| Element | Hidden with | Space |
| --- | --- | --- |
| default | class `sd-hidden` (`visibility: hidden`) | kept: nothing moves when it appears |
| `collapse: true` | classes `sd-hidden` and `sd-collapsed` (`display: none`) | removed: the region reflows when it appears |

`collapse` is part of the element definition; steps cannot change it.

## box

A box places an element at a fixed position on the canvas, in canvas pixels, instead of in a region.

```js
{ id: "badge", type: "text", box: { x: 1500, y: 40, w: 360, h: 60 }, at: ["last"],
  props: { role: "label", text: "Only at the end" } },
```

| Key | Type | Required by the schema | Runtime when missing |
| --- | --- | --- | --- |
| `x` | number | yes | `0` |
| `y` | number | yes | `0` |
| `w` | number > 0 | yes | no width set; the element sizes to its content |
| `h` | number > 0 | yes | no height set |

No other key is allowed (`unknown-key`). The schema requires all four keys and `validate` reports a missing one as `spec-invalid`. The runtime is more lenient (see the last column), but do not rely on that: always give `x`, `y`, `w` and `h`.

At runtime a boxed element gets a `data-box` attribute and absolute `left`, `top`, `width` and `height`. It is appended to the canvas after all the regions, so it draws above them. Its `region` is ignored, and `validate` does not check the region of an element that has a box and no `region`. `validate` still checks an explicit `region` on a boxed element; omit `region` when you use `box`.

## Steps

A step is a patch over the state of the step before it. The state at step `k` is the fold of steps `0 … k`, plus step `k`'s `only`. See [The step model](../guide/step-model.md) for worked examples.

| Key | Type | What it does |
| --- | --- | --- |
| `id` | string, non-empty, not digits only | The step's name, used in step references, URLs, `--step` and file names from `shoot`. Optional, but give every step one. |
| `set` | object: element id → merge patch | Merges into the element's props ([RFC 7396](https://www.rfc-editor.org/rfc/rfc7396)). Folded into later steps. |
| `replace` | object: element id → props | Replaces the element's props wholesale. Folded into later steps. |
| `show` | element id[] | Makes the elements visible. Folded. |
| `hide` | element id[] | Hides the elements. Folded. |
| `only` | object: element id → merge patch | Like `set`, but at this step only: it is merged on top of the folded state and never carried into later steps. |
| `notes` | string | Speaker notes for this step. Without it, the slide's `notes` (or `""`) apply. |
| `transition` | `{ duration?, stagger? }`, numbers >= 0 | Motion hints for the move into this step, in milliseconds. Passed to components as `info.transition`. |

No other key is allowed: `validate` reports `unknown-key` and names the step.

### Patch order and merge rules

Inside one step the operations run in this order (`stateAt` in [`core/fold.js`](../../engine/core/fold.js)):

1. the `from`, `at` and `advance` shortcuts expanded for this step,
2. `replace`,
3. `set`,
4. `show`,
5. `hide`.

Steps `0 … k` are applied in that order, and then step `k`'s `only` is merged on top.

`set` and `only` use JSON merge patch:

- an object value merges key by key, recursively;
- `null` deletes the key: `set: { chart: { highlight: null } }` removes `highlight`;
- any other value (string, number, array) replaces the old value; arrays are never merged;
- the key `__proto__` is skipped.

Do not write `set: { id: null }`: that makes the element's props `null`. `validate` reports it as `props-not-object`. Delete one prop with `{ prop: null }`, or use `replace` to swap all props.

A patch that names an element the slide does not have makes the fold throw `unknown element '<id>' in slide '<slide>' step '<step>'`. `validate` reports `unknown-element` at the step that names it. A bad `set`, `replace`, `show` or `hide` stops `validate` from folding that step and every later one; a bad `only` affects its own step only.

### Step ids

- Give each step an id. Inserting a step shifts every index after it; ids stay put.
- An id must not be digits only (`"2"`, `"02"`): the URL, the query string and the CLI read an all-digit value as a step number. `validate` reports `step-id-numeric`.
- Ids must be unique within the slide: `duplicate-step-id`.
- A step whose elements (props and visibility) are exactly those of the step before it is a `noop-step` warning, even if it has its own notes or transition. Merge it into the previous step, or give it a patch.

### `transition`

`transition.duration` is the length, in milliseconds, of the motion that plays when moving forward into this step; it replaces the component's default motion length: the theme's `--sd-duration` for `terminal` and twice that for `chart.line` and `chart.bar`, a fixed 400 ms for the other built-ins (the `ctx.animate` helpers' default), and 900 ms for the `big-number` count-up. A theme that changes `--sd-duration` changes only the `terminal` and chart defaults. `0` makes the step snap. Typing effects keep their own per-character speed: `terminal` ignores `duration` when it types a command, and `chat` honours only `0`. The built-in components read only `duration`. `stagger` is accepted and passed through in `info.transition`, but no built-in component reads it.

Motion plays only when moving forward by exactly one step; jumps and backward moves render the end state directly. A step without `transition` gives `info.transition === null` (the type in `schema/stepdeck.d.ts` says `Transition | undefined`; the code passes `null`). See [Animation and motion](../guide/animation-and-motion.md).

## Step references

A step reference names a step. It is used by `from`, `at`, `advance.start`, the `--step` option, the `?step=` query flag and the URL hash.

| Form | Meaning |
| --- | --- |
| integer >= 0 | the step at that 0-based index |
| non-empty string | the step with that `id` |

In a slide file, the type of the value decides: `1` is an index, `"1"` is a step id (and since step ids may not be digits only, `"1"` never matches). Prefer ids.

Values read from a URL (`?step=`, `#/<slide>/<step>`) go through `parseStepRef` ([`core/fold.js`](../../engine/core/fold.js)):

| Value | Result |
| --- | --- |
| missing or empty | step `0` |
| digits only, e.g. `"2"` | the number `2` (an index) |
| anything else | a step id |

The CLI's `--step` value is an index when it is all digits and less than the step count, and a step id otherwise. See [CLI](cli.md).

A reference to a step that does not exist throws `unknown step '<ref>' in slide '<id>'` in the fold. In a slide file `validate` reports it as `step-ref`, and it skips folding that slide's steps until the reference is fixed.

## advance

`advance` drives one prop through a list of values, one value per step. It is the usual way to build a component up step by step without a `set` in every step. From [`examples/kit/slides/tasks.js`](../../examples/kit/slides/tasks.js):

```js
{ id: "todo", region: "right", type: "list",
  props: { marker: "check", done: 0, items: [ /* four items */ ] },
  advance: { prop: "done", values: [0, 1, 2, 3, 4], start: "prompt" } },
// ...
steps: [{ id: "prompt" }, { id: "checked" }, { id: "fitted" }, { id: "drawn" }, { id: "written" }],
```

| Key | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `prop` | string, non-empty | yes | | The prop to set. |
| `values` | array, at least 1 item | yes | | The value for each step, starting at `start`. Any JSON value. |
| `start` | step ref | no | `0` | The step that gets `values[0]`. |

No other key is allowed (`unknown-key`).

The engine turns `advance` into `set: { <id>: { <prop>: values[j] } }` at step `start + j`. These patches are applied before the step's own patches, so an explicit `set` of the same prop in the same step wins at that step. Steps before `start` keep the element's `props` value. After the last value, the prop keeps that value, because `set` folds into later steps.

Values that would land past the last step are dropped at runtime. `validate` reports them as `advance-overflow`, with how many steps to add or values to remove.

## The slide title shortcut

A slide-level `title: "…"` string is shortcut for an element with the reserved id `title`:

```js
{ id: "title", type: "text", region: "title", props: { text: "…", accent: true } }
```

It is inserted before all other elements (after the kicker, when the slide has a `section`). It is a normal element, so steps can change it: `set: { title: { text: "A new title" } }`. Its `props.text` at each step is also reported as the state's `title` (`STEPDECK.state().title`), as written: the asterisks of an accent phrase and the backslashes of the escapes below are still in it.

The shortcut is skipped when the slide already has an element with id `title`. Then that element is the title, wherever it sits. Use your own `title` element when you need another type or region, or `from`/`at` on the title.

All five built-in layouts have a `title` region. A layout without one gets `unknown-region` for the shortcut.

### Accent phrase

In the title, `*phrase*` is an **accent phrase**: it renders as `<em class="sd-accent">phrase</em>`, in the theme's accent colour (the `.sd-accent` hook). It is not italic by default.

```js
title: "Analysing data with *an agent*",
```

- `\*` is a literal asterisk, and `\\` a literal backslash (so a title can end in one). A backslash before anything else stays as it is.
- An unmatched `*` stays literal, and `validate` warns `title-accent`. `**` is not markdown bold: it renders as two literal asterisks, and `validate` warns `accent-empty`.
- Only the slide's `title` and an explicit `text` element with id `title` are parsed. They get `accent: true` unless their own props say `accent: false`, which turns the parsing off (every `*` is then literal). A `markdown` title keeps markdown emphasis. Any other `text` element can opt in with `accent: true` (see [Text](components/text.md#accent-phrase)).
- Asterisks never show outside the element: the reveal placeholder and overview, `dump` and `check` text use the phrase without them. `STEPDECK.state().title` is the one raw copy.
- Values that a data binding puts into the title are escaped before parsing, so a bound `*` never creates a phrase.

## `section`: the kicker

A slide's `section: "Methods"` string is shortcut for a `text` element with the reserved id `kicker`:

```js
{ id: "kicker", type: "text", region: "title", props: { text: "Methods" } }
```

- It is inserted first, so it sits above the title in the `title` region. It is an ordinary `.sd-el`: `check` measures it (minimum font, contrast, region) and `dump` lists it. Steps can change it: `set: { kicker: { text: "Results" } }`.
- Its wrapper carries `data-el="kicker"` and the hook class `sd-kicker`. The theme styles it: `modern` draws a small uppercase label in the accent colour, `academic-light` a plain muted one. Its role is the default `body`; the hook sets its size, weight and tracking.
- It is drawn only where the layout has a `title` region. On a layout without one the kicker is dropped quietly (steps that set, replace, show or hide it are ignored there too), and `validate` warns `kicker-no-region`. A slide with a `section` and no `title` still gets its kicker.
- The id is reserved. An element of your own with id `kicker` is an error (`reserved-id`); the section is then not turned into a second element.
- An empty `section` makes no kicker.
- **Opt out for one slide** with a rule in the slide's `style`; the kicker then takes no room, and `dump` shows it as hidden:

  ```js
  style: '[data-el="kicker"] { display: none }',
  ```

  Without a `section` there is nothing to opt out of.
- On the `title` layout the kicker sits on the top margin of the cover. See [Layouts](layouts.md#title).

## Which rules check which key

`validate` (static, in Node) and `check` (in a browser) report problems under the rule names below. Every rule is described in [Rules](rules.md).

| Key | Rules |
| --- | --- |
| `deck.js` as a whole | `deck-load` (does not import, or no default object export), `unknown-key`, `spec-invalid` |
| `title` | `spec-invalid` (missing or empty) |
| `slides` | `spec-invalid` (missing, empty, duplicate, bad pattern), `slide-missing`, `path-case`, `slide-load`, `slide-id` |
| `lang` | `spec-invalid` (bad pattern) |
| `theme` | `unknown-theme`, `theme-palettes`, `theme-background`, `palette-contrast`, `palette-cvd` |
| `palette` | `unknown-palette`, `palette-contrast`, `palette-cvd` |
| `components` | `spec-invalid`, `component-collision`, `component-missing`, `path-case`, `component-schema` |
| slide `id` | `slide-id`, `spec-invalid` |
| slide `layout` | `unknown-layout` |
| slide `style` | `remote-url`, `style-import`; at runtime `check` measures the result |
| slide (any key) | `unknown-key` (a key the schema does not list) |
| slide `regions` | `spec-invalid` (key pattern, non-string value) |
| slide `title` (and a `text` title element) | `title-accent`, `accent-empty` (warnings) |
| slide `section`, element id `kicker` | `kicker-no-region` (warning), `reserved-id` |
| slide `notes`, `section`, `seconds` | `spec-invalid` (type only) |
| element `id` | `duplicate-id`, `spec-invalid` |
| element `type` | `unknown-component` |
| element `region` | `unknown-region` |
| element (any key) | `unknown-key` |
| element `box` | `spec-invalid` (missing key, `w` or `h` not > 0), `unknown-key` (extra key) |
| element `from`, `at` | `step-ref` |
| element `advance` | `step-ref` (`start`), `advance-overflow`, `spec-invalid` (empty `values`), `unknown-key` (extra key) |
| element `props`, at every step | `props-not-object`, `unknown-prop`, `prop-invalid`, `binding-file`, `binding-pointer`, `binding-format`, `file-missing`, `path-case`, `data-invalid`, `missing-column`, `remote-url`, `hex-color`, `diagram-id`, `diagram-overlap` |
| element `enter`, `exit`, `collapse` | `spec-invalid` (value only) |
| step `id` | `step-id-numeric`, `duplicate-step-id` |
| step `set`, `replace`, `show`, `hide`, `only` | `unknown-element`, `fold-error`, `props-not-object` |
| step (any key) | `unknown-key` |
| step as a whole | `noop-step` (warning) |
| step `transition` | `unknown-key` (a key other than `duration` or `stagger`), `spec-invalid` (negative number) |
| slide as a whole | `figure-source` (a `chart.*`, `map`, `map.*` or `big-number` element and no element whose own `props.role` is `"source"`; props set by steps do not count) |

`check` then renders every step and measures the result: `text-outside-canvas`, `text-outside-region`, `text-overlap`, `font-too-small`, `contrast`, `render-error`, `console-error`, `network-error`, `step0-shows-all`, and with `--played`, `played-mismatch`. See [Checking a deck](../guide/checking-a-deck.md).

## Inert keys

These keys are valid and pass `validate`, but nothing in the engine or the built-in components reads them today:

| Key | Where |
| --- | --- |
| `sections` | `deck.js` |
| `seconds` | slide |
| `enter`, `exit` | element |
| `transition.stagger` | step (passed to components; no built-in reads it) |

Setting them changes nothing on screen. They are reserved for later milestones.

## See also

- [The step model](../guide/step-model.md): how steps fold, with examples.
- [Layouts](layouts.md): regions and grid variables of each layout.
- [Components](components/index.md): props of each built-in component.
- [Rules](rules.md): every `validate` and `check` rule.
- [Runtime API](runtime-api.md): `window.STEPDECK`, query flags and URL hashes.
- [skill/references/step-model.md](../../skill/references/step-model.md): the agent version of the step model.
