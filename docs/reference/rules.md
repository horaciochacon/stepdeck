# Rules

This page lists every rule that `validate`, `check` and `catalog` can report: what each rule measures, its severity, its limit and the usual fix. It is the single owner of the rule list. Other pages link here rather than repeat it.

It is for three readers:
- deck authors who want to know what a problem line means;
- agents, which read the same rule names in `--json` output;
- contributors who add or change a rule.

The rule names come from the code: `cli/validate.js`, `cli/palettes.js`, `components/diagram/place.js`, `cli/check.js` and `cli/catalog.js`. The skill's [checks.md](../../skill/references/checks.md) is a shorter summary written for agents. Where the two disagree, this page and the code are right (see [Differences from the skill's checks.md](#differences-from-the-skills-checksmd)).

For how to run the commands and work through a deck, see [Checking a deck](../guide/checking-a-deck.md). For every flag and exit code, see [CLI](cli.md).

## Reading a problem

Every command prints problems in one shape (`cli/problems.js`):

```
<location> · <rule> · <measured> vs <limit> · <fix>
```

- **location** is `slide/element/step`, with the parts that do not apply left out. When none apply it is `deck`.
- **rule** is a rule name from the tables below.
- **measured** is what was found, and **limit** is what was expected.
- **fix** is one suggested edit, often with a did-you-mean.

With `--json`, `validate` and `check` print an array of objects:

```json
{ "slide": "s", "element": "chart", "step": null, "rule": "missing-column",
  "measured": "y = 'yy'", "limit": "columns of data/points.csv: x, y, group",
  "fix": "set y to 'y'", "severity": "error" }
```

`slide`, `element` and `step` are `null` when they do not apply. Only `validate` adds `severity` (`error` or `warning`). `check` problems are all errors and carry no `severity`.

### What the location looks like

The location differs by rule family. These lines are real output from the test fixtures (the catalog line from the deck in `test/unit/catalog.test.mjs`):

| Location | Example | Used by |
| --- | --- | --- |
| `deck` | `deck · component-collision · deck component 'text' vs not a built-in name · …` | Deck rules with no slide or element. |
| `<palette>/<color>` | `pale/yellow · palette-contrast · 1.3:1 vs 3:1 · …` | `palette-contrast`, `palette-cvd` (the "element" is the palette entry; there is no slide). |
| `slide` | `s · style-import · style has @import "extra.css"; vs … · …` | Slide-wide rules. |
| `slide/element` | `s/chart · missing-column · y = 'yy' vs … · …` | Slide-level element rules on any slide (`duplicate-id`, `unknown-region`, `unknown-component`, `step-ref`, `advance-overflow`, `figure-source`, and `unknown-key` or `spec-invalid` on an element), plus per-step element rules on a slide with no steps. `validate` leaves the step out when the slide has no `steps`. |
| `slide/element/step` | `s/flow/two · diagram-id · shown names an unknown id 'nope' vs … · …` | Per-step element rules on a slide with steps: the first step where the problem appears. |
| `slide/step` | `s/b · unknown-element · set names 'nte' vs elements: title, note · …` | Step rules with no element. |
| `slide/element/0` | `s/edge/0 · text-outside-canvas · text at 1700,597 433×57 vs … · …` | `check` always names a step. A slide with no steps is step `0`. |
| `<name>` | `my.thin · catalog-schema · prop 'a' lacks description, examples, x-transition vs … · …` | Catalog rules: the component, layout or theme name. |

The step is the step's `id`, or its index as a string when the step has no id.

### Severity and exit codes

| Command | Severity | Exit code |
| --- | --- | --- |
| `validate` | Every rule is an error except `noop-step`, `kicker-no-region`, `lede-on-cover`, `title-accent`, `accent-empty`, `exit-delay-ignored` and `motion-budget`, which are warnings. Warnings print as `warning: <line>` after the errors. | `1` if any error; `0` if clean or warnings only. |
| `check` | Every problem is an error. | `1` if any problem. |
| `catalog` | Every problem is a warning. | Always `0`. |

All commands exit `2` when the run cannot complete, for example with no `deck.js`, an unknown `--slide`, or Playwright missing. See [CLI](cli.md).

`catalog --json` prints only the entries array. Its `catalog-schema` and `catalog-name` problems appear only in the text output. The warnings print only for a full `catalog` run without a name and without `--json`; `catalog <name>` reports none.

### Deduplication

Each family deduplicates differently:

| Family | How often a problem is reported |
| --- | --- |
| `validate` per-step element rules (`props-not-object` to `map-prop-unused` in the [per-step table](#validate-per-step-rules)) | Once per element and offending value, at the first step where it appears. There is no "more steps" count. A different bad value at a later step (another path, another string, another binding) gets its own line. `map-run` is the exception: it is once per element and step, because each step's run is its own. |
| `validate` `unknown-element` | Once per patch operation that names the unknown id, at that step. It is not deduplicated across steps. |
| `validate` `noop-step` | Once per step that changes nothing. |
| `check` layout rules (`text-outside-canvas`, `text-outside-region`, `text-overlap`, `font-too-small`, `contrast`) | Once per slide, element and rule (and per pair of elements for `text-overlap`). The line shows the first step's measurement. When the problem persists, `measured` ends with `(+N more steps)`. |
| `check` page errors (`render-error`, `console-error`, `network-error`) | Once per slide, step and message. An error logged at every step prints once per step. |
| `check --played` `played-mismatch` | Once per slide and element, at the first differing arrival, with `(+N more differing arrivals)`. |

### What a failure hides

Some problems stop later checks, so fix problems in the order they are printed. The skipped checks run once the earlier problem is fixed.

| When this fails | These are skipped |
| --- | --- |
| `deck-load` | Everything else. |
| `unknown-theme` | `theme-palettes`, `unknown-palette`, `theme-background`, `palette-contrast`, `palette-cvd`. |
| `theme-background` | `palette-contrast`, `palette-cvd`. |
| `slide-missing`, `slide-load`, `slide-id` | Every other rule for that slide. |
| A malformed element (no string `id` or `type`) or a `steps` entry that is not an object, reported as `spec-invalid` | Every rule after the slide schema for that slide. |
| `unknown-layout` | `unknown-region` for that slide. |
| `step-ref` | The folded per-step rules (`noop-step`, and `props-not-object` through `map-prop-unused`) for that slide. `unknown-element` is still reported at every step. |
| `unknown-element` in `set`, `replace`, `show` or `hide` | The folded per-step rules from that step on. In `only`, just that step is skipped. `unknown-element` is still reported at later steps. |
| `fold-error` | The folded per-step rules from that step on. `unknown-element` is still reported at later steps. |
| `unknown-component` | `unknown-prop` and `prop-invalid` for that element. |
| `binding-file`, `binding-pointer`, `binding-format`, or `path-case` on a binding | `unknown-prop`, `prop-invalid`, `diagram-id`, `diagram-overlap`, `chart-prop-unused`, `chart-orient`, `map-layer`, `map-frame`, `map-raster` and `map-prop-unused` for that element at that step. |
| `unknown-prop`, `prop-invalid` on a `diagram`, a `chart.line`, a `chart.bar` or a `map` | `diagram-id`, `diagram-overlap`, `chart-prop-unused`, `chart-orient`, and `map-layer`, `map-frame`, `map-raster`, `map-prop-unused` (they run only on props that pass the schema). `map-run` and the map's `missing-column` do not wait for the schema. |
| `render-error` naming an element | The `check` layout rules for that element at that step. |

## validate

`validate` runs in Node with no browser. It checks the deck, then each slide, then folds every step of each slide and checks the resolved props of every element, hidden ones included. With `--slide <id>` it checks the deck and that one slide.

### validate: deck rules

| Rule | Measures | Limit | Typical fix |
| --- | --- | --- | --- |
| `deck-load` | `deck.js` throws on import, or has no default object export. | Importable in plain Node; `export default { title, slides }`. | Make `deck.js` plain data: no DOM, fetch or top-level await. |
| `unknown-key` | A key the deck schema does not allow. | `allowed: title, lang, theme, palette, sections, components, slides`. | Rename it as the did-you-mean says, or remove it. |
| `spec-invalid` | Any other deck schema error: a missing `title` or `slides`, a wrong type, a bad pattern (for example `lang`). | The schema constraint, such as `required` or `must be string`. | Follow the fix text. |
| `unknown-theme` | No `themes/<theme>/tokens.css` in the engine, with exact case. The theme is `deck.theme`, or `modern` (the default). | `themes: <list>`. | Set `theme` to a listed theme (did-you-mean given), or add the theme. |
| `theme-palettes` | `themes/<theme>/palettes.json` is missing or not valid JSON. | A `palettes.json`. | Add or fix the theme's `palettes.json`. |
| `unknown-palette` | `deck.palette` is not a palette of the theme. | `palettes of <theme>: <list>`. | Use a listed palette, or remove `palette`. |
| `theme-background` | `--sd-color-background` in the theme's `tokens.css` is missing or not `#rgb` / `#rrggbb`. Eight-digit hex, `rgb()` and keywords fail. | A hex color. | Declare it as a 3- or 6-digit hex color. |
| `palette-contrast` | A color of a categorical palette in use has WCAG 2 contrast under 3:1 against the background. The printed ratio is rounded down, so `2.96` prints as `2.9:1`. Located as `<palette>/<color id>`. | `3:1`. | Use the darker value the fix names (same OKLab hue, lightness lowered). |
| `palette-cvd` | Two colors of a categorical palette in use differ by less than 8 (CIEDE2000) under simulated protanopia, deuteranopia or tritanopia (Machado 2009, severity 1). The smallest of the three is reported. Located as `<palette>/<a>+<b>`. | `ΔE 8`. | Change the lightness of one of the two colors, or drop one. |
| `engine` | The engine's `components/index.json` is unreadable. | The engine's component list. | Copy the engine again (`new`). |
| `component-collision` | A name in `deck.components` is a built-in name. | Not a built-in name. | Rename the deck component with a namespace, such as `my.text`. |
| `component-missing` | A name in `deck.components` has no `components/<name>/schema.json` in the deck. | `components/<name>/schema.json`, exact case. | Create it (`new-component`), or remove the name. |
| `component-schema` | A component `schema.json` does not parse, or does not compile as JSON Schema 2020-12. Every deck component and every built-in is checked, used or not. The `measured` part says `(deck)` or `(engine)`. | `valid JSON`, or `a JSON Schema 2020-12 that compiles`. | Fix the schema; `components/text/schema.json` shows the shape. |
| `layout-schema` | An engine `layouts/<name>/schema.json` is missing, is not JSON, or does not match `schema/layout.schema.json`. Every layout folder is checked, used or not. Only the first schema error per layout is reported. | A layout descriptor. | Give it `name`, `description`, `regions` and `variables`. |
| `path-case` | A `components/<name>/schema.json` from `deck.components` exists only in another case. | `components/<name>/schema.json, exact case`. | Rename the folder to the exact name. |

The palette rules run only on the palettes the deck draws with. For each kind (categorical, sequential, diverging) that is `deck.palette` when it has that kind, otherwise the theme's default for the kind. Only categorical palettes are checked: sequential and diverging palettes are area fills, so their light ends are exempt. The fix text ends with `, in themes/<theme>/palettes.json`.

### validate: slide rules

| Rule | Measures | Limit | Typical fix |
| --- | --- | --- | --- |
| `slide-missing` | No `slides/<id>.js` for an id in `deck.slides`. | `slides/<id>.js, exact case`. | Create the file, or remove the id. |
| `path-case` | `slides/<id>.js` exists only in another case. | `slides/<id>.js, exact case`. | Rename the file. Published servers are case-sensitive. |
| `slide-load` | The slide file throws on import, or has no default object export. | Importable in plain Node; `export default { id, elements }`. | Plain data only: no DOM, fetch or top-level await. Loops are fine. |
| `slide-id` | The exported `id` differs from the file name. | `'<id>' (the file name)`. | Set `id` to the file name. |
| `unknown-key` | A key not allowed on the slide, an element or a step. Element problems are located by element id, step problems by step id. | `allowed: <keys>`. | Rename it as the did-you-mean says. |
| `spec-invalid` | Any other slide schema error: a missing `id`, `type` or `elements`, a wrong type, an incomplete `box`, a bad `enter` or `exit` (an unknown motion name gets a did-you-mean in both forms: `"rize"` and `{ motion: "rize" }` suggest `"rise"`; an object's `delay` or `duration` over 5000 names the bound), a `transition.stagger` over 1000 or a `transition.duration` over 5000, a `ghost` that is neither a boolean nor a label. | The schema constraint. | Follow the fix text. |
| `duplicate-id` | Two elements share an id. | `unique per slide`. | Rename one, and the patches that target it. |
| `step-id-numeric` | A step id is digits only, such as `"1"`. Digits mean a step number. | `not digits only`. | Use a word, such as `step-1`, and update references. |
| `duplicate-step-id` | Two steps share an id. | `unique per slide`. | Rename one. |
| `remote-url` | `slide.style` contains `http://`, `https://` or a protocol-relative `//host` URL. One line per distinct URL; `measured` starts with `style has`. | `relative, same-origin paths only`. | Copy the file into the deck and use a relative `url()`, or drop it. |
| `style-import` | `slide.style` contains `@import`. The runtime parses `style` with `replaceSync`, which drops `@import` silently. | No `@import` in `slide.style`. | Copy the rules into `style` itself. |
| `unknown-layout` | The slide's layout (default `full-bleed`) has no `layouts/<name>/schema.json` in the engine, with exact case. | `layouts: <list>`. | Set `layout` to a listed layout (did-you-mean given). |
| `unknown-region` | An element's region (default `main`) is not a region of the slide's layout. Elements with a `box` and no `region` are exempt. | `regions of <layout>: <list>`. | Set a listed region, or give the element a `box`. |
| `unknown-component` | An element's `type` is neither a built-in nor a deck component declared in `deck.components`. | A built-in or a declared component. | Fix the name (did-you-mean given), or declare the component. |
| `step-ref` | An element's `from`, an entry of `at`, or `advance.start` names no step: an unknown id, or a number out of range. | `steps: <ids>`, or `the slide has one state (no steps)`. | Use an existing step id. |
| `advance-overflow` | `advance.values` runs past the last step. At run time the extra values are dropped. | `<n> steps from there`. | Add steps, or drop the last values, as the fix says. |
| `reserved-id` | An element of the slide has the id `kicker`, which core uses for the element it makes from the slide's `section`. (An element with id `title` is allowed: it replaces the title shortcut.) Located at the element. | `reserved: "kicker"`. | Rename the element, and the patches that target it. To show a kicker, set the slide's `section`. |
| `kicker-no-region` | Warning. The slide has a `section`, but its layout has no `title` region, so the kicker is not drawn (it is dropped quietly at run time, and steps that set, replace, show or hide `kicker` are ignored). Located at the slide. | `layout <name> has no title region (regions: …)`. | Use a layout with a `title` region, or remove `section`. |
| `lede-on-cover` | Warning. The slide has a `lede`, and its layout is a cover (`kind: "cover"`), which has a `subtitle` region for that line. Located at the slide. | `a cover puts its line under the title in the subtitle region`. | Use the subtitle region on a cover: put the line in a `text` element with `region: "subtitle"`, and remove `lede`. |
| `ghost-collapse` | An element has `ghost` (`true` or a label; `false` is no placeholder and is fine) together with `collapse: true`: a collapsed element takes no space, so there is nowhere to show its placeholder. Located at the element. | `ghost needs the element's space; collapse removes it`. | Remove `collapse`, or remove `ghost`. |
| `exit-delay-ignored` | Warning. An element's `exit` is an object with a `delay`. Exits start at t = 0, so the delay does nothing. Located at the element. | `exits start at t = 0: an exit has no delay`. | Remove `delay` from `exit`. To leave later, hide the element on a later step. |
| `motion-budget` | Warning. An element that enters on a step (played forward) settles 8000 ms or more after the step starts: its stagger hold (slot × stagger + its own `delay`) plus its entrance (the box motion's duration, or the component's own build, estimated from its props: the charts draw over 2 × `--sd-duration`, `big-number` counts over 2.25 ×, `list`, `chat`, `diagram` and `terminal` build their shown items one stagger apart, `timeline` fills then marks its stop). Every element must settle within the 10 s watchdog, or it fails on stage with "did not settle". Located at the element and the step. | `under 8000 ms (each element settles within the 10 s watchdog)`. | Shorten the element's `delay` or `duration`, or the step's `transition.stagger`, or split the step so fewer elements enter at once. |

### validate: per-step rules

`validate` folds the slide to every step and checks each element's resolved props there. An element whose props are unchanged since the last step it was checked is not checked again.

| Rule | Severity | Measures | Limit | Typical fix |
| --- | --- | --- | --- | --- |
| `unknown-element` | error | A `set`, `replace`, `only`, `show` or `hide` names an element id that does not exist. Located at the step that names it. | `elements: <ids>`. | Fix the id (did-you-mean given), or add the element. |
| `fold-error` | error | Folding the slide to this step threw for another reason. `measured` is the error message. | A slide that folds at every step. | Fix the patch of that step. |
| `noop-step` | warning | The step's elements, props and visibility equal the previous step's. A step that only adds `notes` triggers it. | A step changes something on screen. | Merge the step into the previous one (move its notes), or give it a patch. |
| `props-not-object` | error | After folding, an element's props are `null` or not an object, usually from `set: { el: null }`. | An object. | Delete one prop with `set: { el: { prop: null } }`, or use `replace`. |
| `remote-url` | error | A string prop contains `http://`, `https://` or `//host`. One line per string (the first URL in it). `measured` starts with the prop path. | `relative, same-origin paths only`. | Copy the file into the deck and use a relative path, or drop the link. |
| `hex-color` | error | A string prop contains a hex color: `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`, not preceded by a letter, digit, `_`, `&` or `#`. | `no hex colors in props`. | Remove it. Colors come from the theme palette; in Markdown use `{{color:<role>}}`. |
| `binding-file` | error | A binding's file does not exist, or does not parse. Paths with `..` or characters outside `[\w./-]` count as missing. | A `.json`, `.geojson` or `.csv` file in the deck. | Create the file (generate it with a script), or fix the path. |
| `binding-pointer` | error | A binding's JSON pointer is malformed, or names nothing in the file. `limit` lists the keys at that level. | `keys there: <keys>`. | Point at an existing key (did-you-mean given). |
| `binding-format` | error | The format is not a valid d3-format specifier; or a format is applied to a value that is not a number; or a binding embedded in text points at an object, array or `null`. | A d3-format specifier; a number when a format is given; a number or string inside text. | Use a valid specifier such as `,.0f`, drop the format, or bind the whole prop. |
| `path-case` | error | A file path in a prop, or a binding path, exists only in another case. | `on disk: <path>`. | Use the exact case. |
| `file-missing` | error | A string prop that is a relative path ending in `.json`, `.geojson`, `.csv`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.avif`, `.mp4`, `.webm`, `.mp3`, `.wav` or `.ogg` names no file. The whole string must be such a path, with no spaces and no `..`. | A file in the deck. | Create the file, or fix the path. |
| `data-invalid` | error | `props.data` is an existing `.csv` that does not parse with the declared `types`. | A CSV the loader parses. | Fix the data or the `types`. |
| `missing-column` | error | For an element whose `data` is an existing `.csv`: `x`, `y`, `series`, `interval.lower` or `interval.upper`, `id` or `from` on `chart.points`, or `group` with `mode: "back-to-back"`, names a column the header lacks. Values that are bindings are skipped. Checked for any component (`id` and `from` only on `chart.points`, where they name columns), at every step, because `y` may change. A `map` names its columns in its layers, each in the layer's own CSV: `areas` layers `key` (else the map's `id`) and `value`; `points` layers `lon`, `lat`, `id`, `size`, and `color` when it is not a theme colour role (the runtime then reads it as a column). `measured` names the layer: `layers.rate.value = 'rat'`. | `columns of <file>: <header>`. | Use a listed column (did-you-mean given). |
| `unknown-prop` | error | With bindings resolved, a prop the component schema does not allow. | `props of <type>: <props>`. | Rename it as the did-you-mean says; `catalog <type>` lists the props. |
| `prop-invalid` | error | With bindings resolved, any other component schema error: a missing required prop, a wrong type, a value out of range or off pattern. | The schema constraint. | Follow the fix text. A binding with a format yields a string. |
| `title-accent` | warning | The slide's title (the shortcut, or a `text` element with id `title` and `accent: true`) has an odd number of unescaped `*`, counted on the string as written at each step where the title text changes. The unmatched `*` renders literally. | `* in pairs around the accent phrase: *phrase*`. | Close the phrase with a second `*`, or write `\*` for a literal asterisk. |
| `accent-empty` | warning | The same title has an empty accent phrase `**`, usually a markdown bold habit. It renders as two literal asterisks. Two phrases that touch, as in `*a**b*`, are not empty. | `one * on each side of the accent phrase: *phrase* (titles are not markdown)`. | Write a single `*phrase*`, or `\*\*` for two literal asterisks. |
| `diagram-id` | error | For a `diagram` whose props pass its schema: an edge end, a group member, or an entry of `shown` or `highlight` names an unknown id; an id is used twice across nodes, groups and edges; or a group contains itself. | Ids that exist and are unique; groups nest without cycles. | Fix the id, give a repeated edge an explicit `id`, or break the cycle. |
| `diagram-overlap` | error | For a `diagram` whose props pass its schema: sibling groups share cells; a node sits in a group's cells without being a member; or the theme's `--sd-diagram-gap` is less than twice `--sd-diagram-pad`. | Separate cells for sibling groups; only members in a group's cells; gap at least 2 x pad. | Move members, nest one group in the other, add the node to the group, or change the theme tokens. |
| `chart-prop-unused` | warning | For a `chart.line` whose props pass its schema: `ticker` is `true` and `until` is not set, so there is no sweep for the ticker to count. For a `chart.bar` whose props pass its schema: `invert` is `true`, or `total` is `true` or a label, and `mode` is not `"waterfall"`, so there are no increases to recolour and no running total to close. One line per prop. | `` `ticker` together with `until` ``; `` `invert` together with `mode: "waterfall"` `` (and the same for `total`). | Set `until`, or remove `ticker`. Set `mode: "waterfall"`, or remove `invert` / `total` (`total: null` on the step that switches back to plain bars). |
| `chart-orient` | error | For a `chart.bar` whose props pass its schema: `mode` is `"back-to-back"` and `orient` is `"vertical"`. Its two sides run left and right of a centre rule, so the chart fails at render time with the same message, `back-to-back bars are horizontal only`. | `` `orient: "horizontal"` with `mode: "back-to-back"` ``. | Remove `orient: "vertical"`, or choose another `mode`. |
| `map-layer` | error | For a `map` whose props pass its schema: `shown` lists an id that is not a key of `layers`. The map fails at render time with `layer 'x' not found`. | `` every id in `shown` is a key of `layers` ``. | Add the layer, or remove the id from `shown`. |
| `map-frame` | error | For a `map` whose props pass its schema, with each raster layer's JSON read from the deck: `frame` is not a label of the time-lapse (the first time-lapse layer's, in file order); two time-lapse layers have different label lists; or a `numbers` key is in the frames of two time-lapse layers. Labels compare as text. | `` `frame` is a label of the time-lapse ``; `every time-lapse layer on a map has the same label list`; `` each `numbers` key comes from one time-lapse layer ``. | Use a listed label, give the files the same labels in the same order, or rename the key in one file. |
| `map-raster` | error | For a `map` whose props pass its schema: a layer's raster JSON that does not parse or breaks the raster format (`bounds`, `value`, `src` or `frames`, up to 200 frames, unique labels, the same `numbers` keys in every frame); an image it names that is not there, is not a path inside the deck, is on disk in another case, or is not a PNG; a PNG that is not 8-bit greyscale (color type 0 or 4), is interlaced, has a `gAMA`, `cHRM`, `iCCP` or `sRGB` chunk, or has more than 2,000 × 2,000 pixels; frames of different sizes; or a time-lapse of more than 100 million pixels, every frame together (frames × width × height). Each message starts with the file's path, except that of a sidecar that does not parse, which starts with the loader's message (`invalid data file <path>: …`). Images are read from the deck (the header and chunk list only). A raster file that is not in the deck is `file-missing`, not this. | `8-bit greyscale PNG (type 0 or 4), not interlaced, no color chunks, at most 2,000×2,000 pixels`; `every frame has the same size`; `at most 100 million pixels in a time-lapse, every frame together`; `` a sidecar with `bounds`, `value`, and `src` or `frames` ``. | Correct the sidecar, or re-export the image as 8-bit greyscale, not interlaced, without a color profile. |
| `map-run` | error | A step that moves a map's `frame` from one step to the next, with a time-lapse shown and the same geometry, plays a run: its first phase (twice `--sd-duration` for a flight, once for the other motion of the step, or the step's own `transition.duration`; none for `frame` alone) plus the frames it moves × `pace` (default 700 ms) is longer than 20 s. The element fails with `a run of 20.3 s is longer than 20 s`. Not reported where the map enters on that step: it plays no run. Located at the step that plays the run. | `at most 20000 ms`. | Lower `pace`, or play the frames over two steps. |
| `map-prop-unused` | warning | For a `map` whose props pass its schema: `frame` or `pace` is set and no layer is a time-lapse; or a `numbers` key is in no frame. Only judged when every raster file could be read. | `` `frame` together with a time-lapse layer ``; `` each `numbers` key is a key of the frames' `numbers` ``. | Add a raster layer whose file has `frames`, or remove the prop; add the key to the frames' `numbers`, or remove it from `numbers`. |

`diagram-id` and `diagram-overlap` come from `diagramProblems` in `components/diagram/place.js`. The gap and pad come from the theme's `tokens.css` (`--sd-diagram-gap` and `--sd-diagram-pad`, else 3 x and 1 x `--sd-space`). An override in a slide's `style` is not seen. At run time a `diagram-id` problem also fails the element; a `diagram-overlap` problem does not, and the diagram renders with touching boxes. See the [components reference](components/index.md).

`chart-prop-unused` and `chart-orient` come from `chartProblems` in `core/chart-rules.js`, a pure function with no imports that `validate` calls for every element type and that returns `[]` for the types it does not know. `chart-prop-unused` reports a prop that has no effect without another one; it is a warning, so the deck still builds. `chart-orient` reports props the chart cannot draw; it is an error.

The `map-*` rules come from `mapProblems` and `mapRunProblems` in `core/map-rules.js`, pure functions that `validate` feeds with the files the map names: each raster layer's JSON (read once per file and parsed with the deck's data loader) and the header and chunk list of each PNG it names (read with `cli/png.js`, resolved against the JSON's folder by the runtime's rule: relative, inside the deck). `map-run` compares two steps, so it is judged in the fold loop, not per element: the first phase comes from the same rule the element plays by (`stepRun` and `firstPhase`), with `--sd-duration` from the theme's `tokens.css` and the step's own `transition`. `map-prop-unused` is a warning; the other four are errors.

### validate: lint

| Rule | Severity | Measures | Limit | Typical fix |
| --- | --- | --- | --- | --- |
| `figure-source` | error | A slide holds a figure and no element has `role: "source"` in its initial props. A figure is a type matching `chart.*` or `map.*`, the type `map`, or `big-number`. Reported on the first figure element. | `an element with role: "source"`. | Add a source line. The fix suggests `region: "footer"` when the layout has a footer, else `"main"`. |

The warnings are `noop-step`, `title-accent`, `accent-empty`, `chart-prop-unused`, `map-prop-unused` (per-step rules above) and `kicker-no-region` (slide rules above); everything else in `validate` is an error.

## check

`check` loads each step of each slide in Chrome, in the bare shell in capture mode, at 1920 x 1080 unless `--size` says otherwise. It measures after fonts load and every component settles. All geometry is in canvas pixels. "Text" means visible text nodes, SVG `<text>` included, attributed to their top-level element.

It skips:
- text nobody can see: whitespace only, `visibility` not `visible`, a cumulative opacity of 0, or clipped away by an ancestor's overflow;
- the engine's own error boxes (`.sd-error`);
- elements already reported as failed in `STEPDECK.errors`.

Problems print in this order: page errors, layout rules, `step0-shows-all`, then `played-mismatch`.

### check: layout rules

| Rule | Measures | Threshold | Typical fix |
| --- | --- | --- | --- |
| `text-outside-canvas` | Text past the 1920 x 1080 canvas. `measured` is the bounding box of the offending text. | 1 px on every side, plus the half-leading vertically (glyphs of a tall font with a tight line height overhang their line box). | Move or shrink the element (its `box` or region), or shorten the text. |
| `text-outside-region` | Text of an element placed in a region (not with a `box`) past the region's content box. | Same as above. | Shorten the text, break long words, or widen the region with the slide's `regions` variables. |
| `text-overlap` | Text of two different elements intersects. Reported on the later element, naming the earlier one; `measured` gives the largest intersecting area, `W×H px`. | More than 4 px in both axes. There is no opt-out, `box` elements included. | Move one element, or shorten the text. |
| `font-too-small` | Visible text with a computed font size, in canvas pixels, under the minimum. SVG text is scaled by its `viewBox`. `measured` is the smallest size found. | `--sd-min-audience-font`, else `--min-audience-font`, else 28px. academic-light sets 28px. The limit text always says `--min-audience-font`. 0.01 px tolerance. | Use a larger size or role. Exempt: elements with `role: "source"`, text inside `.sd-role-source`, and every element placed in the layout's `footer` region with `region: "footer"`. The exemption follows where the element is placed, not where it lands on screen: an element with a `box` is never exempt, even over the footer area. |
| `contrast` | WCAG 2 contrast of text against its background, worst text item per element. The background is the first opaque ancestor background, blending translucent ones on the way, else the canvas background, else white. The text color is `color`, or `fill` for SVG, blended with its alpha and cumulative opacity. | Under 4.5:1. | Use the theme's ink or muted color, or a darker palette color. |

### check: page errors

These come from both the layout pass and the played pass. `limit` is always `no errors`.

| Rule | Measures | Typical fix |
| --- | --- | --- |
| `render-error` | A line of `STEPDECK.errors`: a boot or slide error, or an element that failed (unknown component, binding error, `mount` or `update` threw, `did not settle within 10s`). | Fix the error shown on the slide; `measured` is the message. |
| `console-error` | A `console.error` call or an uncaught page error. Chrome's own `Failed to load resource` lines are left to `network-error`. | Fix the script error, usually in a custom component. |
| `network-error` | A request that answered HTTP 400 or more (`404 <path>`), failed (`failed <path> (<reason>)`), or went to another origin (`remote <url> (blocked: only same-origin requests are allowed, spec §3)`). `check` blocks every request to another origin. Exception: a 404 for `themes/<name>/theme.css` is not reported, because that file is optional (a 404 for `tokens.css`, or any other status for `theme.css`, still is). | Fix the path or add the file. For a remote resource, copy it into the deck and use a relative path. |

### check: step0-shows-all

| Rule | Measures | Typical fix |
| --- | --- | --- |
| `step0-shows-all` | A slide with more than one step whose step 0 shows the same content as its last step: the same visible elements, text and resolved props. Located as `slide/<first step>`. Slides driven by `advance` change props, so they pass. Skipped with `--step`, because it needs both ends of the slide. | Hide elements until their step (`from`, `at`), change props per step (`set`, `only`, `advance`), or drop the extra steps. |

It also fires when a slide ends back where it began.

### check --played: played-mismatch

With `--played`, every step k is reached three ways:
- **jumped**: a fresh page load at k with `?motion=full`;
- **from the previous step**: `goTo(k)` from k−1, animated;
- **from the next step**: `goTo(k)` from k+1.

Each arrival is compared with the jump, per element, by presence, visibility, text, box rounded to 1 px, and canvas state (the `data-*` attributes of the element's canvas layers). A slide with n steps gives 2(n−1) arrivals.

| Rule | Measures | Limit | Typical fix |
| --- | --- | --- | --- |
| `played-mismatch` | The first arrival, in step order, that differs from the jump, as `<field> <value> arriving from '<step>' [(animated)] (+N more differing arrivals)`. The field is `presence`, `visibility`, `text`, `box` or `canvas`; for `canvas` the value is the first attribute that differs, its value and that layer's attributes, as `signature 1a2b3c4d (draws=200 until= seed=1 signature=1a2b3c4d)`. | `<value> when jumped to`. | Make `update()` idempotent: render the whole state from props, never from `prev` or earlier calls, and leave no animation residue when it ends or is aborted. |

A real line, from `test/fixtures/decks/played-mismatch`:

```
log/log/one · played-mismatch · text "count 0 count 1 count 0" arriving from 'two' (+3 more differing arrivals) vs "count 0" when jumped to · make update() idempotent: …
```

If the page reports that animation is off (`STEPDECK.flags.animate` is not `true`), the played pass stops with an error and exit 2. It never compares a jump with a jump.

## catalog

`catalog` reports these as `warning:` lines and still exits 0. The location is the entry name. The warnings print only for a full `catalog` run without a name and without `--json`; `catalog <name>` reports none.

| Rule | Measures | Limit | Typical fix |
| --- | --- | --- | --- |
| `catalog-schema` | A component `schema.json` is unreadable or has no top-level `description`; a prop lacks `description`, `examples` or an `x-transition` of `tween`, `draw`, `fade` or `snap`; a layout `schema.json` is unreadable; a theme's `palettes.json` exists but is not JSON; or a theme `README.md` has no first paragraph. | `description, examples and x-transition (tween\|draw\|fade\|snap) on every prop`, or a readable file, or a README whose first paragraph is the summary. | Add what the fix names. |
| `catalog-name` | Two entries of different kinds share a name, such as a theme and a layout both called `plain`. The second is left out of the catalog. | `one entry per name (catalog/<name>.json)`. | Rename one, for example with a namespace. |

## Known gaps

No rule catches these. Look at the shots (`shoot`) or the measurements (`dump`).

- **Collapsed charts.** `chart.line`, `chart.bar`, `diagram`, `image` and `terminal` take the height the other elements in their region leave (a rule in `core/stepdeck.css`, see the [Fill rules](layouts.md#fill-rules) table). The one built-in region with no height to give is `statement` `main`, where a chart measures 1500×0. `check` can report that slide, because the axis text runs out of the region (`text-outside-region`), but it does not name the chart.
- **Silent `chart.line` names.** An unknown name in `series_shown` is ignored, and an unknown `highlight` dims every series. Neither is an error at validate or at run time. `chart.bar` throws for an unknown category in `shown` or `highlight`.
- **Diagram nodes outside the grid.** Nothing checks that a node's `col` and `row` (plus spans) fit inside `cols` and `rows`. The node is placed past the diagram's box with no problem reported.
- **Other silent values.** In `list`, an integer `active` out of range or a `done` count larger than the item count is accepted. Keys of a slide's `regions` are not checked against the layout's variables, so a misspelled variable does nothing.
- **Unchecked colors and styles.** `{{color:<role>}}` is not checked by `validate`; an unknown role appears only at run time as a `render-error`. `slide.style` is not scanned for hex colors.
- **Contrast against non-ancestors.** `contrast` sees only ancestor backgrounds. Text over a sibling SVG rect, an image or a gradient can pass and still be unreadable.
- **False positives.** Hashtags and issue numbers such as `#123` or `#cafe` are read as hex colors. A whitespace-free string ending in `.csv` or `.json` counts as a file, even when it is only a label.

## Differences from the skill's checks.md

[skill/references/checks.md](../../skill/references/checks.md) is the agent's summary of these rules. It differs from the code in one place: it does not list `diagram-id` and `diagram-overlap`.

## Rule fixtures

Each rule should have a fixture that yields exactly that problem. To add or change a rule, its fixture and its docs, see [Adding a rule](../contributing/adding-a-rule.md). Fixture folder names do not always match the rule name.

| Fixture | Rule |
| --- | --- |
| `test/fixtures/validate/accent-empty` | `accent-empty` |
| `test/fixtures/validate/advance-overflow` | `advance-overflow` |
| `test/fixtures/validate/bad-binding` | `binding-file`, `binding-pointer`, `binding-format` |
| `test/fixtures/validate/bad-builtin-schema` | `component-schema` (engine) |
| `test/fixtures/validate/bad-component-schema` | `component-schema` (deck) |
| `test/fixtures/validate/bad-palette` | `palette-contrast` |
| `test/fixtures/validate/bad-step-ref` | `step-ref` |
| `test/fixtures/validate/collision` | `component-collision` |
| `test/fixtures/validate/diagram-overlap` | `diagram-overlap` |
| `test/fixtures/validate/diagram-unknown-id` | `diagram-id` |
| `test/fixtures/validate/duplicate-id` | `duplicate-id` |
| `test/fixtures/validate/figure-without-source` | `figure-source` |
| `test/fixtures/validate/hex-color` | `hex-color` |
| `test/fixtures/validate/ghost-collapse` | `ghost-collapse` |
| `test/fixtures/validate/kicker-no-region` | `kicker-no-region` |
| `test/fixtures/validate/lede-on-cover` | `lede-on-cover` |
| `test/fixtures/validate/exit-delay` | `exit-delay-ignored` |
| `test/fixtures/validate/ticker-without-until` | `chart-prop-unused` |
| `test/fixtures/validate/waterfall-props-outside` | `chart-prop-unused` (two: `invert` and `total` on plain bars) |
| `test/fixtures/validate/back-to-back-vertical` | `chart-orient` |
| `test/fixtures/validate/map-layer` | `map-layer` |
| `test/fixtures/validate/map-frame` | `map-frame` (one slide each: an unknown `frame`, label lists that differ, a `numbers` key in two layers) |
| `test/fixtures/validate/map-raster` | `map-raster` (one slide each: a bad sidecar, a color PNG with a `gAMA` chunk, a missing image, an interlaced one, a file that is no PNG, frames of two sizes, an image in the wrong case, one outside the deck, a sidecar that is not JSON); its `make.mjs` writes the files |
| `test/fixtures/validate/map-run` | `map-run` (a run of 29 moves, and 28 moves after a flight; the same 28 moves without the flight are clean); its `make.mjs` writes the files |
| `test/fixtures/validate/map-prop-unused` | `map-prop-unused` (`frame`, `pace`, and a `numbers` key no frame has); its `make.mjs` writes the files |
| `test/fixtures/validate/motion-budget` | `motion-budget` (three: a box motion, a list build and a count-up); `motion-budget-under` is the same slide a little earlier, and clean |
| `test/fixtures/validate/image-alt-empty`, `image-alt-missing`, `invalid-at-step` | `prop-invalid` |
| `test/fixtures/validate/missing-column`, `missing-column-bar`, `group-missing-column` | `missing-column` |
| `test/fixtures/validate/noop-step` | `noop-step` |
| `test/fixtures/validate/numeric-step-id` | `step-id-numeric` |
| `test/fixtures/validate/bad-motion` | `spec-invalid` (an unknown motion name in `enter`, with a did-you-mean) |
| `test/fixtures/validate/props-null` | `props-not-object` |
| `test/fixtures/validate/remote-style` | `remote-url` (in `slide.style`) |
| `test/fixtures/validate/reserved-id` | `reserved-id` |
| `test/fixtures/validate/remote-url` | `remote-url` (in props) |
| `test/fixtures/validate/style-import` | `style-import` |
| `test/fixtures/validate/title-accent` | `title-accent` |
| `test/fixtures/validate/unknown-component` | `unknown-component` |
| `test/fixtures/validate/unknown-element` | `unknown-element` |
| `test/fixtures/validate/unknown-key` | `unknown-key` |
| `test/fixtures/validate/unknown-prop` | `unknown-prop` |
| `test/fixtures/validate/unknown-region` | `unknown-region` |
| `test/fixtures/validate/wrong-case` | `path-case` |
| `test/fixtures/check/<rule>` | That `check` rule; `remote-fetch` and `remote-style` give `network-error` |
| `test/fixtures/decks/played-mismatch` | `played-mismatch` |

These rules have no fixture folder: `deck-load`, `unknown-theme`, `theme-palettes`, `theme-background`, `unknown-palette`, `palette-cvd`, `engine`, `component-missing`, `layout-schema`, `slide-missing`, `slide-load`, `slide-id`, `duplicate-step-id`, `unknown-layout`, `fold-error`, `file-missing`, `data-invalid`, `catalog-schema` and `catalog-name`. Some are covered by inline tests in `test/unit/`.

## See also

- [Checking a deck](../guide/checking-a-deck.md): the edit, validate, check, shoot loop.
- [CLI](cli.md): every command, flag and exit code.
- [Deck and slide spec](deck-and-slide.md): the keys the schema rules check.
- [checks.md](../../skill/references/checks.md): the agent's version of this list.
- [Adding a rule](../contributing/adding-a-rule.md): how to add or change a rule and its fixture.
