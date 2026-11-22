# Adding a built-in component

This page covers adding a component to the engine itself, so that it ships in `components/` and every deck gets it. It is for contributors who change the stepdeck repository. If you only need a component for one deck, write a deck component instead. That one lives in the deck's own `components/<namespace.name>/` folder and is scaffolded by `new-component`. See [Writing a custom component](../guide/custom-components.md).

A built-in and a deck component follow the same contract: `mount`, `update`, the `info` argument and `ctx`, described in the [component contract](../reference/component-contract.md). A built-in has more to do on top of that. It is registered in `components/index.json`, it is tested in the repository, it may get its own `validate` rule and its CSS goes in `core/stepdeck.css`. It also needs a reference page.

## Checklist

Each line links to its section below.

- [ ] [Folder](#create-the-folder) `components/<name>/` holds `index.js`, `schema.json`, `README.md` and `example.js`.
- [ ] [Name](#pick-a-name) added to `components/index.json`. It must not clash with a layout, a theme or a deck component in use.
- [ ] [Schema](#write-schemajson): closed, with a top-level `description` and `description`, `examples` and `x-transition` on every prop. A full `catalog <folder>` run prints no `catalog-schema` warning.
- [ ] [`x-transition`](#make-x-transition-honest) matches what `index.js` really animates.
- [ ] [`update`](#implement-mount-and-update) writes the state first and removes its inline styles last, so a jump equals a play.
- [ ] [Fill](#decide-whether-it-fills-its-region): a `[data-type]` rule in `core/stepdeck.css` if it should fill its region.
- [ ] [README and example](#write-readmemd-and-examplejs) follow the existing format.
- [ ] [Semantic checks](#add-semantic-checks-to-validate) (optional): a pure problems function, wired into `validate`, with a fixture and a test.
- [ ] [Tests](#write-the-tests): unit tests for pure helpers, plus a fixture deck and a browser test using the played helpers.
- [ ] [Docs](#update-the-docs): `docs/reference/components/<name>.md`, the component tables, and `skill/references/components.md`.

## Create the folder

A built-in is a folder named after the component, dots included. The registry (`core/registry.js`) loads `<root>/<name>/index.js` and `<root>/<name>/schema.json` and nothing else.

```
components/<name>/
  index.js      the component: export default { mount(el, props, ctx) }
  schema.json   the props, as a JSON Schema 2020-12 (read by validate and catalog, never imported)
  README.md     props table and behaviour (served by catalog)
  example.js    one example slide (its path is served by catalog)
  derive.js     optional: pure state helpers (list, chat, terminal)
  place.js      optional: pure geometry and problems (diagram)
```

Put the logic that does not need the DOM in a separate pure module, the way `list/derive.js`, `timeline/stops.js` and `diagram/place.js` do. You can unit-test it in plain Node, and `validate` can import it (see [Add semantic checks](#add-semantic-checks-to-validate)). `components/list/derive.js` is the model. `deriveList(props)` turns the props into `{ items: [{ id, index, text, sub, marker, visible, done, active }] }`. It throws an error that names the bad value, such as `list has a duplicate item id '<id>'`, so the slide shows that error instead of a blank list.

`new-component` scaffolds only deck components: it requires a dotted name, and it refuses built-in names. For a built-in, start from an existing component of a similar shape. `list` is a good start for items revealed by step, `timeline` for a single tweened value, and `diagram` for SVG geometry.

## Pick a name

Add the name to `components/index.json`. That file is the only list of built-ins. Nothing scans the folders, but `test/unit/components-index.test.mjs` checks that the list matches exactly the folders of `components/` that hold an `index.js`. The order of the file is the order that `docs/reference/components/index.md` uses.

```json
["text", "chart.line", "chart.bar", "chart.points", "terminal", "markdown", "big-number", "list", "diagram", "chat", "timeline", "image", "map"]
```

Check the name against these rules:

| Clash | What happens | Where |
| --- | --- | --- |
| A deck component with the same name | The registry throws `component '<n>' collides with built-in; use a namespace like 'my.<n>'`, and `validate` reports `component-collision`. `deck.schema.json` allows undotted deck component names, so a new built-in name can break an existing deck. Search `examples/` and `test/fixtures/` for `components:` entries before you pick one. | `core/registry.js`, `cli/validate.js` |
| A layout or a theme with the same name | `catalog` warns `catalog-name`. Layout names include `title`, `statement` and `halves`. | `cli/catalog.js` |
| `chart.*`, `map`, `map.*` or `big-number` | The type counts as a figure: its slide needs an element with `role: "source"`, or `validate` reports `figure-source`. Any new `chart.` name gets this check for free. A data figure under another name does not get it unless you add the name to `FIGURE`. | `cli/validate.js` (`FIGURE`) |

Deck components must contain a dot (`new-component` enforces `/^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/`). Built-in names may be plain (`list`) or a family with a dot (`chart.bar`). Use lowercase letters, digits, `-` and `.`.

## Write `schema.json`

The schema is what `validate` checks props against and what `catalog` shows agents. It must:

- be a JSON Schema 2020-12 object schema with `"additionalProperties": false`, so a typo is `unknown-prop`, not silently ignored;
- list in `required` the props without which nothing sensible renders;
- have a top-level `description`. Its first sentence becomes the catalog `summary`. `firstSentence` in `cli/catalog.js` cuts at the first `.`, `!` or `?` that is followed by a space and a capital letter, a backtick, `"` or `(`. Write the first sentence so it stands alone;
- give every prop a `description`, a non-empty `examples` array and an `x-transition` of `tween`, `draw`, `fade` or `snap`. A prop without them is the `catalog-schema` warning `prop '<key>' lacks <what>`;
- put a `default` on a prop only when `index.js` really uses that value when the prop is absent. The catalog's JSON detail (`catalog <name> --json`, or `catalog/<name>.json` from a full run) carries it.

Two tests and one rule guard the schema. `test/unit/schemas.test.mjs` compiles the `schema.json` of every folder in `components/` with `createAjv()` from `cli/ajv.js` and `ajv.compile`. That instance is strict and registers only `x-transition`, so any other `x-*` keyword fails this test, even though `validate` accepts it (its `compile()` registers every `x-*` keyword it finds in the schema first). `validate` reports `component-schema` for any engine schema that does not compile, whether a deck uses the component or not. And `test/unit/catalog.test.mjs` checks that the catalog lists exactly the names in `components/index.json`.

A prop from `components/list/schema.json`:

```json
"shown": {
  "type": "integer",
  "minimum": 0,
  "description": "How many items are visible (items 0..shown-1); all when absent. Hidden items keep their space, so the list never reflows. New items rise and fade in, staggered, on a forward step.",
  "examples": [0, 2],
  "x-transition": "fade"
}
```

Check the result with `catalog`. `catalog <name> <folder>` prints the entry as text: the full schema description, each prop with its transition, required flag, description and examples, and the example path. It prints no README and no `default`; those are in the JSON detail (`catalog <name> <folder> --json`). It prints no warnings either. Only the full run, `catalog <folder>` without a name and without `--json`, prints `catalog-schema` and `catalog-name` as `warning:` lines. The full run also rewrites `<folder>/catalog/`. Run from the repository root, that is the repository's git-ignored `catalog/` folder, so use a scratch deck (see [Try it](#try-it-before-you-open-a-pull-request)) if you want to keep it as it is.

```sh
node cli/index.js catalog list .   # one entry, no warnings
node cli/index.js catalog .        # every entry, warnings, rewrites ./catalog/
```

## Make `x-transition` honest

`x-transition` is metadata only. `cli/ajv.js` registers it as a keyword that does nothing. The catalog lists every prop whose value is not `snap` as `animates`, and the reference tables copy that list. The engine never reads it, and no check compares it with the code. So it is up to you to keep it true:

| Value | Use it when a forward step that changes the prop… |
| --- | --- |
| `tween` | interpolates a number or a shape (`timeline` `progress`, `chart.line` `y`). |
| `draw` | draws a stroke or grows a mark (`list` `done`, `diagram` `shown`, `chart.bar` `shown`). |
| `fade` | fades something in or between two colors (`text` `text`, `list` `shown` and `active`). |
| `snap` | renders the new state with no motion (structure, data paths, enums such as `marker`). |

If `index.js` does not animate a prop, mark it `snap`. Props that rebuild the structure are `snap` even when the rest of the component animates. `list` rebuilds its rows when `items` or `marker` change and plays no motion, so both are `snap`.

## Implement `mount` and `update`

`mount(el, props, ctx)` builds the DOM once inside `el` and returns `{ update(props, info), destroy() }` (and optionally `pause()`, or `anchor(ref)` as `chart.line` has). Everything on screen must be a pure function of the props: never read the step number or the slide. Slides drive the component through `set` and `advance` on its props.

The rule the CLI enforces is **jump equals play**. The markup after playing forward to step k must be the same as the markup after loading step k directly, and so must the markup after going back to k or after a move cut short. `check --played` covers the forward and backward arrivals: for each element it compares visibility, text content and box with a jump to k. It never tests an interrupted move. Only the browser test helpers do that (`expectInterruptEqualsJump`), and they compare the element's `outerHTML` exactly. `components/list/index.js` shows the pattern:

```js
async update(props, info = {}) {
  const draw = info.entrance?.motion === "draw" && !info.signal?.aborted;  // its own entrance (x-enter: own)
  const animate = draw || (canAnimate(info) && !info.entered);  // appearing otherwise: the box moves, not the items
  const before = animate && !draw ? snapshot() : null;  // read the old state only when there is motion to play
  const { rebuilt } = renderState(props);        // 1. write the target state straight into the DOM
  clearInline();                                 // 2. no inline style from an earlier, aborted move survives
  if (!animate || (!draw && (rebuilt || before.length !== rows.length))) return;  // 3. jump, backward, first render, rebuild

  const opts = motion(info, ctx);                // the theme's timing, or the step's transition
  if (draw && info.entrance.duration !== undefined) opts.duration = info.entrance.duration;
  // ... collect what changed between `before` (nothing, for an entrance) and the new state, and write each
  //     item's start state now, before any await, so nothing paints before its turn ...
  try {
    await Promise.all([
      ctx.animate.stagger(risers, async ({ li }, _i, o) => { li.style.opacity = ""; await ctx.motion.in(li, "rise", { ...opts, signal: o.signal }); }, opts),
      ...fades.map(({ paint, from, to }) => ctx.animate.tween(from, to, paint, opts)),
      ...draws.map((tick) => ctx.animate.drawPath(tick, opts)),
    ]);
  } finally {
    clearInline();                               // 4. remove every inline style the motion used
  }
}
```

The engine sets `info.animate` only when motion was requested and the move is forward by exactly one step from the last applied step. Every other move, and the first `update` after mount, has `animate: false`. The first `update` also has `prev: null`, every key in `changed` and `entered` equal to the element's visibility. A new `goTo` aborts `info.signal`. Every `ctx.animate` and `ctx.motion` helper then snaps to its end state and resolves, so after an abort the `finally` still leaves the target state. An `update` that has not settled after 10 s fails the element with `did not settle within 10s`.

**Entrances.** When an element appears on an animating step, the engine moves its box (the theme's `--sd-enter`, or the slide's `enter`), so a component must not also fade itself in on `info.entered`. A component with a natural build declares `"x-enter": "own"` at the top of its `schema.json` instead: the engine then keeps the box still and passes `info.entrance = { motion: "draw" | "none", duration }` in the update where the element appears, after its stagger hold. On `"draw"` the component plays its build from empty to the props, writing the start state before the first `await` (the engine shows the element in the same task); on `"none"` it renders at once. See [Animation and motion](../guide/animation-and-motion.md#which-system-plays-an-entrance).

### Helpers to use

From `core/kit.js` (no imports, no DOM beyond the document you pass):

| Helper | What it does |
| --- | --- |
| `canAnimate(info)` | `info.animate === true` and the signal is not aborted. Gate all motion on it. |
| `motion(info, ctx, opts)` | `ctx.motion.timing(info, opts)`: `{ duration, ease, stagger, signal }` from the theme tokens, overridden by the step's `transition`; `opts` is `{ factor, fast }`. Without a `ctx`, `{ signal, duration: info.transition?.duration }`. |
| `motionMs(info, ctx, factor = 1)` | The step's `transition.duration`, else `factor` x the theme's `--sd-duration` (400 ms when unknown). The charts use factor 2. |
| `el`, `svgEl`, `xhtmlEl`, `sizeSvg` | Create HTML, SVG and foreignObject elements. Always pass `el.ownerDocument`, never the global `document`. |
| `measureWidth`, `measureHeight` | The node's size in canvas pixels, else `ctx.size`, else 0. |
| `inkMix(p)` | A text color between `--sd-color-muted` (0) and `--sd-color-ink` (1), for emphasis that keeps contrast. |
| `focusPaint(ctx, color, dimmed)` | `color`, or the theme's `--sd-color-dim` (else `--sd-color-rule`) when `dimmed`. The look of a mark out of focus; never fade by opacity. |
| `tweenColor(ctx, from, to, set, opts)` | Tweens a color in RGB through `ctx.animate.tween` and `ctx.d3`, calling `set(color)` each frame; `opts` is `motion(info, ctx, { fast: true })` for a focus change. |
| `num`, `lerp`, `clamp01`, `escapeHtml`, `message`, `memoAsync` | Small helpers for numbers, text, errors and caches. |

From `ctx.motion` (`core/motion.js`): `in(node, name, opts)` and `out(node, name, opts)` play a named motion (`fade`, `rise`, `wipe`, `pop`, `draw`, `none`) on one node with the theme's duration, easing and rise distance, and put back the inline styles they touched; `timing(info, opts)` is the timing above. Item motions use these names, so an item and a box move the same way.

From `ctx.animate` (`core/animate.js`): `fadeIn`, `reveal`, `drawPath`, `tween(from, to, onValue, opts)` and `stagger(items, fn, opts)` (`opts.stagger` apart, else 60 ms; pass `motion(info, ctx)` so it is the theme's `--sd-stagger`). Call them through `ctx.animate`, not by importing them, so that tests that stub `ctx.animate` also stub your motion. Import only the helpers that are not part of `ctx.animate`, and pass `ctx.animate` into the ones that take it:

| Import from `core/animate.js` | What it does |
| --- | --- |
| `clearInlineStyle(...nodes)` | Removes every inline style and the `style` attribute itself. Call it after rendering and in `finally`. |
| `rise(ctx.animate, node, opts)` | Fades a node in while it moves up by `--sd-space`. Legacy: the built-ins use `ctx.motion.in(node, "rise", opts)`, which travels `--sd-motion-distance`. |
| `typeCount(ctx.animate, total, onCount, opts)`, `typingMs(chars)` | Typing at 28 ms per character, at most 1400 ms. |

For a chart, `core/chart.js` has `loadTable(props, ctx, name, columns)`, which loads a CSV and gives the shared column errors (`column '<c>' not found in <data> (columns: …)`), and `tickFormat` and `opacityAttr`. Author text goes through `renderInline` or `renderBlock` from `core/inline.js`, which escape raw HTML and keep only safe link URLs.

Colors, fonts and sizes come from theme tokens and `ctx.palette()`, never literals. Built-ins put their CSS in `core/stepdeck.css`, in a section headed `/* <name> component: … */`. They do not set inline styles for layout. Text the audience reads must be at least `--sd-min-audience-font`, because `check` reports `font-too-small` otherwise.

Errors: throw an `Error` whose message names the bad value and what is allowed, as `deriveList` does. The controller records it as `<slide>/<element>: <message>` and shows it on the canvas, and the element gets no further calls.

## Decide whether it fills its region

A region is a column flexbox, and an element takes only the height of its content. A component that draws to the size of its box, such as an SVG that measures itself, needs a rule that stretches it. There are two mechanisms:

- **By type, in any layout.** `core/stepdeck.css` stretches seven types wherever they are (`chart.line`, `chart.bar`, `chart.points`, `diagram`, `image`, `map` and `terminal`), with one rule; `terminal` and `image` add their own `display` in their sections:

  ```css
  .sd-region > .sd-el:is([data-type="chart.line"], [data-type="chart.bar"], [data-type="chart.points"], [data-type="diagram"],
    [data-type="image"], [data-type="map"], [data-type="terminal"]):not(.sd-collapsed):not(.sd-failed) { flex: 1 1 0; min-height: 0; }
  .sd-el[data-type="terminal"]:not(.sd-collapsed):not(.sd-failed) { display: flex; flex-direction: column; }
  ```

  Add a new type to the `:is()` list. If your rule sets `display`, add `:not(.sd-collapsed):not(.sd-failed)` as `terminal` and `image` do (the shared rule has it too). A type rule is at least as specific as `.sd-el.sd-collapsed` (`display: none`) and comes later in the file. Without the `:not`, its `display` would win and a collapsed element would show again.
- **By layout, only as the only child.** `figure-notes` (main), `halves` (both halves) and `title` (figure) stretch a region's only element of any type (`> .sd-el:only-child { flex: 1 1 0; min-height: 0; }`). `statement` and `full-bleed` have no such rule.

Add a type rule if the component should fill its region whatever the layout. Without one, it is sized by its content or depends on the layout's only-child rule. Say which in the README.

## Write `README.md` and `example.js`

Agents never read `index.js`. `catalog <name>` prints the schema description, the props with their examples, and the example's path. The README is in the JSON detail (`catalog <name> --json`, or `catalog/<name>.json` from a full run). Follow the format of the existing READMEs (`components/list/README.md`):

1. `# <name>`, then one or two sentences on what it shows.
2. A props table with the columns `Prop | Type | Default | Transition | Meaning`, one row per schema prop in schema order. The Transition column repeats `x-transition`.
3. A `Behaviour:` list with bold lead-ins. Cover how steps drive it (it reads only props), its motion (forward by exactly one step only), that it is idempotent (no inline styles survive), its layout (what keeps its space, whether it fills its region) and its errors.
4. `` See `example.js` for a slide that uses it. ``

The README is copied into decks through the catalog. Do not cite design-spec sections (`spec §…`) or repository-only paths there: a deck has neither.

`example.js` is one slide that exports `default { id, layout, elements, steps }` and uses the component the way a real slide would. Keep fragments realistic: plausible text, a layout that suits the component, steps that drive the state props with `advance` or `set`, and data paths that exist. From `components/list/example.js`:

```js
export default {
  id: "list-example",
  layout: "full-bleed",
  title: "Three steps",
  elements: [
    { id: "steps", region: "main", type: "list",
      props: { marker: "number", shown: 0, items: [
        { text: "Define the **question**" },
        { text: "Gather the data", sub: "Sources in `data/`" },
        { text: "Fit the model" },
      ] },
      advance: { prop: "shown", values: [0, 1, 2, 3], start: "start" } },
  ],
  steps: [{ id: "start" }, { id: "first" }, { id: "second" }, { id: "third" }],
};
```

Every `example.js` runs as a slide in the gallery deck (`site/gallery`), and the tests hold it to the same bar as the example decks. A new component needs a gallery slide: add its name to `COMPONENTS` in `site/gallery/deck.js` (in `components/index.json` order) and a file `site/gallery/slides/<name>-example.js` (a dot in the name becomes a dash) that re-exports the example with a `notes` line naming its reference page, as the others do. Put any data or asset file the example reads in `site/gallery/data/` or `site/gallery/assets/`. `test/unit/gallery.test.mjs` fails until the slide exists and requires the deck to validate; `test/browser/gallery.test.mjs` requires `check --played` to pass under both shipped themes.

## Add semantic checks to `validate`

The schema covers types, enums and required props. Some mistakes are only visible across props, such as an id in `shown` that names nothing. `diagram` is the model for these:

1. **A pure problems function** in the component folder. `diagramProblems(props, { gap, pad })` in `components/diagram/place.js` returns `[{ rule, id, message, limit, fix }]`, where `rule` is `diagram-id` or `diagram-overlap`. The module must have no imports and no DOM access, because `cli/validate.js` imports it statically and runs in plain Node.
2. **Wire it into `validate`.** In `cli/validate.js` it runs only when the resolved props pass the schema, at every step, and each item is mapped through `componentProblem` from `cli/problems.js` (`measured` is the message):

   ```js
   if (validate(resolved)) {
     if (type === "diagram") {
       for (const item of diagramProblems(resolved, env.spacing)) report(`${id}|${item.rule}|${item.message}`, componentProblem({ slide, element: id, step }, item));
     }
     return;
   }
   ```

   `report` deduplicates, so each problem appears once per element, at the first step where it occurs. Add a branch like this one for your type and import your function at the top of the file.
3. **Throw the same finding at run time**, so the canvas and `validate` agree. `diagram/index.js` throws on the first `diagram-id` item: `` throw new Error(`diagram: ${bad.message} (${bad.limit})`) ``. `diagram-overlap` is reported by `validate` only. The diagram still renders, with touching boxes.
4. **A fixture and a test.** Add a minimal deck under `test/fixtures/validate/<case>/` (`deck.js` and `slides/`) that triggers exactly the new rule, plus a case in `test/unit/validate.test.mjs`:

   ```js
   test("diagram: sibling groups that share a cell are diagram-overlap", async () => {
     const problems = await validate(fixture("diagram-overlap"));
     assert.deepEqual(rules(problems), ["diagram-overlap"], show(problems));
   });
   ```
5. **Document the rule names** in [the rules reference](../reference/rules.md) and in `skill/references/checks.md`. The skill's table does not list `diagram-id` and `diagram-overlap` today, so do not copy that gap.

See [Adding a rule](adding-a-rule.md) for rules that are not tied to one component.

## Write the tests

**Unit tests** (`npm test`, plain `node:test`, no browser) for the pure modules: one file `test/unit/<name>.test.mjs` that imports `derive.js`, `place.js` or similar and checks the derived state and every error message. `test/unit/list.test.mjs` and `test/unit/diagram-place.test.mjs` are the models. The registration, schema and catalog tests named above run in the same suite and fail until the component is registered correctly.

**Browser tests** (`npm run test:browser`, Playwright from `STEPDECK_PLAYWRIGHT`). Add:

- a fixture deck `test/fixtures/decks/<name>/` with `deck.js` and one slide per behaviour (reveal, each motion, each error). Use synthetic values. `test/fixtures/decks/list/` is in Spanish, so it also covers `lang: "es"`;
- `test/browser/<name>.test.mjs`, which opens pages with `withPage` from `cli/browser.js` and checks motion with the helpers in `test/browser/helpers.mjs`.

| Helper | Asserts |
| --- | --- |
| `expectJumpEqualsPlayed(ctx, page, { pages, slide, steps, id })` | Playing forward through `steps` with `motion=full` gives the same `outerHTML` at each step as loading that step, with no errors. |
| `expectBackwardEqualsJump(ctx, page, { pages, slide, steps, id })` | Going back from step i to i-1 equals a jump to i-1. |
| `expectInterruptEqualsJump(ctx, page, { pages, slide, from, via, to, id })` | Re-targeting 100 ms into a move equals a jump to `to`, and no inline style is left inside the element. |
| `expectAnimatedStepMoves(ctx, page, { pages, slide, from, to, id, probe? })` | A sample 120 ms into a forward step differs from the end state, so the motion is real. |

From `test/browser/list.test.mjs` (shortened; the file also imports `assert`, `check` and the other helpers):

```js
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { deckPages, expectJumpEqualsPlayed } from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const pages = deckPages("test/fixtures/decks/list/");
const REVEAL = ["none", "one", "two", "three"];
const CHECK = ["start", "first", "second", "all", "byid"];

test("jump equals played: reveal and checklist", async () => {
  await withPage({ root, url: pages.url("reveal", "step=none") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "reveal", steps: REVEAL, id: "list" });
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "check", steps: CHECK, id: "list" });
  });
});
```

Run one file while you work:

```sh
STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test test/browser/list.test.mjs
```

If you also add a slide to `examples/kit`, update the `STEPS` table in `test/browser/kit.test.mjs`. That test requires the kit deck to stay clean under `validate`, `check` and `check --played`. See [Testing](testing.md) for the fixture conventions.

## Update the docs

- Add `docs/reference/components/<name>.md`. Start with an intro paragraph and a `Sources:` line (only `markdown.md` lacks one today), then Use it (examples copied from a real deck), Props and Motion, and Errors when the component can fail. The rest varies: topic sections of the component's own (markers, scales, layout, sizing), a markup section ("What it renders", "Markup" or "Markup and size"), Gotchas, and a closing "For agents" or "See also". Use `list.md` or `timeline.md` as the model. On disk the dotted names use a hyphen (`chart-line.md`, `chart-bar.md`).
- Add a row to the table in [`docs/reference/components/index.md`](../reference/components/index.md), in `components/index.json` order, with the columns Component, What it shows, Required props (the schema's `required`), Animated props (the non-`snap` props) and Page. Link the hyphenated file name, not the component name.
- Add a row to the component table in [`docs/index.md`](../index.md): a link to `reference/components/<hyphenated name>.md` and a one-line description.
- Add a paragraph to [`skill/references/components.md`](../../skill/references/components.md). Agents read it with the catalog.
- If you added a recipe to `examples/kit`, add it to [`skill/references/cookbook.md`](../../skill/references/cookbook.md).

## Try it before you open a pull request

You can run the whole loop on a scratch copy without touching `components/`. `new` copies the engine into `<deck>/stepdeck/`, and the CLI uses that copy for the deck:

```sh
node cli/index.js new /tmp/try-quote
# add /tmp/try-quote/stepdeck/components/quote/{index.js,schema.json,README.md,example.js}
# append "quote" to /tmp/try-quote/stepdeck/components/index.json
# CSS: add a /* quote component: … */ section to /tmp/try-quote/stepdeck/core/stepdeck.css
# copy example.js to /tmp/try-quote/slides/quote.js and add "quote" to slides in deck.js
node cli/index.js catalog quote /tmp/try-quote     # shows "quote · component (built-in)" and its props
node cli/index.js catalog /tmp/try-quote           # warning: lines for any catalog-schema problem
node cli/index.js validate /tmp/try-quote
STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node cli/index.js check /tmp/try-quote --played
```

When all three are clean, move the folder into `components/`, move the CSS section into the repository's `core/stepdeck.css`, add the name to the repository's `components/index.json` and write the tests.

## See also

- [Writing a custom component](../guide/custom-components.md): the deck-component version of this page.
- [Component contract](../reference/component-contract.md): `mount`, `update`, `info` and `ctx`.
- [Animation and motion](../guide/animation-and-motion.md): when the engine animates.
- [Rules reference](../reference/rules.md): every `validate` and `check` rule.
- [Adding a rule](adding-a-rule.md), [Testing](testing.md), [Conventions](conventions.md).
