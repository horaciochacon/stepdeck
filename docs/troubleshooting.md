# Troubleshooting and FAQ

This page maps the error messages and symptoms you can meet with stepdeck to their causes and fixes. It is for everyone who works on a deck: authors, presenters, contributors and agents. It is the catalogue of runtime error strings: the lines that appear on the canvas, in `STEPDECK.errors` and in `dump` output. Problems that `validate` and `check` report as named rules (`unknown-region`, `text-overlap`, …) are listed in [Rules](reference/rules.md). Most runtime errors below have a rule that catches the same mistake earlier, without a browser. The **Caught earlier by** column names it.

Every message on this page is copied from the code (`core/`, `cli/`). Where a message contains `<…>`, that part is filled in at run time.

## How to read an error

Runtime errors are plain strings, and the prefix tells you where the error comes from:

| Prefix | Comes from | Example |
|---|---|---|
| `deck: ` | Loading `deck.js`, the theme or the component list | `deck: deck.js lists no slides` |
| `stepdeck: ` | Boot and navigation (start slide, URL hash, shell) | `stepdeck: unknown slide 'intro' (slides: title, chart, closing)` |
| `<slide>: ` | One slide: its file, layout, fonts or step folding | `nolayout: layout 'figure-note' not found (…)` |
| `<slide>/<element>: ` | One element: its component, data or bindings | `broken/a: unknown component 'chart.lin'; did you mean 'chart.line'?` |

To see them:

