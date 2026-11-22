# Command line

This page lists every command of the stepdeck CLI, with its positionals, flags, defaults, output, `--json` shape and exit codes. It is for people who write decks by hand, for agents that drive the CLI, and for anyone wiring stepdeck into CI. For a walk through checking a deck, read [Checking a deck](../guide/checking-a-deck.md). For what each rule means and how to fix it, see [Rules](rules.md). Agents follow [skill/references/checks.md](../../skill/references/checks.md).

The CLI is development tooling only. A deck needs none of it to be presented.

## Run the CLI

```sh
node cli/index.js <command> [deckDir] [options]
```

`cli/index.js` is also the package's `stepdeck` bin, so `stepdeck <command>` does the same thing when that bin is on your `PATH`. Node 20 or later is required (`engines` in `package.json`).

- **`deckDir`** is the deck folder (the one holding `deck.js`). It defaults to the current folder.
- **Engine lookup.** A deck made by `new` holds its own engine copy in `<deck>/stepdeck/` (detected by `stepdeck/core/render.html`). Commands use that copy when it exists, and the engine in this repository (`engine/`) otherwise.
- **Browser commands** (`serve`, `dump`, `check`, `shoot`) serve the deck over HTTP. A deck with an engine copy is served from its own folder. A deck without one must be inside this repository (the examples and test fixtures are), and is served from the repository root. Anything else is refused, so no folder above the deck is ever served:

  ```
  stepdeck: deck at /path/to/outside has no engine copy; run `stepdeck new` or copy the engine to /path/to/outside/stepdeck/
  ```

  `validate`, `catalog` and `new-component` read files in Node. They work on such a deck too, using this repository's engine.

The commands at a glance:

