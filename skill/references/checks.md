# What every problem means and how to fix it

Each problem prints as one line:

```
slide/element/step · rule · measured vs limit · suggested fix
```

- `step` is the step id.
- Location parts that do not apply are left out, giving `slide/step`, `slide/element`, `slide` or `deck`.
- With `--json` you get an array of `{ slide, element, step, rule, measured, limit, fix }`. Validate adds `severity` (`error` or `warning`).
- The suggested fix is usually the exact edit to make, often with a did-you-mean.

Exit codes:
- `0`: clean, or warnings only;
- `1`: problems;
- `2`: usage error, or a run that could not complete. Examples: no `deck.js`, an unknown `--slide`, Playwright missing, a deck folder with no engine copy. Under `--json` the error comes as `{ "error": "…" }`.

Run `validate` first: it is fast and catches most mistakes. Run `check` once validate is clean.

## validate (Node, no browser)

Validate checks the deck, then each slide. It folds every step and checks the resolved props of every element, hidden ones included, at every step. Each problem is reported once, at the first step where it appears.

### Deck

| Rule | Means | Fix |
|---|---|---|
| `deck-load` | `deck.js` threw on import or has no default export object. | Make it plain data: `export default { title, slides, … }`, with no DOM, no fetch and no top-level await. |
| `unknown-key` | A key the deck schema does not allow (did-you-mean given). | Rename it as suggested. Allowed keys: `title`, `lang`, `theme`, `palette`, `sections`, `components`, `slides`. |
| `spec-invalid` | Any other deck schema violation: a wrong type, a missing `title` or `slides`, a bad pattern. | Follow the fix text. |
| `unknown-theme` | No `stepdeck/themes/<theme>/tokens.css`. | Use `modern` or `academic-light`, or add the theme ([themes-layouts](themes-layouts.md)). |
| `theme-palettes` | The theme has no readable `palettes.json`. | Fix the theme's `palettes.json`. |
| `theme-background` | `--sd-color-background` is missing or not a hex color in `tokens.css`. | Declare it as hex. |
| `unknown-palette` | `palette` is not one of the theme's palettes. | Use a name from `catalog <theme>`, or drop `palette`. |
| `palette-contrast` | A categorical color has less than 3:1 contrast against the background. Located as `<palette>/<color>`. | Use the darker value the fix names. |
| `palette-cvd` | Two categorical colors are too close under simulated color-vision deficiency (CIEDE2000 < 8). | Change one of the two colors. |
| `engine` | The engine's `components/index.json` is unreadable. | Recreate the deck's engine copy (`new`). |
| `component-collision` | A deck component has a built-in's name. | Rename the folder and the `components` entry with a namespace (`my.text`). |
| `component-missing` | A name in `deck.js` `components` has no `components/<name>/schema.json`. | Create the component (`new-component`) or remove the name. |
| `component-schema` | A component `schema.json` (deck or engine) does not parse or compile as JSON Schema 2020-12. | Fix the schema; see `catalog text --json` for the shape. |
| `layout-schema` | An engine layout's `schema.json` does not match the layout descriptor shape. | Give it `name`, `description`, `regions` and `variables` ([themes-layouts](themes-layouts.md)). |

### Slide structure