- On the canvas, as a red-bordered box (`.sd-error`). A failed slide shows one box for the whole slide. A failed element shows its box in place of the element.
- In the browser console, as `STEPDECK.errors`. It holds the boot errors plus the errors of the slide on screen. In the reveal shell, a neighbouring slide's errors are not listed until you visit it.
- From the CLI, with `dump` (each step's `error:` lines) or `check` (rule `render-error`).

```sh
node cli/index.js dump my-talk --slide broken
```

```text
broken · step 0 (one)
  error: broken/b: unknown region 'side' in layout 'figure-notes' (regions: title, main, notes, footer)
  error: broken/a: unknown component 'chart.lin'; did you mean 'chart.line'?
  error: broken/c: data file not found: data/nope.json
  error: console: Failed to load resource: the server responded with a status of 404 (Not Found)
```

A `console: Failed to load resource … 404` line only repeats a missing file. The line above it names the real cause (here `data/nope.json`). `check` skips these console lines and reports the missing file as `network-error` instead. Other `console: …` lines and `pageerror: …` lines are script errors in a component or in the deck's own code. `check` reports those as [`console-error`](reference/rules.md#check-page-errors).

The first thing to run is always `validate`. It needs no browser and catches most of the mistakes on this page by rule name:

```sh
node cli/index.js validate my-talk
```

## Setup errors

These errors stop a CLI command before it checks anything. They exit with code 2.

On stderr every message below starts with `stepdeck: `. Under `--json`, the run errors (see the notes after the table) appear without the prefix, in `{ "error": "<message>" }`.

| Message | Cause | Fix |
|---|---|---|
| `Playwright not found. Install it (npm i -D playwright) or set STEPDECK_PLAYWRIGHT to a playwright package directory.` | `dump`, `check` and `shoot` drive Chrome through Playwright, which is not a stepdeck dependency. | Run `npm i -D playwright`, or point `STEPDECK_PLAYWRIGHT` at an existing `playwright` package folder. |
| `Playwright not found at STEPDECK_PLAYWRIGHT=<path>. …` | `STEPDECK_PLAYWRIGHT` is set, but no package is found there. | Set it to the `playwright` package folder itself, for example `…/node_modules/playwright`. |
| ``validate needs the repo's dependencies (Ajv): run `npm install` in <repo> first`` | `validate` is the only command that needs Ajv, and it is not installed. | Run `npm install` in the stepdeck folder that the message names. |
| ``deck at <dir> has no engine copy; run `stepdeck new` or copy the engine to <dir>/stepdeck/`` | A browser command was pointed at a deck outside the engine repo that has no `stepdeck/` folder. | Create decks with `stepdeck new`, which copies the engine. Or copy `core`, `components`, `layouts`, `themes`, `vendor` and `schema` from the repository's `engine/` into `<dir>/stepdeck/`. |
| `no deck.js in <dir>; pass the deck folder (the one holding deck.js)` | `validate` was given a folder that is not a deck (often the current folder, which is the default). | Pass the folder that holds `deck.js`. |
| `stepdeck: unknown command '<x>'` | A command name that the CLI does not have. | Use one of `help`, `new`, `new-component`, `catalog`, `serve`, `validate`, `dump`, `check`, `shoot`. |
| `stepdeck: unknown option <x>` | A flag that the CLI does not parse. | See [CLI](reference/cli.md) for the flags. |
| `stepdeck: unexpected argument <x>` | An extra positional argument, such as two deck folders. `new-component` and `catalog` take two; every other command takes one. | Pass one deck folder; quote paths that contain spaces. |
| `stepdeck: <flag> needs a value` | `--slide`, `--step`, `--size`, `--port` or `--template` with no value, or followed by another flag. | Give the value: `--slide chart`. |
| `stepdeck: --size must be a width in pixels, e.g. 960` / `--port must be a port number, e.g. 8000` | A non-integer, a `--size` under 160, or a port outside 0–65535. | Give a whole number. For `shoot`, use 1920, 1280 or 960. |
| `stepdeck: shoot --size must be 1920\|1280\|960` | `shoot` got a `--size` that is a valid width but not one of the three shot sizes, such as `800`. | Use 1920, 1280 or 960. |
| `--step needs --slide` | `--step` without `--slide`. | Add `--slide <id>`. |
| `validate does not take --step: it folds and checks every step of a slide; use --slide <id>` | `--step` on `validate`. | Use `--slide` only. Other commands print `<cmd> does not take --step (dump, check and shoot do)`. |
| `unknown step '<s>' in slide '<slide>' (steps: …)` | `--step` names a step that the slide does not have. | Use a step id from the list, or an index below the step count. |
| `unknown slide '<id>' (slides: …)` | `--slide` names a slide that `deck.js` does not list. | Use an id from the list. |

Two notes on output:

- Errors from argument parsing (unknown command, unknown option, an unexpected argument, a missing value, a bad `--size` or `--port`) always print usage text on stderr, even with `--json`. An invalid `shoot --size` prints only its own line on stderr, with no usage text and no JSON, even under `--json`. Errors that happen later in the run (the rest of the table) print `{ "error": "<message>" }` on stdout under `--json`.
- Flags that a command does not use are ignored without a message. Only `--step` is checked.

## Boot errors

Boot errors happen while the page loads the deck. A fatal one replaces the whole stage with a single error box; the others are recorded and the deck carries on.

| Message | Cause | Fix | Caught earlier by |
|---|---|---|---|
| `deck: deck must be same-origin with the page (got <origin>, page is <origin>); use a relative path` | `boot({ deckUrl })` points at another origin. The engine never imports a deck from another site. Fatal. | Use a relative `deckUrl`, or none (the page's own folder). | |
| `deck: cannot load <url>/deck.js: <reason>` | `deck.js` is missing, has a syntax error, or the page is opened from the wrong folder. `<reason>` is the browser's import error. Fatal. | Check that `deck.js` sits next to `index.html` (or wherever `deckUrl` points) and imports in Node: `node -e "import('./deck.js')"`. For `core/render.html`, `?deck=` defaults to `../../`. | [`deck-load`](reference/rules.md#validate-deck-rules) |
| `deck: deck.js lists no slides` | `slides` is empty or missing. Nothing is shown. | List at least one slide id. | [`spec-invalid`](reference/rules.md#validate-deck-rules) |
| `deck: theme '<t>' not found (HTTP 404 for …/themes/<t>/tokens.css)` | `theme` in `deck.js`, or `?theme=`, names a theme the engine does not have. The slides render without theme tokens. | Use `modern` or `academic-light` (the built-in themes), or add `themes/<t>/tokens.css` to the engine copy. | [`unknown-theme`](reference/rules.md#validate-deck-rules) |
| `deck: palettes of theme '<t>' not found (…)` | The theme has no readable `palettes.json`. Charts get no palette. | Add `themes/<t>/palettes.json`. | [`theme-palettes`](reference/rules.md#validate-deck-rules) |
| `deck: components/index.json not found (…)` | The engine copy is incomplete. No built-in component can load. | Copy the engine again (`stepdeck new` into a fresh folder shows the full set). | [`engine`](reference/rules.md#validate-deck-rules) |
| `stepdeck: unknown slide '<s>' (slides: …)` | `?slide=` names a slide that the deck does not list. Fatal. | Use an id from the list, or drop `?slide=`. | |
| `stepdeck: unknown shell '<x>' (available: bare, reveal)` | `boot({ shell })` got another value. The error is recorded in `STEPDECK.errors`, but nothing is drawn, so the page stays blank. | Use `"reveal"` (presenting, as in the `talk` template) or `"bare"`. | |
| `stepdeck: <message>` | An unexpected exception during navigation, recorded instead of thrown. | Read the message; it is usually one of the errors below. | |

## Slide errors

A slide that cannot load (`cannot load slide`) shows one error box and no elements. A layout or font error adds an error bar at the bottom of the canvas (`.sd-slide-error`), and the slide's elements still render. An unknown region is shown in the element's own box.

| Message | Cause | Fix | Caught earlier by |
|---|---|---|---|
| `<id>: cannot load slide: <reason>` | `slides/<id>.js` is missing or does not import. | Create the file, or fix its syntax. | [`slide-missing`, `slide-load`](reference/rules.md#validate-slide-rules) |
| `<id>: cannot load slide: slide file exports id 'X', expected '<id>'` | The file's `id` does not match its file name and its entry in `deck.js`. | Make all three the same. | [`slide-id`](reference/rules.md#validate-slide-rules) |
| `<id>: cannot load slide: slide file has no default export` | The file uses a named export, or exports something that is not an object. | Use `export default { id: "<id>", … }`. | [`slide-load`](reference/rules.md#validate-slide-rules) |
| `<id>: layout '<name>' not found (HTTP 404 for …/layouts/<name>/layout.css)` | `layout` names a layout that the engine does not have. The slide is drawn with no layout. | Use one of `title`, `figure-notes`, `full-bleed`, `statement`, `halves`. | [`unknown-layout`](reference/rules.md#validate-slide-rules) |
| `<slide>/<el>: unknown region '<name>' in layout '<layout>' (regions: a, b)` | An element's `region` is not a region of the slide's layout. The element is still drawn, in no region. | Use a region from the list, or give the element a `box`. | [`unknown-region`](reference/rules.md#validate-slide-rules) |
| `<id>: font '<family>' <weight> <style> failed to load (<urls>)` | A font file declared in the theme's `tokens.css` is missing or unreadable. The text is measured and drawn with a fallback font. If the line ends in `(no URL declared in the theme)`, the face has no `url()`. | Restore the font files under `themes/<theme>/fonts/`, or fix the `@font-face` URL. | `check` (`render-error`) |

## Fold errors

Folding turns a slide's steps into the state at one step. A fold error is reported for the slide and stops that step from being shown.

| Message | Cause | Fix | Caught earlier by |
|---|---|---|---|
| `<slide>: unknown step '<ref>' in slide '<slide>'` | A step reference that is neither a step id nor an index in range: `?step=` in the bare shell, a `from`, an `at` entry or an `advance.start`. | Use a step id, or a number below the step count. Step ids may not be all digits. | [`step-ref`](reference/rules.md#validate-slide-rules) |
| `<slide>: unknown element '<id>' in slide '<slide>' step '<step>'` | A step's `set`, `replace`, `show`, `hide` or `only` names an element id that the slide does not have. `<step>` is the step id, or its index when it has none. | Fix the id, or add the element. | [`unknown-element`](reference/rules.md#validate-per-step-rules) |

The CLI and the reveal shell resolve step references themselves, so you see longer forms of the same mistake there:

- CLI `--step`: `unknown step '7' in slide 'broken' (steps: one, two)`, exit 2.
- Reveal: `stepdeck: unknown step '<x>' in slide '<s>' (steps: …)`. See [Reveal hash errors](#reveal-hash-errors).

## Registry errors

The registry finds a component's folder by its `type`. Deck components (listed in `components` in `deck.js`) are looked up first, then built-ins.

| Message | Cause | Fix | Caught earlier by |
|---|---|---|---|
| `<slide>/<el>: unknown component '<n>'; did you mean '<x>'?` | `type` is not a built-in and not listed in `deck.js` `components`. The suggestion appears when a known name is close. | Fix the spelling, or add the deck component's name to `components`. `node cli/index.js catalog my-talk --json` (or the `catalog/index.json` it writes) lists every component; `catalog <name> my-talk` prints one entry. | [`unknown-component`](reference/rules.md#validate-slide-rules) |
| `<slide>/<el>: component '<n>' collides with built-in; use a namespace like 'my.<n>'` | A deck component has the same name as a built-in. | Rename it with a dot namespace (`stepdeck new-component` requires one). | [`component-collision`](reference/rules.md#validate-deck-rules) |
| `<slide>/<el>: <browser import error>`, for example `Failed to fetch dynamically imported module …` | The component is listed in `components`, but `components/<name>/index.js` is missing or does not import (a syntax error, a bad import). This is the browser's own message, not a stepdeck one. | Check that the folder name matches the component name exactly, and that `components/<name>/index.js` exists and has no syntax error. The browser console (or `dump`) shows the import error in full. | [`component-missing`](reference/rules.md#validate-deck-rules) when the whole folder (its `schema.json`) is missing; otherwise only `check` (`render-error`) |

## Data and binding errors

Data is loaded with `ctx.data(path)` and through bindings such as `{{data/summary.json#/latest_a|.1f}}`. Paths are relative to the deck folder. All of these errors fail one element. See [Data and bindings](guide/data-and-bindings.md) for the syntax.

| Message | Cause | Fix | Caught earlier by |
|---|---|---|---|
| `data path must be relative to the deck root: <p>` | The path starts with `/`, contains `\`, has a scheme (`https:`), or uses `..`. | Put the file inside the deck and use a path like `data/series.csv`. | [`remote-url`](reference/rules.md#validate-per-step-rules), for an `http:` or `https:` URL only. A leading `/`, a `\` or a `..` in a plain prop is not caught before run time. In a binding, a path with `..` or `\` counts as missing under [`binding-file`](reference/rules.md#validate-per-step-rules). |
| `data path may not contain '%': <p>` | A `%` in the path (it could encode `..`). | Rename the file. | |
| `data path must be a non-empty string: <p>` | An empty or non-string `data` prop. | Give the path. | |
| `unsupported data file type: <p> (use .json, .geojson or .csv)` | Any other extension. | Convert the file to one of the three. | |
| `data file not found: <path>` | The file does not exist, or the server could not read it. | Check the path and its case: a published server is case-sensitive even when your disk (and the local `serve`) is not; `validate`'s `path-case` catches it. | [`binding-file`, `file-missing`, `path-case`](reference/rules.md#validate-per-step-rules) |
| `invalid data file <path>: <reason>` | The JSON does not parse, or the CSV breaks a rule. The CSV reasons include `CSV row <n> has <k> cells but the header has <m>`, `CSV column "<c>" is declared number but row <r> has "<v>"`, `… declared date … (expected ISO 8601)` and `CSV has an unterminated quoted field`. | Fix the file. Rows with fewer cells than the header are padded; rows with more are an error. | [`data-invalid`](reference/rules.md#validate-per-step-rules) |
| `data pointer not found: pointer "<p>" in "<path>"` | The `#/pointer` part of a binding does not exist in the file. | Fix the pointer. `#` alone (`{{file.json#}}`) means the whole file. | [`binding-pointer`](reference/rules.md#validate-per-step-rules) |
| `invalid JSON pointer "<p>": it must be empty or start with "/"` | A pointer such as `#latest_a`. | Write `#/latest_a`. | [`binding-pointer`](reference/rules.md#validate-per-step-rules) |
| `invalid JSON pointer "<p>": "~" must be followed by 0 or 1` | A `~` in a pointer token that is not `~0` or `~1`. | Escape `~` as `~0` and `/` as `~1` in a key name. | [`binding-pointer`](reference/rules.md#validate-per-step-rules) |
| `cannot format <path>#<p> with "<f>": the value is <type>, not a number` | A format (`\|.1f`) applied to a string, null, array or object. | Point at a number, or drop the format. | [`binding-format`](reference/rules.md#validate-per-step-rules) |
| `bad format "<f>" in binding <path>#<p>: <reason>` | The format is not a valid d3-format string, for example `invalid format: bad`. | Use a d3-format spec such as `,.0f` or `.1%`. | [`binding-format`](reference/rules.md#validate-per-step-rules) |
| `binding <path>#<p> is an object and cannot be embedded in text` (or `is an array`, `is null`) | A binding to an object, array or null sits inside other text, as in `"n = {{data/summary.json#}}"`. | Point at a single value. Alone in the string (no surrounding text or spaces), a binding passes the raw value through instead. | [`binding-format`](reference/rules.md#validate-per-step-rules) |

A string with no `#`, such as `{{data/summary.json}}`, is not a binding. It is shown as written.

## Component errors

Each built-in component reports its own prop errors as `<slide>/<el>: <message>`. Most are also caught by [`prop-invalid`](reference/rules.md#validate-per-step-rules) and [`missing-column`](reference/rules.md#validate-per-step-rules) before a browser runs. The exact messages are on each component's page:

| Component | Page |
|---|---|
| `text` | [text](reference/components/text.md) |
| `markdown` | [markdown](reference/components/markdown.md) |
| `chart.line` | [chart.line](reference/components/chart-line.md) |
| `chart.bar` | [chart.bar](reference/components/chart-bar.md) |
| `big-number` | [big-number](reference/components/big-number.md) |
| `terminal` | [terminal](reference/components/terminal.md) |
| `list` | [list](reference/components/list.md) |
| `diagram` | [diagram](reference/components/diagram.md) |
| `chat` | [chat](reference/components/chat.md) |
| `timeline` | [timeline](reference/components/timeline.md) |
| `image` | [image](reference/components/image.md) |

The two charts share four table errors: ``<name> needs a `data` path``, `<data> is not a table (use a .csv file)`, ``<name> needs `<prop>` (a column name)`` and `column '<c>' not found in <data> (columns: …)`.

## Watchdog: did not settle within 10s

```text
<slide>/<element>: did not settle within 10s
```

The controller gives each element's `mount` and each `update` 10 seconds to finish. When one takes longer, the element is marked failed, its abort signal fires, and it gets no further updates. The rest of the slide carries on. A mount that finishes late is destroyed; a late update is ignored.

Causes, most likely first:

- A custom component whose `update` returns a promise that never resolves, for example one that waits for an animation event that never fires, or ignores `info.signal`.
- A component that waits on a resource that never answers.

Fix the component so that `update` always resolves, and resolves at once when `info.signal` aborts. See the [component contract](reference/component-contract.md).

## Nested component errors

A component that draws other components with `ctx.mount` can meet two more errors, both thrown by the child handle's `update`:

| Message | Cause | Fix |
|---|---|---|
| `ctx.mount('<type>'): update called on a destroyed child` | The parent called `update` on a child after destroying it. | Stop updating a child once it is destroyed; keep one handle per live child. |
| `ctx.mount('<type>'): child destroyed while its props resolved` | The child was destroyed while its props (for example a binding) were still loading. | Do not destroy a child while an `update` on it is pending, or ignore this error when the parent is being torn down. |

See [`ctx.mount`](reference/component-contract.md#ctxmounttype-el-props).

## Reveal hash errors

When you present, the reveal shell owns the URL hash `#/<slide>/<step>`. A bad hash is recorded in `STEPDECK.errors` and does not stop the talk.

| Message | When | What happens |
|---|---|---|
| `stepdeck: unknown slide '<s>' (slides: …) in the URL hash` | The hash names a slide the deck does not have. | On load, the deck opens as if there were no hash. While presenting, the talk stays where it is and the hash is written back. |
| `stepdeck: unknown step '<x>' in slide '<s>' (steps: …) in the URL hash` | The slide exists but the step does not. | On load, the slide opens at step 0. While presenting, the talk stays where it is. |
| `stepdeck: cannot decode '<hash>' in the URL hash` | The hash has a broken `%` escape. | The deck opens as if there were no hash. |
| `stepdeck: unknown step '<x>' in slide '<s>' (steps: …)` | `?step=` on load, or `STEPDECK.goTo` with a bad step. | On load, the slide opens at step 0. A refused `goTo` leaves everything where it is. |

Step ids in the hash are the ids from `STEPDECK.steps`. A step without an id is addressed by its index. See [Presenting](guide/presenting.md#the-hash-slidestep).

## Symptoms with no error

These look wrong but produce no error line, and `validate` passes.

### A chart is only 150px tall

A chart takes the height its region gives it. Only some layouts let a lone element fill its region: `figure-notes` main, both halves of `halves`, and the `figure` region of `title`, and only when the chart is the **only** element in that region. In `full-bleed` main and in `statement` main, a chart is 150px tall even on its own. It is also 150px tall in `figure-notes` main when a source line shares the region.

Fix: use `figure-notes` or `halves`, keep the chart alone in its region, and put the source line in `footer`. No rule catches this, so look at a shot (`node cli/index.js shoot my-talk --slide chart`). See [Give figures room](guide/layouts-and-themes.md#give-figures-room). `diagram`, `image` and `terminal` fill their region even when they share it; the two charts do not. The exception is `statement` main: that region has no set height, so these three collapse there too.

### Nothing animates

Motion plays only when all of these hold:

- You move **forward by exactly one step**. A jump, a step back and the first step shown all show the end state with no motion. A hash change or `STEPDECK.goTo` animates only when it happens to land on the next step, and otherwise snaps. This is by design: a played step must look the same as a jumped-to step.
- The OS does not ask for reduced motion. With `prefers-reduced-motion: reduce`, steps snap. Add `?motion=full` to the URL to animate anyway.
- The page is not a capture (`?capture`) and not a presenter preview frame. Both never animate. The CLI loads pages with `?capture` for `dump` and `shoot`.

`STEPDECK.flags.motion` and `STEPDECK.flags.animate` tell you which applies. A step whose `transition.duration` is `0` also snaps. See [When motion plays](guide/animation-and-motion.md#when-motion-plays) and [Reduced motion](guide/presenting.md#reduced-motion).

### `section`, `sections`, `enter`, `exit` or `seconds` do nothing

They are accepted by the schema and by `validate`, but nothing reads them yet: slide `section`, deck `sections`, element `enter` and `exit`, and slide `seconds`. Each component decides its own entry motion. See [Deck and slide](reference/deck-and-slide.md).

### A `slide.regions` value is ignored

`slide.regions` sets CSS custom properties on the canvas. A key that does not start with `--` is rejected by `validate` (`spec-invalid`). A well-formed key with the wrong name, such as `--note-width` instead of `--notes-width`, passes every check and does nothing. Compare the key with the variables on the layout's page in [Layouts](reference/layouts.md).

### `highlight` on a `chart.line` dims every series

`chart.line` dims every series whose name is not `highlight`. A misspelled or unknown name therefore dims all of them, with no error. Unknown names in `series_shown` are also skipped silently. `chart.bar` reports an unknown name in its `highlight` or `shown` as an error. Check the series names against the CSV.

### A `title` slide has two columns, but the figure is not visible yet

The `title` layout switches to two columns as soon as its `figure` region holds any element, including one that is hidden until a later step. The empty column is the hidden figure's space. Put the figure in from the first step, or move it to another slide. See [The title layout's figure column](guide/layouts-and-themes.md#the-title-layouts-figure-column).

## FAQ

### Can I export a PDF?

Not yet. There is no `pdf` command. To hand out the slides, export PNGs of every step with `shoot` (into `shots/<size>/`), or share the deck folder itself.

```sh
node cli/index.js shoot my-talk --size 1920
```

### Are there other themes?

Two are built in: `modern` (the default) and `academic-light`. A deck chooses one with `theme` in `deck.js`, and `?theme=<name>` overrides that for one page load (`check`, `dump` and `shoot` take `--theme <name>`). To make your own, copy `themes/modern/` in the deck's engine copy under a new name and keep every token name. See [Themes](reference/themes.md).

### Can I present offline?

Yes. Reveal.js, the fonts and the Markdown renderer are vendored in the engine copy, and the deck's data lives in the deck folder. Run `serve` on the presentation machine; nothing is fetched from the network. `check` blocks every non-local request and reports it as `network-error`, so a deck that passes `check` needs no network. See [No network needed](guide/presenting.md#no-network-needed).

### Can a deck be in Spanish?

Yes. Set `lang: "es"` in `deck.js` (or `?lang=es` for one load). Numbers then use the Spanish locale (`,` for decimals, `.` for thousands, ` €` as the currency suffix), and the built-in labels translate, for example `IC 95%` in `big-number`. Palette color names have Spanish forms too. The project README is available in Spanish as [README.es.md](../README.es.md). The [skill](../skill/SKILL.md) for agents is written in English only.

## See also

- [Rules](reference/rules.md): every `validate`, `check` and `catalog` rule.
- [Checking a deck](guide/checking-a-deck.md): the workflow for `validate`, `check`, `dump` and `shoot`.
- [CLI](reference/cli.md): every command, flag and exit code.
- [Runtime API](reference/runtime-api.md): `STEPDECK.errors`, `flags` and `state()`.
- [Agent skill](../skill/SKILL.md): the same checks, written for agents.
