# Runtime API (window.STEPDECK, boot, flags, shells)

This page is the exact reference for the browser side of stepdeck: `boot()`, the `window.STEPDECK` object it sets, the query flags, the URL hash of the reveal shell, the two shells and the helpers that `core/stepdeck.js` exports. It is for people who embed a deck in a page, for tool builders who drive a deck from a script (the CLI does this through the bare shell), and for contributors who change the runtime.

Everything here comes from `core/stepdeck.js`, `core/shells/bare.js`, `core/shells/reveal.js`, `core/render.html`, `core/controller.js` and `core/fold.js`. Where `schema/stepdeck.d.ts` or the design doc (`docs/design/2026-11-18-engine-design.md` §9) say something else, the code is what is described here, and the differences are listed at the end.

If you only present a deck, [Presenting](../guide/presenting.md) covers the keys, the hash and the flags from the presenter's side. Agents should work through the [skill](../../skill/SKILL.md) and the CLI, not this API.

## Boot a deck

A deck's `index.html` calls `boot()` once. This is the page that `stepdeck new` writes (`templates/talk/index.html`):

```html
<script>
  if (new URLSearchParams(location.search).has("capture")) document.documentElement.classList.add("capture");
</script>
<script type="importmap">{ "imports": { "stepdeck/": "./stepdeck/" } }</script>
</head>
<body>
<script type="module">
  import { boot } from "stepdeck/core/stepdeck.js";
  boot({ shell: "reveal" });
</script>
```

The import map points `stepdeck/` at the engine copied into the deck (`<deck>/stepdeck/`). The example decks in the repo (`examples/kit/index.html`, `examples/spike/index.html`) are the same page with `"stepdeck/": "../../engine/"`, the repository's `engine/` folder. That is the only functional difference (the `<title>` and the HTML comment also differ). The inline script adds the `capture` class to `<html>` before anything loads; `boot()` adds it too, but only once the module runs.

### `boot(options)`

```js
boot({ shell = "bare", deckUrl, document = globalThis.document, location = globalThis.location } = {}) -> STEPDECK
```