| Rule | Means | Fix |
|---|---|---|
| `slide-missing` | `slides/<id>.js` for an id in `deck.js` `slides` does not exist. | Create the file or remove the id. |
| `slide-load` | The slide file threw on import or has no default export object. | Plain data only. Synchronous code such as loops is fine; DOM, fetch and top-level await are not. |
| `slide-id` | The exported `id` differs from the file name. | Make them equal. |
| `path-case` | A path (slide file, data, binding, component) differs in case from the file on disk. | Use the exact case the fix shows. Published sites are case-sensitive. |
| `unknown-key` | A key not allowed on the slide, an element or a step (did-you-mean given). | Rename it as suggested. |
| `spec-invalid` | Any other slide schema violation: a missing `id`, `type` or `elements`, a wrong type, a bad `box`. | Follow the fix text. |
| `duplicate-id` | Two elements share an id. | Rename one, and the patches that target it. |
| `duplicate-step-id` | Two steps share an id. | Rename one, and its references. |
| `step-id-numeric` | A step id is digits only (`"1"`). | Use a word (`"intro"`, `"step-1"`). |
| `unknown-layout` | No such layout. | Use one from the catalog: `title`, `figure-notes`, `full-bleed`, `statement`, `halves`. |
| `unknown-region` | The element's region is not in its layout. | Use a region the fix lists. Elements with a `box` need none. |
| `remote-url` | The slide's `style` contains `http://`, `https://` or `//host` (located as the slide, `measured` starts with `style has`). | Copy the file into the deck (`assets/`) and use a relative `url()`, or drop it. |
| `style-import` | The slide's `style` contains `@import`, which the runtime drops without a word. | Copy the rules into `style` itself. |
| `unknown-component` | `type` is neither a built-in nor declared in `deck.js` `components`. | Fix the name as suggested, or declare the deck component. |
| `step-ref` | `from`, `at` or `advance.start` names no step. | Use an existing step id. While this error stands, the per-step checks of that slide are skipped. |
| `advance-overflow` | `advance.values` runs past the last step. | Add steps or drop values, as the fix says. |
| `reserved-id` | An element has the id `kicker`, which core uses for the element it makes from the slide's `section`. | Rename the element. To show a kicker, set the slide's `section`. |
| `kicker-no-region` | Warning. The slide has a `section`, but its layout has no `title` region, so the kicker is not drawn (steps that set, replace, show or hide `kicker` are ignored). | Use a layout with a `title` region, or remove `section`. |
| `lede-on-cover` | Warning. The slide has a `lede`, and its layout is a cover (`title`), which has a `subtitle` region for that line. | Put the line in a `text` element with `region: "subtitle"`, and remove `lede`. |
| `ghost-collapse` | An element has `ghost` together with `collapse: true`: a collapsed element has no space to show the placeholder in. | Remove `collapse`, or remove `ghost`. |
| `spec-invalid` on `enter`/`exit` | A motion name that does not exist, as a name or as an object's `motion` (did-you-mean given), or an object's `delay` or `duration` over 5000. A key other than `motion`, `delay`, `duration` in the object is `unknown-key`, with the nearest key. | Use `fade`, `rise`, `wipe`, `pop`, `draw` or `none`, or `{ motion, delay?, duration? }` (ms, 0 to 5000). |
| `spec-invalid` on `transition` | A step's `transition.stagger` over 1000 or `transition.duration` over 5000. | Lower it; split a long build over several steps. |
| `exit-delay-ignored` | Warning. An `exit` object has a `delay`; exits start at once, so it does nothing. | Remove `delay` from `exit`. To leave later, hide the element on a later step. |
| `motion-budget` | Warning. An element entering on a step settles 8000 ms or more after the step starts: its stagger hold (slot × stagger + its `delay`) plus its entrance (box motion, or its own build estimated from its props). An element must settle within 10 s, or it fails on stage. | Shorten its `delay` or `duration`, or the step's `transition.stagger`, or split the step so fewer elements enter at once. |

### Per step