| Command | Needs a browser | What it does |
| --- | --- | --- |
| [`help`](#help) | no | Prints usage. |
| [`new`](#new) | no | Creates a deck from a template, with the engine copied in. |
| [`new-component`](#new-component) | no | Adds a deck component from the component template. |
| [`catalog`](#catalog) | no | Writes the catalog of components, layouts and themes, or prints one entry. |
| [`boundaries`](#boundaries) | no | Fetches one country's open admin boundaries from geoBoundaries into a deck (needs the network). |
| [`serve`](#serve) | no (you open it in one) | Serves the deck locally with no caching. |
| [`validate`](#validate) | no | Checks schemas, steps, props at every step, data and paths in Node. |
| [`dump`](#dump) | yes | Per step: elements, visibility, boxes, text, resolved props, what changed. |
| [`check`](#check) | yes | Per step: layout, font size, contrast and page errors; with `--played`, played versus jumped. |
| [`shoot`](#shoot) | yes | One PNG per step. |

There is no `pdf` command yet; it is planned.

## Options

| Option | Value | Used by | Default |
| --- | --- | --- | --- |
| `--json` | none | every command except `help` | text output |
| `--slide <id>` | a slide id | `validate`, `dump`, `check`, `shoot` | every slide |
| `--step <ref>` | a step id, or a step index | `dump`, `check`, `shoot` (needs `--slide`) | every step |
| `--size <n>` | an integer of at least 160 | `dump`, `check`, `shoot` | 1920 for `dump` and `check`, 960 for `shoot` |
| `--theme <name>` | a theme folder name | `dump`, `check`, `shoot` | the deck's own theme |
| `--played` | none | `check` | off |
| `--template <t>` | a template name | `new` | `talk` |
| `--port <n>` | an integer from 0 to 65535 | `serve` | 8000 (0 picks a free port) |
| `--deck <dir>` | a deck folder | `boundaries` | the current folder |
| `--out <path>` | a file path | `boundaries` | `<deck>/data/<iso3>-adm<n>.geojson` |
| `--full` | none | `boundaries` | the simplified geometry |
| `--precision <n>` | a whole number from 0 to 10 | `boundaries` | 4 |
| `-h`, `--help` | none | any position | |

Rules that apply to every command:

- **`--size n`** sets the browser viewport to `n` x `round(n * 9 / 16)`. Boxes are still reported in canvas pixels (1920 x 1080). `shoot` takes only 1920, 1280 or 960.
- **`--theme name`** runs the browser command under another theme: it adds `?theme=<name>` to every page the command loads, so it wins over `deck.theme`. Use it to check a deck under both built-in themes (`--theme modern`, `--theme academic-light`) without editing `deck.js`. The name is checked before any browser starts, against the engine the deck loads: it must be lowercase letters, digits and hyphens, and name a folder of `themes/` that holds `tokens.css`. Otherwise the command exits 2 with `unknown theme '<name>'; themes: …` (with a did-you-mean when it is close) or `--theme '<name>' is not a theme name (lowercase letters, digits and hyphens)`. `validate` has no `--theme`: it checks the deck's own theme.
- **`--step`** is resolved per slide. A value made only of digits that is less than the slide's step count is an index. Anything else is matched against the step ids. A slide with no steps has one step, `0`. See [Deck and slide spec](deck-and-slide.md) for step references.
- **`--step` scope.** `--step` without `--slide` fails with `--step needs --slide`. Commands other than `dump`, `check`, `shoot` and `help` refuse `--step` (`help` ignores it). `validate` says `validate does not take --step: it folds and checks every step of a slide; use --slide <id>`; the others say `<command> does not take --step (dump, check and shoot do)`.
- **Unused flags are ignored.** A command silently ignores a flag it does not use, except `--step`. For example, `validate --played --port 3 --size 999` runs a normal `validate`.
- **Positionals.** `new-component`, `catalog` and `boundaries` take two positionals; every other command takes one. An extra one is a parse error. For `boundaries` they are the country and the level, and the deck folder is `--deck`.
- **Parse errors** print `stepdeck: <message>`, a blank line and the usage text to stderr, and exit 2. This happens even with `--json`; stdout stays empty. The parse errors are:
  - `unknown option <x>`;
  - `<flag> needs a value` (the value is missing or starts with `--`);
  - `--port must be a port number, e.g. 8000`;
  - `--size must be a width in pixels, e.g. 960`;
  - `unexpected argument <x>`.

  An unknown command (`stepdeck: unknown command '<x>'`) and a missing command also print the usage to stderr and exit 2.

## Exit codes and errors

| Code | Meaning |
| --- | --- |
| `0` | The command ran and found nothing to fail on. |
| `1` | The command ran and found problems. |
| `2` | Usage error, or a run that could not complete: no deck, unknown slide or step, Playwright or Ajv missing, a deck that never became ready, a port that cannot be bound. |

What counts as a problem depends on the command:

| Command | Exit 1 when |
| --- | --- |
| `validate` | any problem has severity `error`. Warnings alone exit 0. |
| `check` | any problem is reported. |
| `dump` | any dumped step has a non-empty `errors` list. |
| `shoot`, `catalog`, `new`, `new-component`, `boundaries`, `serve` | never: they exit 0 on success. `shoot` exits 0 even when a slide shows an error; run `check` to catch that. `catalog` problems are warnings. |

A run that fails after the arguments were parsed exits 2. It prints `stepdeck: <message>` to stderr, or with `--json` this on stdout:

```json
{
  "error": "unknown slide 'nope' (slides: title, chart, closing)"
}
```

This covers errors such as `--step needs --slide`, `new needs a folder: stepdeck new <dir>` and `catalog takes one name (got a, b)`. There are two exceptions: an unknown command (usage on stderr, see above) and an invalid `shoot --size`, which writes `stepdeck: shoot --size must be 1920|1280|960` to stderr and exits 2, with no JSON.

## Problem lines

`validate` and `check` report problems in one shape (`cli/problems.js`):

```json
{ "slide": "chart", "element": "chart", "step": null, "rule": "figure-source",
  "measured": "…", "limit": "…", "fix": "…" }
```

- `slide`, `element` and `step` say where the problem is. Each is `null` when it does not apply. `step` is the step's id, or its index as a string when the step has no id.
- `measured` and `limit` are what was found and what was expected. `fix` is one suggested fix. All three are strings.
- `validate` adds `severity`: `"error"` or `"warning"`.

As text, a problem is one line:

```
<slide>/<element>/<step> · <rule> · <measured> vs <limit> · <fix>
```

Missing location parts are left out. A deck-wide problem starts with `deck`. Every rule name is listed in [Rules](rules.md).

## help

```sh
node cli/index.js help
```

Prints the usage text to stdout and exits 0. `-h` and `--help` do the same in any position, for example `node cli/index.js validate -h`. `help` ignores `--json`.

## new

Creates a deck folder from a template and copies the engine into it.

```sh
node cli/index.js new <dir> [--template talk]
```

| Argument | Required | Default | Notes |
| --- | --- | --- | --- |
| `<dir>` | yes | | A new or empty folder. It is created if needed. |
| `--template` | no | `talk` | A folder of `templates/` that holds an `index.html`. `talk` is the only one today. |

`new` copies the template into `<dir>`. It then copies the engine into `<dir>/stepdeck/`: `core`, `components`, `layouts`, `themes`, `vendor`, `schema`, `LICENSE` and `THIRD_PARTY_NOTICES.md`. It skips `.DS_Store`, `Thumbs.db`, `shots`, `catalog` and `node_modules`. The CLI, tests, docs and examples are not copied.

Text output (the CLI path is shown here as `/path/to/stepdeck`; the real output prints the absolute path of your copy, so the lines can be pasted as they are):

```
created my-talk (template talk; engine copied to stepdeck/)

next:
  the deck already works: slides/chart.js, slides/closing.js, slides/title.js;
  edit them, or delete a slide file and its id in deck.js `slides`; add slides as slides/<id>.js
  node /path/to/stepdeck/cli/index.js serve /abs/my-talk  # present: open the URL it prints (index.html, reveal shell)
  node /path/to/stepdeck/cli/index.js validate /abs/my-talk  # in Node: schemas, props at every step, data, paths
  node /path/to/stepdeck/cli/index.js check /abs/my-talk --played  # in Chrome: layout, fonts, contrast, errors, played vs jumped
  node /path/to/stepdeck/cli/index.js shoot /abs/my-talk  # PNGs per step in shots/960/; look at them
  node /path/to/stepdeck/cli/index.js catalog /abs/my-talk  # what components, layouts and themes exist (catalog/index.json)
```

`--json` prints `{ "dir", "template", "engine", "next" }`: the absolute deck folder, the template name, the absolute engine copy folder and the `next` lines as an array of strings.

Errors (exit 2):

| Message | Cause |
| --- | --- |
| `new needs a folder: stepdeck new <dir>` | No `<dir>`. |
| `<absolute dir> is not empty; pass a new or empty folder` | The folder exists and holds files. The message shows the resolved absolute path, not the argument as typed. |
| `unknown template '<t>' (templates: talk)` | `--template` names no template. |

## new-component

Adds a deck component, `components/<name>/`, from the component template.

```sh
node cli/index.js new-component <name> [deckDir]
```

The name comes first and the deck folder second. `deckDir` defaults to the current folder.

The name must be namespaced: lowercase letters, digits and dashes in dot-separated parts, such as `my.badge` (regex `^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$`). It must not be a built-in component of the deck's engine.

`new-component` copies `templates/component/{index.js, schema.json, example.js, README.md}` into the deck. In each file it replaces `__NAME__` with the name and `__ID__` with a slide id made from it (`my-badge-example`). Then it adds the name to `components` in `deck.js` when the edit is safe: either `components` is one literal array of strings, or there is no `components` key and exactly one `slides:` line to insert it before. The edited `deck.js` is imported again and the edit is reverted if the result is not the old deck plus the name. When it cannot edit safely, it leaves `deck.js` alone and prints the line to add.

Text output:

```
created my-talk/components/my.badge/ (index.js, schema.json, example.js, README.md)
added "my.badge" to components in deck.js
try it: copy my-talk/components/my.badge/example.js to slides/, add its id to slides in deck.js, then
  node /path/to/stepdeck/cli/index.js validate /abs/my-talk
  node /path/to/stepdeck/cli/index.js check /abs/my-talk --played
```

When `deck.js` was not edited, the second line is `deck.js not edited: add "<name>" to components in deck.js: components: ["<name>"]`.

`--json` prints `{ "dir", "name", "files", "deckUpdated", "line" }`. `files` lists the four absolute paths. `line` is `null` when `deckUpdated` is `true`.

Errors (exit 2):

| Message | Cause |
| --- | --- |
| `new-component needs a name: stepdeck new-component my.thing [deckDir]` | No name. |
| `no deck.js in <dir>; run new-component in a deck folder (or pass it)` | The folder is not a deck. |
| `'<name>' needs a namespace, e.g. 'my.<name>' (…)` | The name has no dot. |
| `'<name>' is not a component name: use lowercase letters, digits and dashes in dot-separated parts, e.g. 'my.chart'` | The name breaks the pattern. |
| `'<name>' is a built-in component; pick another namespace, e.g. 'my.<last part>'` | The name is a built-in. |
| `components/<name>/ already exists` | The folder is there already. |

Writing the component is covered in [Custom components](../guide/custom-components.md).

## catalog

Lists the components, layouts and themes a deck can use. Agents read the catalog instead of the engine source.

```sh
node cli/index.js catalog [name] [folder]
```

Both positionals are optional and may come in either order. An argument is taken as the folder when it holds `deck.js` or `components/index.json`, or is the repository root; the other one is the entry name. Without a folder, the current folder is used.

**What is read and written:**

| Folder | Reads | Writes |
| --- | --- | --- |
| A deck (`deck.js`) | The deck's engine (its `stepdeck/` copy, else this repository's `engine/`), then the deck's own `components` | `<deck>/catalog/` |
| The repository root | The repository's `engine/` | `<repo>/catalog/` |
| An engine (`components/index.json`), such as `engine/` | The engine | `<engine>/catalog/` |
| Anything else | | Exits 2: `<dir> is neither a deck (deck.js) nor the stepdeck engine (components/index.json); pass the deck folder` |

So running `catalog` with no folder from the repository root writes `<repo>/catalog/`. That folder is git-ignored.

Built-in components come from `components/index.json` and deck components from `deck.js` `components`. Layouts are the folders of `layouts/` holding `schema.json`; themes are the folders of `themes/` holding `tokens.css`. Only data files are read: component code is never imported.

**Without a name**, `catalog` rewrites the output folder. It first removes every `*.json` file in it (nothing else), then writes `index.json` (the entries) and one `<name>.json` per entry (the detail). It does this with `--json` too.

```
catalog: 13 components, 5 layouts, 2 themes -> my-talk/catalog/index.json
```

Any catalog problems come first, as `warning: <problem line>`. With `--json`, stdout holds only the entries array, and the problems are dropped. They are not printed at all.

**With a name**, `catalog` prints that one entry and writes nothing. The text form lists the props of a component (transition, required or optional, description, examples), the regions and variables of a layout, or the tokens and palettes of a theme. A component's text also says who plays its entrance, in an `enter:` line under the summary: `enter: own (the component builds its own entrance; its box stays still)` or `enter: box (the element's box moves in)`:

```
halves · layout
Two halves side by side under a title band, with a footer line: before and after, prompt and tasks.

regions:
  title  Title band across the canvas (the slide's `title` sugar goes here).
  left  The left half. A single element fills the half's height.
  right  The right half. A single element fills the half's height.
  footer  Footer line across the canvas, typically a source line.

variables (slide `regions`):
  --split: 1fr 1fr  Column tracks of the two halves, for example `2fr 1fr`.
  --gutter: var(--sd-region-gap)  Space between the two halves.
  --align: start  Vertical alignment of each half's content: `start`, `center` or `end`. A single element still fills its half; its content moves inside it.

example: layouts/halves/example.js
```

With `--json` it prints the detail object. An unknown name exits 2:

```
stepdeck: no catalog entry 'chart.lin'; did you mean 'chart.line'? (entries: text, chart.line, …)
```

More than one name exits 2 with `catalog takes one name (got a, b)`.

**Entry** (`index.json`, and `--json` without a name). Entries are sorted by kind (component, layout, theme), then by name:

```json
{
  "kind": "component",
  "name": "big-number",
  "summary": "One large figure with an optional label and 95% interval.",
  "animates": ["value", "label", "ci"],
  "enter": "own"
}
```

| Field | Meaning |
| --- | --- |
| `kind` | `"component"`, `"layout"` or `"theme"`. |
| `name` | The entry name, also the file name `<name>.json`. |
| `summary` | The first sentence of the component schema's `description`, the layout's `description`, or the first paragraph of the theme's README. |
| `animates` | Props whose `x-transition` is not `snap`. Always `[]` for layouts and themes. |
| `enter` | `"own"` when the component's schema declares a top-level `"x-enter": "own"`: it builds its own entrance and its box stays still. Otherwise `"box"`: the element's box moves in. Always `"box"` for layouts and themes. See [Animation and motion](../guide/animation-and-motion.md#which-system-plays-an-entrance). |

**Detail** (`<name>.json`, and `catalog <name> --json`) is the entry plus:

| Kind | Extra fields |
| --- | --- |
| component | `origin` (`"built-in"` or `"deck"`), `description`, `required` (prop names), `props`, `readme` (README text or `null`), `example` (for example `"components/chart.bar/example.js"`, or `null`) |
| layout | `description`, `regions` (`[{ name, description }]`), `variables` (`[{ name, default, description }]`), `readme`, `example` (`"layouts/<name>/example.js"` or `null`) |
| theme | `description`, `tokens` (every `--name: value` in the `:root` blocks of `tokens.css`), `palettes` (the parsed `palettes.json`, or `null`), `readme` |

Each entry of a component's `props` is `{ required, "x-transition", description, examples, default?, schema }`. `schema` is the prop's JSON Schema without `description`, `examples`, `x-transition` and `default` (a default is given as the `default` field instead). An `example` path is relative to the engine root for built-ins and to the deck for deck components.

Catalog problems are warnings and never change the exit code:

| Rule | When |
| --- | --- |
| `catalog-schema` | A component schema has no top-level `description`; a prop lacks `description`, `examples` or an `x-transition` of `tween`, `draw`, `fade` or `snap`; a top-level `x-enter` is neither `"own"` nor `"box"`; a `schema.json` or `palettes.json` cannot be read; a theme README has no first paragraph. |
| `catalog-name` | A component, layout or theme shares its name with an entry of another kind. The later one is left out. |

## boundaries

Fetches one country's admin boundaries from [geoBoundaries](https://www.geoboundaries.org/) and writes them into a deck, for a map.

```sh
node cli/index.js boundaries <ISO3> <ADM0-ADM5> [--deck dir] [--out path] [--full] [--precision n]
```

This is for a project that has no boundaries yet. Most projects build their own boundaries, in R or Python, with their own region ids; use those when you have them. The command runs once, when you author the deck, and is the only one that needs the network. Presenting never does.

- **`<ISO3>`** is the country's three-letter ISO code, in any case: `URY`, `ury`.
- **The level** is `ADM0` to `ADM5` (country, then the admin levels below it), or just `0` to `5`. Not every country has every level.
- **`--deck <dir>`** is the deck folder, default the current folder. The file goes to `<dir>/data/<iso3>-adm<n>.geojson`, in lower case (`data/ury-adm1.geojson`). The `data/` folder is created if it is missing. The deck folder need not exist yet.
- **`--out <path>`** writes there instead (relative to where you run the command). The source file goes next to it.
- **`--full`** downloads the full-resolution geometry (`gjDownloadURL`) instead of the simplified one (`simplifiedGeometryGeoJSON`). A full file can be well over the map's limits; the simplified one is what a talk usually wants.
- **`--precision <n>`** rounds coordinates to `n` decimals (default 4, about 10 m). Points that become the same after rounding are collapsed, rings stay closed, a ring left with fewer than 4 positions is dropped, and a polygon whose outer ring is dropped goes with it. A region left with no polygon is left out of the file, and the command says so.

What it does:

1. Asks `https://www.geoboundaries.org/api/current/gbOpen/<ISO3>/ADM<n>/` (the gbOpen release) which files exist and under which licence.
2. Downloads the geometry the answer names, following redirects, and rewrites it as above. Each feature keeps its properties as geoBoundaries gives them: `shapeName`, `shapeISO`, `shapeID`, `shapeGroup`, `shapeType`. A map names its region id (`id: "shapeISO"`), or you join your own data on one of them.
3. Writes the GeoJSON, and next to it `<same name>.source.json` holding `boundaryID`, `boundarySource`, `boundaryLicense`, `licenseDetail`, `licenseSource`, `boundaryYearRepresented`, `buildDate` and `url` (the file that was downloaded). A field the API leaves out is written as `null`. Both files are first written to temporary files beside their final paths and only then moved into place (the source file first), so a failed write leaves any existing pair as it was.

**Licences differ from one boundary to the next.** gbOpen holds open licences only (public domain, CC0, CC BY, ODbL), but which one applies is for the boundary you fetched, so the command prints it and keeps it in the source file. Check it against how you will publish the deck, and keep the credit it asks for.

**Text output.**

```
wrote data/xyz-adm1.geojson (2 regions, 10 points) and data/xyz-adm1.source.json
licence: Creative Commons Attribution 4.0 International (CC BY 4.0)
source line: Boundaries: geoBoundaries, Xyzland National Mapping Office (Creative Commons Attribution 4.0 International (CC BY 4.0)).
```

The source line is a suggestion for the slide's source `text` element. A warning follows when the file is over a map limit (more than 5,000 regions, or more than 250,000 points), with a `mapshaper -simplify` command to try:

```
warning: data/xyz-adm2.geojson: 6,000 regions is over the map's limit of 5,000; simplify it, for example: mapshaper data/xyz-adm2.geojson -simplify 10% -o data/xyz-adm2.geojson
```

The file is still written, but a map refuses a file over these limits when it loads it.

**An existing file is replaced.** The command overwrites its output and the source file beside it, and says so: `replaced data/ury-adm1.geojson` (one line per file). Under `--json` they are listed in `replaced`.

**`--json`** prints `{ file, sourceFile, regions, points, license, sourceLine, warnings, replaced }`, with absolute paths.

**Exit codes.** 0 when the files were written, warnings or not. 2 when the run cannot complete, with `stepdeck: <message>` (or `{ "error": … }` under `--json`):

| Message | When |
| --- | --- |
| `boundaries needs a country and a level: stepdeck boundaries URY ADM1` | A positional is missing. |
| `<level> is not an admin level (use ADM0 to ADM5)` | The level is not `ADM0` to `ADM5` or `0` to `5`. |
| `<code> is not a country code (three letters, for example URY)` | The country is not three letters. |
| `precision must be a whole number from 0 to 10` | `--precision` is anything else. |
| `geoBoundaries has no gbOpen ADM2 for XYZ` | The API has no such country or level (HTTP 404). |
| `could not reach geoBoundaries (<cause>)` | No network, a timeout, or an HTTP error other than 404. |
| `geoBoundaries answered something stepdeck cannot read: <what>` | The answer is not JSON, lacks the file's URL (or it is not `https:`), the source or the licence, or the file is not a FeatureCollection. |

## serve

Serves a deck so you can present it.

```sh
node cli/index.js serve [deckDir] [--port n]
```

The server listens on `127.0.0.1` only, at `--port` (default 8000; `0` picks a free port). It serves the folder chosen as described in [Run the CLI](#run-the-cli): the deck itself when it has an engine copy, otherwise the repository root. Without an engine copy, a deck outside the repository is refused (exit 2).

```
serving /abs/my-talk
present: http://127.0.0.1:8000/
(Ctrl-C to stop)
```

The `present:` URL is the server URL plus the deck's path under the served root. For a deck in this repository, such as `examples/kit`, it ends in `/examples/kit/`. Open it to get the deck's `index.html`.

`--json` prints `{ "url", "root", "port" }`, then keeps running:

```json
{
  "url": "http://127.0.0.1:63158/examples/kit/",
  "root": "/path/to/stepdeck",
  "port": 63158
}
```

The server runs until it gets SIGINT (Ctrl-C) or SIGTERM, then exits 0. If it cannot listen (port taken, or not allowed), it exits 2 with the system error, for example `stepdeck: listen EACCES: permission denied 127.0.0.1:1`.

Responses:

| Request | Status | Body |
| --- | --- | --- |
| A file under the root | 200 | The file, with `Content-Type` from the table below and `Content-Length`. |
| A folder | 200 or 404 | Its `index.html`, or 404 when it has none. There are no folder listings. |
| A path that resolves outside the root | 403 | `forbidden` |
| A path that is not valid percent-encoding | 400 | `bad request` |
| A missing file | 404 | `not found` |
| A method other than `GET` or `HEAD` | 405 | `method not allowed` |

Every response, errors included, carries `Cache-Control: no-store`, so a reload never shows a stale module.

| Extension | Content-Type |
| --- | --- |
| `.html` | `text/html; charset=utf-8` |
| `.js`, `.mjs` | `text/javascript; charset=utf-8` |
| `.json` | `application/json; charset=utf-8` |
| `.geojson` | `application/geo+json; charset=utf-8` |
| `.csv` | `text/csv; charset=utf-8` |
| `.css` | `text/css; charset=utf-8` |
| `.txt` | `text/plain; charset=utf-8` |
| `.md` | `text/markdown; charset=utf-8` |
| `.woff2` | `font/woff2` |
| `.svg` | `image/svg+xml` |
| `.png` | `image/png` |
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.mp4` | `video/mp4` |
| anything else | `application/octet-stream` |

Presenting is covered in [Presenting](../guide/presenting.md).

## validate

Checks a deck in Node, with no browser.

```sh
node cli/index.js validate [deckDir] [--slide id] [--json]
```

`validate` checks `deck.js` and every slide (or only `--slide`). It covers the deck and slide schemas, the theme and palettes, components and layouts, step references, and every element's props at every step: bindings, data files, CSV columns, paths, remote URLs, hex colors and component schemas. It also lints: a figure needs a source line, and a step that changes nothing is a warning. Each problem is reported once, at the first step where it appears. Every rule is in [Rules](rules.md).

`validate` needs Ajv, a dev dependency of this repository, which it imports only when it runs. The other commands work without `npm install`. Without Ajv, it exits 2 with:

```
stepdeck: validate needs the repo's dependencies (Ajv): run `npm install` in /path/to/stepdeck first
```

**Text output.** Error lines come first, then warnings prefixed with `warning: `, then a summary line. The slide count is the number of slides checked.

```
chart/chart · figure-source · chart (chart.line), latest (big-number) without a source vs an element with role: "source" · add { id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: …" } }
warning: chart/again · noop-step · same elements, props and visibility as the previous step vs a step changes something on screen · merge step 'again' into the previous step (move its notes there), or give it a patch
validate: 3 slides, 1 error, 1 warning
```

A clean deck prints only `validate: 3 slides, 0 errors, 0 warnings`.

**`--json`** prints an array of problems, each with `severity`, in the order they were found (errors and warnings are not regrouped). A clean deck prints `[]`. The summary counts are not in the JSON.

```json
[
  {
    "slide": "chart",
    "element": null,
    "step": "again",
    "rule": "noop-step",
    "measured": "same elements, props and visibility as the previous step",
    "limit": "a step changes something on screen",
    "fix": "merge step 'again' into the previous step (move its notes there), or give it a patch",
    "severity": "warning"
  }
]
```

**Exit codes.** 1 when any problem has severity `error`; 0 when there are none, warnings included. A `deck.js` that does not import is reported as the problem `deck-load` (exit 1). Exit 2 when the run cannot start:

- `no deck.js in <dir>; pass the deck folder (the one holding deck.js)`;
- `unknown slide '<id>' (slides: …)`;
- Ajv is missing.

## dump

Reports, per step, what is on the canvas. It is meant for agents without vision and for cheap diffs between steps.

```sh
node cli/index.js dump [deckDir] [--slide id] [--step ref] [--size n] [--theme name] [--json]
```

Each step is a fresh page load of the bare shell at that step in capture mode, measured after fonts and `STEPDECK.settled()`. A dump is therefore always a jump: mounted from scratch, one update, no history. The viewport is 1920 x 1080 unless `--size` says otherwise; boxes are in canvas pixels either way.

**`--json`** prints an array with one object per step:

```json
{
  "slide": "chart",
  "step": 1,
  "stepId": "compare",
  "elements": [
    {
      "id": "title",
      "type": "text",
      "visible": true,
      "text": "Group B overtakes Group A after 2020",
      "box": { "x": 96, "y": 96, "w": 1728, "h": 74 },
      "props": { "text": "Group B overtakes Group A after 2020" }
    }
  ],
  "changed": ["chart"],
  "errors": []
}
```

| Field | Meaning |
| --- | --- |
| `slide` | The slide id. |
| `step` | The step index (a number). |
| `stepId` | The step id, or its index as a string when the step has no id. A slide with no steps has `"0"`. |
| `elements[].id`, `type` | The element id and component type, in element order. |
| `elements[].visible` | Measured on the page from computed `visibility` and `display`, not read from the spec. |
| `elements[].ghost` | Present only while the element's ghost placeholder is on screen (the element is hidden and has `ghost`): the label, or `true` for a ghost without one. Measured on the page. |
| `elements[].text` | The element's text nodes, each with whitespace collapsed, joined by one space. A ghost's label is not part of it. |
| `elements[].box` | `{ x, y, w, h }` relative to the canvas, in canvas pixels, rounded to 1 px. A collapsed element is `{ 0, 0, 0, 0 }`. |
| `elements[].canvas` | Present only when the element has a canvas layer: one object per `canvas.sd-canvas-layer`, in DOM order, holding its `data-*` attributes without the `data-` prefix. A `chart.line` draw fan has `draws`, `until` (empty without `until`), `seed` and `signature` (a hash of what the fan painted), so a dump shows the canvas state without pixels. Measured on the page. |
| `elements[].props` | The resolved props (bindings applied) from `STEPDECK.state()`. They appear only in the JSON. |
| `changed` | Ids whose resolved props or visibility differ from the previous step. At step 0, every id. With `--step`, the previous step is also loaded to compute it (and not printed). |
| `errors` | Runtime errors (`STEPDECK.errors`) plus console errors (`console: …`) and uncaught page errors (`pageerror: …`) seen while showing the step. Failed network requests are not included: a 404 does not appear here and does not fail `dump`. Use `check` for those. |

**Text output**, one block per step. Each element line shows visibility, id, type, box, `ghost "label"` (or `ghost`) while a ghost placeholder is shown, its text, cut to 48 characters (47 plus `…`) when longer, and, for an element with a canvas layer, `canvas draws=20 seed=1 signature=…` (the layer's attributes; an empty one is left out):

```
chart · step 1 (compare)
  visible  title   text        96,96 1728×74         "Group B overtakes Group A after 2020"
  visible  chart   chart.line  96,218 1096×754       "0 10 20 30 40 2016 2018 2020 2022 2024 Group B …"
  hidden   note    text        1264,443 560×83       "From 2020 on, Group B rises three times faster …"
  hidden   latest  big-number  1264,562 560×184      "37.3 Group B in 2024, per 1,000"
  visible  source  text        96,996 1728×36        "Source: synthetic example data (data/make-data.…"
  changed: chart
```

Errors appear as `  error: <message>` lines before `changed:`. `changed: (none)` means nothing changed.

**Exit codes.** 1 when any printed step has errors, 0 otherwise. 2 when the run cannot complete (see [Browser commands](#browser-commands-environment-and-limits)).

## check

Measures every step in Chrome and reports problems the audience would see.

```sh
node cli/index.js check [deckDir] [--slide id] [--step ref] [--size n] [--theme name] [--played] [--json]
```

**Layout pass.** Every step is a fresh load of the bare shell in capture mode, measured after fonts and `settled()`, at 1920 x 1080 unless `--size` says otherwise. It reports:

- `text-outside-canvas`, `text-outside-region`, `text-overlap`, `font-too-small` and `contrast`, once per slide, element and rule (per pair for overlaps), at the first step, with `(+N more steps)` when the problem persists;
- `step0-shows-all` for a slide whose step 0 already shows what its last step shows. This is skipped with `--step`;
- page errors: `render-error`, `console-error` and `network-error`, once per slide, step and message. Unlike `dump`, `check` reports failed requests.

**Played pass (`--played`).** For each step k, `check` compares three arrivals: a jump (fresh load with `?motion=full`), an animated arrival from step k−1, and an arrival back from step k+1. It compares each element's presence, visibility, text, box (rounded to 1 px) and canvas state (the `data-*` attributes of its canvas layers, as `dump` lists them), and reports `played-mismatch` once per slide and element. A slide with n steps has 2(n−1) arrivals. With `--step`, only the arrivals at that step are compared: from the step before and from the step after, so just one at the first or last step. If the page reports that animation is off, the run stops with exit 2: `animation is off on the page (flags …); check --played cannot test the animated path`. So it does when the page is hidden (`document.visibilityState` is not `"visible"`), since a hidden page renders end states only: `the page is hidden (document.visibilityState is 'hidden'), so it renders end states only; check --played cannot test the animated path`.

Problems are listed in this order: page errors, layout rules, `step0-shows-all`, then `played-mismatch`. The thresholds and fixes are in [Rules](rules.md).

**Text output.** Problem lines, then a summary line. The summary has a played count only with `--played`:

```
closing/0 · render-error · closing/oops: unknown component 'txt'; did you mean 'text'? vs no errors · fix the error shown on the slide, then run check again
check: 1 slide, 1 step, 1 problem
```

```
check: 1 slide, 4 steps, 6 played arrivals compared, 0 problems
```

A slide with no steps is reported as step `0` (`closing/0` above).

**`--json`** prints the problem array only (no `severity`, no counts). A clean deck prints `[]`.

**Exit codes.** 1 when any problem is reported, 0 otherwise, 2 when the run cannot complete.

## shoot

Writes one PNG per step, so you can look at what the audience will see.

```sh
node cli/index.js shoot [deckDir] [--slide id] [--step ref] [--size 1920|1280|960] [--theme name] [--json]
```

`--size` takes only `1920`, `1280` or `960`, and defaults to `960`, roughly what a video-call audience sees. The viewport is `size` x `size * 9 / 16`, so the canvas fills it exactly. Any other size exits 2 with `stepdeck: shoot --size must be 1920|1280|960` on stderr, even with `--json`.

Each step is a fresh load in capture mode, shot after fonts and `settled()`. Files go to:

```
<deck>/shots/<size>/<slide>-<nn>-<stepId>.png
```

`nn` is the step index, zero-padded to two digits (more for a slide with 100 steps or more). `stepId` is the step id, or the index when the step has no id: a slide with no steps gives `closing-00-0.png`. Existing files are overwritten; nothing else in `shots/` is deleted, so remove stale PNGs yourself after renaming steps. `shots/` is git-ignored.

**Text output.** The paths, relative to the current folder, then a summary:

```
my-talk/shots/960/closing-00-0.png
shoot: 1 PNG at 960×540
```

**`--json`** prints an array of absolute paths, in deck order.

**Exit codes.** 0 when the PNGs were written, even if a slide shows an error. 2 when the run cannot complete.

## Browser commands: environment and limits

`dump`, `check` and `shoot` drive Chrome through Playwright. Playwright is not a dependency of this repository.

| Variable | Default | Meaning |
| --- | --- | --- |
| `STEPDECK_PLAYWRIGHT` | `playwright`, resolved by Node | Path to a `playwright` package folder. |
| `STEPDECK_CHANNEL` | `chrome` (the system Chrome) | The Playwright browser channel to launch. |

```sh
STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node cli/index.js check my-talk
```

Without Playwright, these commands exit 2 with `Playwright not found[ at STEPDECK_PLAYWRIGHT=…]. Install it (npm i -D playwright) or set STEPDECK_PLAYWRIGHT to a playwright package directory.`

Limits and behaviour of every run:

- **One browser per run.** The deck is served on a free local port for the duration of the run.
- **Offline.** Every request whose origin is not the local server is aborted before it leaves the browser. `check` reports it as `network-error`: `remote <url> (blocked: only same-origin requests are allowed, spec §3)`.
- **Timeouts.** A page has 30 seconds to boot and settle. A component that does not settle within the runtime's 10-second watchdog becomes that element's error rather than a timeout. A page that never becomes ready exits 2 with `deck did not become ready at <url> (slide '<s>', step '<k>'): …`.
- **Run errors (exit 2).** Besides the timeout: `deck did not load: …` when the deck has no slides, `unknown slide '<id>' (slides: …)`, `unknown step '<ref>' in slide '<id>' (steps: …)`, `cannot open <target>: HTTP <status>` when the shell page answers with a non-OK HTTP status, `deck did not settle at <url> (slide '<s>', step '<k>'): …` when the deck does not settle after a step change, and a deck outside the repository with no engine copy.

## See also

- [Checking a deck](../guide/checking-a-deck.md): how to use `validate`, `check`, `shoot` and `dump` together.
- [Rules](rules.md): every `validate` and `check` rule, what triggers it and how to fix it.
- [Deck and slide spec](deck-and-slide.md): step ids and step references.
- [Quickstart](../guide/quickstart.md): `new`, `serve` and a first check.
- [skill/references/checks.md](../../skill/references/checks.md): the checking workflow agents follow.