| Option | Default | Meaning |
|---|---|---|
| `shell` | `"bare"` | `"bare"` or `"reveal"`. See [Shells](#shells). |
| `deckUrl` | `"./"` | The deck folder (the one holding `deck.js`), resolved against `document.baseURI`. A trailing `/` is added when missing. |
| `document` | `globalThis.document` | The document to render into. `window.STEPDECK` is set on its `defaultView`. |
| `location` | `globalThis.location` | Where the [query flags](#query-flags) are read from (`location.search`). |

What `boot()` does, in order:

1. Reads the query flags. With `?capture` it adds the `capture` class to `<html>`.
2. Builds the `STEPDECK` object and sets `window.STEPDECK` **synchronously**, before anything is awaited. A script that runs right after `boot()` can read it; its `slides` and `steps` are still empty until the deck has loaded.
3. Checks the shell name. An unknown name records `stepdeck: unknown shell '<x>' (available: bare, reveal)` in `STEPDECK.errors`, resolves `ready` and stops. Nothing is drawn: no stage, no canvas, no on-canvas message. Only `errors` tells you.
4. For `bare`, creates the stage at once, so a deck that fails to load still shows its error.
5. Resolves the deck folder and refuses one on another origin (see below).
6. Imports `<deck>/deck.js` and every `<deck>/slides/<id>.js`, and fetches the theme (`tokens.css`, `palettes.json`) and `components/index.json` from the engine.
7. Fills `STEPDECK.slides` and `STEPDECK.steps`.
8. For `reveal`, imports `core/shells/reveal.js` and builds the reveal host.
9. Picks the start slide and step, and navigates there. `ready` resolves when that navigation has finished.

`boot()` returns the same object it puts on `window.STEPDECK`.

### Paths and `ENGINE_ROOT`

- The engine root is `ENGINE_ROOT = new URL("../", import.meta.url)`: the folder above `core/stepdeck.js`. Layouts, themes, built-in components, vendor files and the shell CSS are all read from there, wherever the deck is.
- The deck root is `deckUrl` (default `"./"`, the page's own folder). Deck files are read from there: `deck.js`, `slides/<id>.js`, `components/<name>/` for deck components, and data files.

### Same-origin requirement

The deck must be on the same origin as the page. `boot()` compares the origin of the resolved deck URL with the origin of `document.baseURI`. On a mismatch it does not import anything and shows a fatal error:

```text
deck: deck must be same-origin with the page (got https://other.example, page is http://127.0.0.1:8000); use a relative path
```

Use a relative `deckUrl` (or `?deck=` in the bare shell).

### Boot errors

Boot errors stay in `STEPDECK.errors` for the life of the page. "Fatal" means nothing else is mounted and the line is drawn as the only thing on the canvas. In the bare shell, and in the reveal shell for errors raised before reveal is built (same-origin, `deck.js`), that canvas is all there is. For an unknown start slide in the reveal shell, reveal is already built: the fatal canvas replaces the first slide's content and the presentation chrome stays.

| Error | Fatal | Cause |
|---|---|---|
| `stepdeck: unknown shell '<x>' (available: bare, reveal)` | No canvas at all | `shell` is not `bare` or `reveal`. |
| `deck: deck must be same-origin with the page (got <origin>, page is <origin>); use a relative path` | Yes | See above. |
| `deck: cannot load <url>/deck.js: <message>` | Yes | `deck.js` is missing or throws on import. |
| `deck: deck.js lists no slides` | Nothing is mounted | `deck.slides` is empty or not an array. `ready` resolves and nothing is drawn (the bare shell shows an empty stage; the reveal shell is never built). |
| `deck: theme '<t>' not found (<message>)` | No | `themes/<t>/tokens.css` could not be fetched. Slides render without theme tokens. |
| `deck: palettes of theme '<t>' not found (<message>)` | No | `themes/<t>/palettes.json` could not be fetched. `ctx.palette()` returns `null`. |
| `deck: components/index.json not found (<message>)` | No | The engine's built-in list is missing. |
| `stepdeck: unknown slide '<s>' (slides: a, b, …)` | Yes | The start slide (`?slide=`) is not in the deck. |
| `stepdeck: <message>` | No | A navigation threw. |

A slide that cannot load is not a boot error. Its error, `<id>: cannot load slide: <message>` (for example `slide file exports id 'x', expected '<id>'`), shows on that slide's own canvas when it is on screen.

## `window.STEPDECK`

| Field | Type | Summary |
|---|---|---|
| `ready` | `Promise<void>` | Resolves once the first slide is shown at its start step. Never rejects. |
| `slides` | `string[]` | Slide ids in deck order. Empty until the deck has loaded. |
| `steps` | `Record<string, string[]>` | Step ids per slide, always as strings. |
| `errors` | `string[]` (getter) | Boot errors plus the errors of the slide on screen. |
| `settled()` | `() => Promise<void>` | Resolves when navigation, prefetch and every element update have finished. Never rejects. |
| `goTo(slide, step = 0)` | `(string, string \| number) => Promise<void>` | Shows a slide at a step. Never rejects. |
| `state()` | `() => SlideState \| null` | The folded state of the slide on screen. |
| `flags` | object | The query flags as boot read them, plus `motion` and `animate`. |

A typical script waits for `ready`, navigates, waits for `settled()`, then reads `state()` and `errors`. This is what the CLI does through the bare shell. In the browser console of a served deck (slide and step ids are illustrative; serve a deck with `stepdeck serve <deck>`, see [CLI](cli.md)):

```js
await STEPDECK.ready;
await STEPDECK.goTo("chart", "compare");
await STEPDECK.settled();
STEPDECK.state().stepId;   // "compare"
STEPDECK.errors;           // []
```

### `ready`

`ready` resolves after boot has navigated to the start slide and that slide's controller has applied its step. It also resolves when boot stops early: an unknown shell, a fatal error, a deck with no slides. It never rejects, so always check `errors` after it.

In the reveal shell, `ready` does not wait for the neighbouring slides that are prefetched. Use `settled()` for that.

### `slides` and `steps`

`steps[slide]` lists one entry per step:

- the step's `id`, as a string;
- the step's index as a string (`"0"`, `"1"`, …) when the step has no `id`;
- `["0"]` when the slide has no `steps` (or an empty array).

The helper that builds it is exported as [`stepIds`](#exports).

### `errors`

`errors` is a getter. Each read returns a new array of:

1. boot errors (the table above), plus errors that the reveal shell records (bad hash, refused `goTo`);
2. the errors of the slide on screen: slide errors (`<slide>: <message>`) and element errors (`<slide>/<element>: <message>`).

The errors of other slides are not included. In the reveal shell the slides next to the current one are mounted in advance, but their errors appear only once you navigate to them. To collect every slide's errors, visit each slide (as `check` and `dump` do).

### `settled()`

`settled()` resolves when, in this order:

1. the navigation queue has drained (every slide change queued so far, by `goTo` or by the shell);
2. the host is idle: in the reveal shell, every pending mount and neighbour prefetch has finished (the bare shell has no prefetch);
3. the current slide's controller has nothing in flight: every `update` call of the step being applied has settled, for every element, **hidden ones included**, and any target queued behind it has been applied too.

So `settled()` waits for more than the visible components. An element hidden at this step still gets its `update` when its props change, and `settled()` waits for it.

Each `mount` and `update` call has a 10 second watchdog (`SETTLE_TIMEOUT_MS` in `core/controller.js`). An `update` that never settles has its signal aborted; a `mount` (which gets no signal) that settles after its watchdog fired is destroyed at once. Either way the element fails with `<slide>/<element>: did not settle within 10s` and `settled()` goes on. A component that starts helpers (`ctx.animate.*`) without awaiting them inside `update` is not waited for; see [Custom components](../guide/custom-components.md).

`settled()` never rejects. Failures land in `errors`.

### `goTo(slide, step = 0)`

Shows `slide` at `step`. `step` is a step id (a string) or an index (a number).

```js
await STEPDECK.goTo("chart", "mark");  // by id
await STEPDECK.goTo("chart", 2);       // the same step, by index
await STEPDECK.goTo("plain", 1);       // a step without id: pass its index as a number
```

How it runs:

- **Same slide, no slide change queued:** the call goes straight to the slide's controller. A new step supersedes the one in flight: its signal is aborted, components snap to their end state, and only the latest target is applied. This is what makes fast key presses responsive.
- **Another slide** (or a slide change is still queued): the call is queued on the navigation queue, so slide changes happen one at a time and in order.
- **Animation:** a step animates only when it is exactly one step forward from the step last applied on that slide, and `flags.animate` is true. A slide change never animates; the arriving slide is shown directly.
- **Never rejects.** An unknown slide or step is recorded in `errors` and the promise resolves.

What an unknown target does depends on the shell:

| Target | Bare shell | Reveal shell |
|---|---|---|
| Unknown slide | The current slide is destroyed and an error canvas shows `<slide>: unknown slide`. `state()` returns `null`. | Refused before anything moves. Error `stepdeck: unknown slide '<s>' (slides: …)`. The talk, reveal and the hash stay where they were. |
| Unknown step on the current slide | Error `<slide>: unknown step '<x>' in slide '<slide>'`. The slide stays at its current step. | Refused. Error `stepdeck: unknown step '<x>' in slide '<s>' (steps: …)`. Nothing moves. |
| Unknown step on another slide | The current slide is destroyed; the new slide's layout is shown but no component is mounted; `state()` returns `null`; error `<slide>: unknown step …`. | Refused, as above. |

**Pass an index as a number, never as a string of digits.** The controller reads a string as a step id, and step ids may not be all digits (`validate` rule `step-id-numeric`), so `goTo("plain", "2")` fails with `plain: unknown step '2' in slide 'plain'`. In the reveal shell it is worse: the shell accepts `"2"` as an index, moves reveal and writes the hash `#/plain/2`, but the controller rejects it, so the screen, `state()` and the hash disagree. To turn a query or hash value into a step ref, use [`parseStepRef`](#exports), which turns digits into a number.

### `state()`

Returns the state of the slide on screen, or `null` when there is none (before the first step is applied, for an error canvas, or for a slide whose start step was unknown).

```js
{
  slide: "chart",           // slide id
  step: 1,                  // index, a number
  stepId: "compare",        // the step's id, or its index as a NUMBER when the step has no id
  title: "…",               // the "title" element's text at this step, or "". Raw: an accent title keeps its * marks and \* escapes
  notes: "…",               // step.notes ?? slide.notes ?? ""
  transition: null,         // step.transition, or null when the step has none
  elements: {
    chart: {
      type: "chart.line",
      props: { … },          // resolved props (bindings applied); raw props for a failed element
      visible: true,
      collapse: false,
      enter: undefined,      // copied from the element; inert
      exit: undefined,       // copied from the element; inert
      region: "main",        // present when the element sets one
      // box: { x, y, w, h } when the element sets one
    },
  },
}
```

`stepId` is not always a string. For a step without an id it is the index as a number: on a slide whose steps have no ids, `state()` at the second step gives `{ step: 1, stepId: 1 }`, while `STEPDECK.steps[slide][1]` is `"1"`. Compare with `String(state().stepId)` when you match against `steps`.

### `flags`

| Field | Type | Value |
|---|---|---|
| `slide` | `string \| undefined` | `?slide=` |
| `step` | `string \| number \| undefined` | `?step=`, parsed with `parseStepRef` (digits become a number; an empty value becomes `0`) |
| `capture` | `boolean` | `?capture` is present |
| `motion` | `boolean` | `true` when `?motion=full`, or when the browser does not ask for reduced motion |
| `animate` | `boolean` | `!capture && !receiver && motion`: whether forward-by-one moves animate on this page |
| `lang` | `string \| undefined` | `?lang=` (an empty value is ignored) |
| `theme` | `string \| undefined` | `?theme=` (an empty value is ignored) |

`flags.motion` is a boolean here, even though the query flag is a string. `?receiver` is not in `flags`; it shows only as `animate: false`.

## Step ids in different places

The same step is written four ways, depending on where you read it.

| Where | Step with id `"compare"` at index 1 | Step without id at index 1 |
|---|---|---|
| `STEPDECK.steps[slide][1]` | `"compare"` | `"1"` (string) |
| `STEPDECK.state().stepId` | `"compare"` | `1` (number) |
| `info.step` / `info.prevStep` in a component's `update` | `"compare"` | `1` (number) |
| `stepdeck dump --json` `stepId` | `"compare"` | `"1"` (string, taken from `STEPDECK.steps`) |
| Reveal hash | `#/chart/compare` | `#/plain/1` |
| `STEPDECK.goTo` and `?step=` | `"compare"` or `1` | `1` as a number (`?step=1` is parsed to a number) |

`state().step` is always the index as a number.

## Query flags

`readFlags(location)` reads these, for every shell:

| Flag | Value | Effect |
|---|---|---|
| `slide` | slide id | Start slide. In the reveal shell, used only when there is no usable hash. |
| `step` | step id or index | Start step, parsed with `parseStepRef`: digits are an index, anything else is an id, empty is `0`. |
| `capture` | presence | Screenshot mode: adds `capture` to `<html>` (CSS transitions and animations off), sets `ctx.capture`, and never animates. |
| `motion` | `full` | Animate even when the browser asks for reduced motion. Any other value is the same as no flag. |
| `lang` | language code | Overrides `deck.lang` (number formats, built-in strings). |
| `theme` | theme folder name | Overrides `deck.theme`. |
| `receiver` | presence | Marks a presenter preview frame. It never animates; in the reveal shell it also mutes media and leaves the hash alone. Not part of `STEPDECK.flags`. |

Resolution in boot:

- language: `?lang=`, else `deck.lang`, else `"en"`;
- theme: `?theme=`, else `deck.theme`, else `modern` (`DEFAULT_THEME` in `core/constants.js`).

Flags go before the hash: `index.html?lang=es&motion=full#/chart/mark`.

## The hash in the reveal shell

The reveal shell owns `#/<slide>/<step>`. The step part is the step's id, or its index for a step without one, exactly as in `STEPDECK.steps`. Both parts are written with `encodeURIComponent` through `history.replaceState`, so stepping does not add browser history entries. reveal's own hash, history and `hashchange` handling are switched off.

Parsing (`parseHash` in `core/shells/reveal.js`):

| Hash | Result |
|---|---|
| empty, or not `#/<slide>[/<step>]` | No engine hash; ignored. |
| `#/<slide>` or `#/<slide>/` | That slide at step 0. |
| `#/<slide>/<step>` | Digits are an index when no step has that string as its id; anything else is a step id. |
| escapes that do not decode | `{ error: "cannot decode '<hash>'" }` |

Where the audience window opens, first match wins:

1. a usable hash;
2. `?slide=` and `?step=`;
3. the first slide, at step 0.

Errors, all recorded in `STEPDECK.errors`:

| Case | Message | Result |
|---|---|---|
| Unknown slide in the hash on load | `stepdeck: unknown slide '<s>' (slides: …) in the URL hash` | Opens as if there were no hash. |
| Unknown step in the hash on load | `stepdeck: unknown step '<x>' in slide '<s>' (steps: …) in the URL hash` | Opens that slide at step 0. |
| Hash that does not decode, on load | `stepdeck: cannot decode '<hash>' in the URL hash` | Opens as if there were no hash. |
| Unknown step in `?step=` | `stepdeck: unknown step '<x>' in slide '<s>' (steps: …)` | Opens that slide at step 0. |
| Unknown slide in `?slide=` | `stepdeck: unknown slide '<s>' (slides: …)` | Fatal. |
| Bad hash typed while presenting | the same messages, with `in the URL hash` | The talk stays put and the current hash is written back. (Audience window only; preview frames ignore `hashchange`.) |

In the bare shell there is no hash. A bad `?step=` there leaves the slide unapplied (`state()` is `null`) with `<slide>: unknown step '<x>' in slide '<slide>'`.

## Shells

A shell decides what is mounted and where. `boot()` keeps the navigation queue and talks to the shell through a small host object.

### Bare shell

The bare shell shows one slide canvas, scaled to fit the window and letterboxed. It has no navigation of its own: `STEPDECK.goTo` drives it. Every CLI command that renders (`dump`, `check`, `check --played`, `shoot`) goes through it.

Its page is `core/render.html`:

```text
core/render.html?deck=<deck folder>&slide=<id>&step=<id|n>&capture&motion=full&lang=<l>&theme=<t>
```

- `deck` defaults to `../../`, which is the deck folder when the engine is copied to `<deck>/stepdeck/` (so `<deck>/stepdeck/core/render.html` needs no `deck` flag). This default belongs to `render.html`; `boot()`'s own default is `./`.
- The page maps `stepdeck/` to `../` and links `core/stepdeck.css` itself.
- One slide is mounted at a time. Showing another slide destroys the current one first.
- `createBareShell({ document })` returns `{ stage, show(root), scale(), destroy() }`. `stage` is a `div.sd-stage` appended to `<body>`. `show` replaces the stage's content with a canvas and fits it; `scale()` returns the current scale factor; the fit is recomputed on window resize.

### Reveal shell

The reveal shell is for presenting. reveal.js provides keyboard navigation, scaling, the presenter view (notes plugin) and the overview; the engine owns everything else. `core/shells/reveal.js` is imported only when `shell: "reveal"`.

On start it:

- injects `core/stepdeck.css`, `vendor/reveal/reveal.css` (no reveal theme) and `core/shells/reveal.css`, then imports the vendored reveal.js and its notes plugin;
- builds one `<section data-sd-slide="<id>" data-notes="…">` per slide. Each holds a `div.sd-host` (the slide's canvas, or until it is mounted a placeholder with the slide title, which the overview shows) and one `span.fragment.sd-step` per step after step 0. Fragment index `f` is engine step `f + 1`;
- writes `data-notes` on the section and each fragment from the folded notes of that step, HTML-escaped;
- initializes reveal with a 1920×1080 canvas, `hash`, `history` and `respondToHashChanges` off, `transition: "none"`, `controls: false` and `progress: true`.

While presenting it:

- turns reveal's `slidechanged`, `fragmentshown` and `fragmenthidden` events into `STEPDECK.goTo`, and moves reveal to match when `goTo` is called from anywhere else;
- mounts the slide shown and its neighbours (one before, one after), each once. The previous neighbour is prefetched at its last step and the next at step 0, the states reveal will show on arrival;
- pauses the slide it leaves; slides are destroyed only on `pagehide` when the page is not kept in the back/forward cache;
- in a preview frame (`?receiver`): mutes audio and video, turns off autoplay, leaves the hash to reveal, opens where reveal already is, and shows a `div.sd-motion-off` badge reading "motion off" when motion is off.

### The host interface

Both shells implement the same host object, which `boot()` drives:

```ts
interface Host {
  current: SlideRuntime | null;              // the slide on screen (a mountSlide result)
  show(slide: string, step?: StepRef): Promise<void>;  // mount if needed and apply the step
  showFatal(root: HTMLElement): void;        // put a fatal-error canvas on screen
  initial?: { slide: string; step: StepRef } | null;   // reveal: the start target from the hash
  navigated?(slide: string, step: StepRef): false | void;  // reveal: false refuses the target
  idle?(): Promise<void>;                    // reveal: resolves when mounts and prefetches are done
}
```

- `boot()` calls `navigated` first on every `goTo`. Returning `false` means the host recorded an error and nothing moves.
- `settled()` awaits `idle()` when the host has one.
- The reveal host also has `destroy()`, used on `pagehide`; boot does not call it.

This interface supersedes the one in design doc §9 (`goto(slide, step)`, `onChange`, `scale`), which was never implemented. The shell list is fixed (`bare`, `reveal`); there is no way to register another shell from a deck.

## Exports

`core/stepdeck.js` exports:

| Export | Signature | What it does |
|---|---|---|
| `boot` | `boot(options) -> STEPDECK` | See [Boot a deck](#boot-a-deck). |
| `readFlags` | `readFlags(location) -> { slide, step, capture, motion, lang, theme, preview }` | Parses the query flags. `motion` is the raw string; `preview` is `true` for `?receiver`. |
| `parseStepRef` | `parseStepRef(value) -> string \| number` | `null` or `""` give `0`; all digits give a number; anything else is returned as an id. Re-exported from `core/fold.js`. |
| `stepIds` | `stepIds(slideSpec) -> string[]` | The `STEPDECK.steps` entry for a slide spec. |
| `mountSlide` | `mountSlide(env, id, { capture, attach, document }) -> Promise<SlideRuntime>` | Mounts one slide into a frame. See below. |
| `loadFonts` | `loadFonts(document, css = "") -> Promise<string[]>` | Loads every font face the document declares. Returns one line per face that failed: `font '<family>' <weight> <style> failed to load (<urls>)`, or `(no URL declared in the theme)` when `css` declares none for it. |
| `rebaseCssUrls` | `rebaseCssUrls(css, base) -> string` | Rewrites relative `url(...)` references against `base`. Absolute, root-relative (`/…`), `data:` and `#fragment` URLs are kept. Used for theme tokens, which are injected as an inline `<style>`. |
| `ENGINE_ROOT` | `URL` | The engine root folder, `new URL("../", import.meta.url)`. |

The shell modules also export a few helpers: `createBareShell` and `CANVAS` from `core/shells/bare.js`; `createRevealHost`, `parseHash` and `formatHash(slide, stepId)` from `core/shells/reveal.js`.

### `mountSlide`

```js
mountSlide(env, id, { capture = false, attach, document = globalThis.document })
```

- `env` is the deck environment that boot builds while loading the deck (slide specs, registry, layout loader, data loader, format, palette, theme CSS). It is not exported, so in practice `mountSlide` is called by the shells only.
- `attach(root)` must put the canvas into the document, so it is laid out, before components mount.

It renders the slide's layout, loads every font face before any component measures, reads the theme tokens from the canvas, creates the slide controller and resolves to:

```js
{
  id,               // slide id
  root,             // the div.sd-canvas
  errors,           // getter: slide errors, then element errors
  goTo(ref, { animate }),  // applies a step; failures are recorded, never thrown
  settled(),        // resolves when the controller has nothing in flight; never rejects
  state(),          // { slide, ...controller state } or null
  pause(),          // aborts the in-flight step and pauses every component
  destroy(),        // destroys the controller and removes the canvas
}
```

`mountSlide` never throws. Anything that fails before the controller exists (unknown slide, a slide file that did not load, an unexpected exception) becomes an error canvas with the same shape, whose `state()` is `null` and whose `goTo` does nothing. A layout that cannot be loaded is recorded as `<id>: layout '<name>' not found (<message>)` and the slide renders without layout CSS.

## Types and known differences

`schema/stepdeck.d.ts` types `window.STEPDECK` (`Stepdeck`, `SlideState`, `ElementState`, `StepdeckFlags`), the component contract and the CLI output. Nothing imports it at run time. It mostly matches the code. The known differences:

| Type | The d.ts says | The code does |
|---|---|---|
| `SlideState.transition`, `UpdateInfo.transition` | `transition?: Transition` | Always present; `null` when the step has no `transition`. Treat it as `Transition \| null`. |
| `SlideState.title`, `SlideState.notes` | optional | Always strings, `""` when empty. |
| `SlideState.stepId`, `UpdateInfo.step` | `string \| number` | Correct, but note it is a number exactly when the step has no id (see [Step ids](#step-ids-in-different-places)). |
| `Box` | `x`, `y`, `w`, `h` all required (as in `schema/slide.schema.json`) | The renderer defaults `x` and `y` to `0` and leaves width or height unset when `w` or `h` is missing. Do not rely on this: `validate` rejects such a box. |
| `DumpStep.stepId` | `string` | `dump` output always has a string (it comes from `STEPDECK.steps`). The internal page measurement in `cli/dump.js` sets `stepId: null` when `state()` is `null`, but that value is not what `dump` prints. |
| `StepdeckFlags` | no `receiver` | Correct: `?receiver` is deliberately left out of `flags`. |

## See also

- [Presenting](../guide/presenting.md): keys, the presenter view, the hash and flags from the presenter's side.
- [Animation and motion](../guide/animation-and-motion.md): when a step animates and why jumps and played steps end the same.
- [Custom components](../guide/custom-components.md): the component contract that `update`, `info` and `settled()` depend on.
- [Deck and slide spec](deck-and-slide.md): every key of `deck.js` and slide files.
- [CLI](cli.md): `dump`, `check` and `shoot`, which drive the bare shell.