| Rule | Means | Fix |
|---|---|---|
| `unknown-element` | A `set`, `replace`, `only`, `show` or `hide` names an element that does not exist (did-you-mean given). | Fix the id. |
| `fold-error` | Folding the slide to that step threw for another reason. | Read `measured`; usually a malformed patch. |
| `props-not-object` | After folding, an element's props are `null` or a scalar, usually from `set: { el: null }`. | Delete one prop with `set: { el: { prop: null } }`, or use `replace`. |
| `unknown-prop` | A prop the component schema does not have (did-you-mean given). | Rename it as suggested; `catalog <type>` lists the props. |
| `prop-invalid` | A resolved prop violates the component schema: a wrong type, a missing required prop, out of range. | Follow the fix text. Remember that a binding *with* a format yields a string. |
| `remote-url` | A prop contains `http://`, `https://` or `//host`. | Copy the file into the deck (`assets/`) and use a relative path, or drop the link. |
| `hex-color` | A prop contains a hex color (`#c0392b`). | Remove it. Colors come from the theme. In text, use `{{color:role}}` (markdown). |
| `binding-file` | A binding's file is missing, unsupported or does not parse. | Create the file (generate it), or fix the path. |
| `binding-pointer` | A binding's JSON pointer is invalid or not found. The measured part lists the keys there. | Point at an existing key. |
| `binding-format` | A bad d3-format specifier, a format applied to a non-number, or an object or array embedded in text. | Use a valid specifier (`,.0f`, `.1%`, `d`), or bind the raw value. |
| `file-missing` | A string prop that names a deck file (`.json`, `.csv`, image or media) points at nothing. | Create the file or fix the path. |
| `data-invalid` | A CSV does not parse with the declared `types`. | Fix the data or the `types`. |
| `missing-column` | `x`, `y`, `id`, `from`, `series`, `interval.lower`/`interval.upper`, or `group` on a back-to-back `chart.bar`, names a column the CSV lacks; so does a `map` layer's `key` (else the map's `id`), `value`, `lon`, `lat`, `id`, `size`, or a points `color` that is not a theme colour (`layers.rate.value = 'rat'`). Checked per step, because `y` may change. | Use a column the fix lists. |
| `title-accent` | Warning. The title has an odd number of unescaped `*`, so one `*` renders as written. | Close the accent phrase (`*phrase*`), or write `\*` for a literal asterisk. |
| `accent-empty` | Warning. The title has an empty accent phrase `**` (markdown bold habit); it renders as two asterisks. | Write one `*phrase*`, or `\*\*`. |
| `diagram-id` | A `diagram` (props that pass its schema) has an edge `from`/`to`, a group `contains`, or a `shown` or `highlight` entry that names an unknown id; an id used twice across nodes, groups and edges (two edges between the same pair need explicit ids); or a group that contains itself. | Correct the id, or give the edge an explicit `id`. |
| `diagram-overlap` | A `diagram` (props that pass its schema) has sibling groups that share grid cells; a node that is not a member sitting inside a group's cells; or a theme `--sd-diagram-gap` less than twice `--sd-diagram-pad` (for a compact diagram, `--sd-diagram-compact-gap` and `--sd-diagram-compact-pad`). | Move the group or node, or put the node in the group (`contains`). For the gap, change the theme tokens. |
| `diagram-caption-unused` | Warning. A `diagram` sets `caption` and not `compact: true`; only a compact diagram draws its caption. | Set `compact: true`, or remove `caption` (`caption: null` on the step that turns `compact` off). |
| `chart-prop-unused` | Warning. A `chart.line` has `ticker: true` and no `until`, so the ticker has no sweep to count. Or a `chart.bar` has `invert: true` or a `total` without `mode: "waterfall"`, so they change nothing on plain bars. | Set `until`, or remove `ticker`. Set `mode: "waterfall"`, or remove `invert` / `total` (`total: null` on a step that switches back to plain bars). |
| `chart-orient` | A `chart.bar` with `mode: "back-to-back"` and `orient: "vertical"`: its two sides run left and right, so it fails at render time too (`back-to-back bars are horizontal only`). | Remove `orient: "vertical"`, or choose another `mode`. |
| `map-layer` | A `map`'s `shown` lists an id that is not a key of `layers`; it fails at render time too. | Add the layer, or remove the id from `shown`. |
| `map-frame` | A `map`'s `frame` is not a label of its time-lapse layers' files; two time-lapse layers have different label lists; or a `numbers` key is in the frames of two time-lapse layers. | Use a label the message lists, give the files the same labels in the same order, or rename the key in one file. |
| `map-raster` | A map layer's raster JSON does not parse or breaks the raster format (a frame's `numbers` must be finite numbers), or an image it names is missing, in another case on disk, not a PNG, not 8-bit greyscale (color type 0 or 4), interlaced, has a color chunk (`gAMA`, `cHRM`, `iCCP`, `sRGB`) or a `tRNS` chunk, is over 2,000 × 2,000 pixels, or differs in size from the other frames; or a time-lapse holds more than 100 million pixels, every frame together. The message starts with the file's path. | Correct the JSON, or re-export the image as 8-bit greyscale (alpha for no data), not interlaced, without a color profile, at one size for every frame; use fewer or smaller frames. |
| `map-run` | A step moves a `map`'s `frame` and its run, with the step's other motion before it (a flight takes twice the step's duration), would last more than 20 s; it fails at render time too. Reported at the step that plays it. | Lower `pace` (default 700 ms a frame), or play the frames over two steps. |
| `map-compact-ignored` | Warning. A `map` with `compact: true` sets `labels`, `legend` (other than `false`), `numbers` or `inset`; a compact map draws none of them. One line per prop. | Remove the prop (`legend: false` for the legend), or drop `compact`. |
| `map-prop-unused` | Warning. A `map` sets `frame` or `pace` with no time-lapse layer, or a `numbers` key that no frame has. | Add a raster layer whose file has `frames`, or remove the prop; add the key to the frames' `numbers`, or remove it from `numbers`. |

### Lint

| Rule | Severity | Means | Fix |
|---|---|---|---|
| `figure-source` | error | A slide with a figure (`chart.*`, `map`, `map.*`, `big-number`) has no element with `role: "source"` in its initial props. | Add a source line, e.g. `{ id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: …" } }`. |
| `noop-step` | warning | The step's state (elements, props, visibility) equals the previous step's, so a click shows nothing new. This includes steps that only add `notes`. | Merge the step into the previous one, moving its notes there, or give it a patch. |

## check (headless Chrome)

Each step is a fresh load of the bare shell in capture mode, measured after fonts load and every component settles. Text is measured per line fragment, SVG text included.
- **Deduplication.** A layout problem is reported once per slide, element and rule, at its first step, with `(+N more steps)`.
- **What never gets measured:**
  - text that is invisible: hidden, opacity 0, or clipped away;
  - the engine's own error boxes;
  - elements that already failed.

| Rule | Means | Fix |
|---|---|---|
| `text-outside-canvas` | Text extends past the 1920×1080 canvas. | Move or shrink the element (its `box`, its region), or shorten the text. |
| `text-outside-region` | Text of an element in a region extends past the region's content box. Line overhang of half the leading plus 1 px is allowed. Elements with a `box` are exempt. | Shorten the text, use a smaller role (`note`), or widen the region with the slide's `regions` grid variables. |
| `text-overlap` | Text of two different elements intersects by more than 4 px in both directions. Reported on the later element, naming the earlier one. | Move one (region, `box`) or shorten the text. Elements hidden but keeping their space do not count, because they are invisible. |
| `font-too-small` | Text below `--min-audience-font` (28px). | Use a larger size or role. Only `role: "source"` and the `footer` region may be smaller. |
| `contrast` | Text contrast below 4.5:1 against its background. Text and background colors are named. | Use the theme's ink or muted color, or a darker palette color. |
| `render-error` | The engine reported an error: an element that failed (unknown component, binding error, `mount`/`update` threw, or `did not settle within 10s`) or a slide that failed. | Fix the error shown on the slide; the `measured` part is the message. |
| `console-error` | The page logged an error or threw. | Fix the script error (usually a custom component). |
| `network-error` | A request failed (HTTP ≥ 400 or never completed), shown as a path; or a request to another origin, shown as `remote <url> (blocked…)`. Check blocks every remote request (no remote requests at presentation time). | Fix the path, or add the missing file. For a remote one, copy the resource into the deck and use a relative path. |
| `step0-shows-all` | A multi-step slide shows the same thing at step 0 as at its last step: the same visible elements, text and props. | Hide elements until their step (`from`/`at`), change props per step (`set`/`only`/`advance`), or drop the extra steps. |

### `check --played`

`--played` adds a second pass. Every step is reached three ways, and the results are compared per element by visibility, text and box (rounded to 1 px):
1. jumping straight to it;
2. arriving animated from the step before;
3. arriving from the step after.

- **The summary count.** The summary line reports `N played arrivals compared`. A slide with `n` steps gives `2(n − 1)`: from the previous step at every step but the first, and from the next step at every step but the last. A one-step slide gives 0.
- **Run time.** The whole check takes a few seconds per slide. Use `--slide`, and `--step` to look at one step:
  - only that step is measured;
  - with `--played`, only its two arrivals are compared;
  - `step0-shows-all` is skipped, because it needs both ends of the slide.

| Rule | Means | Fix |
|---|---|---|
| `played-mismatch` | A played arrival differs from the jump, at its first differing step, with a count of the other differing arrivals. The component is not idempotent. | Make `update()` render the whole state from props, never from earlier calls, and leave no animation residue when it ends or is aborted. Built-ins pass this; look at your custom components. |

If the page reports that animation is off, or that it is hidden (a hidden page draws end states only), the played pass stops with an error, exit 2. It never quietly compares jumps with jumps.

## catalog

These are printed as `warning:` lines; `catalog` still exits 0.

| Rule | Means | Fix |
|---|---|---|
| `catalog-schema` | A component schema lacks a top-level `description`, or a prop lacks `description`, `examples` or `x-transition`; or a file is unreadable. | Add what the fix names to `schema.json`. |
| `catalog-name` | Two entries of different kinds share a name (a component and a layout, say). | Rename one with a namespace. |

## Known limits (they will bite)

- **Hex false positives.** `#123`, `#bad`, `#add` or `#cafe` in text are read as hex colors (`hex-color`). This catches hashtags and issue numbers too. Rephrase ("issue 123"), or put the text in a data file and bind it.
- **Strings ending in `.csv` or `.json` count as files.** A whitespace-free string prop such as `"results.csv"` must exist in the deck (`file-missing`), even when it is only a label. Add a space or other words ("file results.csv"), or bind it from data.
- **`check` contrast sees only ancestor backgrounds.** It does not see a sibling SVG rect, an image or a gradient under the text. Text over such a background can pass `check` and still be unreadable. Look at the shots.
- **Stale screenshots.** `shoot` overwrites the files it writes but never deletes old ones. After renaming a slide or a step, delete `my-talk/shots/` (or `shots/<size>/<slide>-*`) before shooting, or you will look at ghosts.
- **`text-overlap` has no opt-out.** Deliberately layered text (a label on a `box` over a chart) is flagged. Move it so the text boxes do not intersect.
- **`step0-shows-all` fires when a slide ends where it began.** Every element is back to its step-0 state at the last step, so the slide looks unchanged. End on a different state, or drop the last step.
- **`noop-step` fires on notes-only steps.** Put the notes on a step that changes something.
- **`figure-source` reads only initial props.** The source element must have `role: "source"` in its `props`, not only after a `set`.
- **`{{color:role}}` is not checked by validate.** An unknown role shows up only at run time, as a `render-error` from the markdown element.
- **`slide.style` is not scanned for hex colors.** It is scanned for remote URLs (`remote-url`) and `@import` (`style-import`). Keep it to tokens and relative paths anyway.
- **Inert options.** `sections` (deck) and `seconds` (slide) are accepted but have no effect in this version. (`section` on a slide is the kicker.)
