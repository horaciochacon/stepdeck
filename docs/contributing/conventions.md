# Code conventions

This page is for contributors who change the engine, a built-in component, a layout, a theme or the CLI. It lists the conventions the code base already follows: how modules are written and loaded, the rules the runtime depends on, which shared helpers to reuse, how error messages are worded, how CSS is named, how docs are kept in step, and how commits are titled. Nothing here is enforced by a linter or formatter (the repository has none), so reviews check it by hand. When this page and the code disagree, the code wins; fix the page.

For the setup and the development loop, see [Contributing](index.md). For tests, see [Testing](testing.md).

## Write and import modules

| Convention | Where it shows |
| --- | --- |
| ES modules everywhere. | `package.json` has `"type": "module"`. Runtime and CLI files are `.js`; test files are `.test.mjs`. |
| Node 20 or later for the CLI. | `"engines": { "node": ">=20" }`. The test scripts need Node 22.15 or later (see [Testing](testing.md)). |
| No build step, no bundler. | Decks load `core/`, `components/`, `layouts/` and `themes/` as plain files through one import map (`"stepdeck/": "./stepdeck/"` in a deck made by `new`). Do not add a compile, transpile or minify step. |
| Relative imports with explicit `.js` extensions. | `import { motion } from "../../core/kit.js";` in a component. Browsers resolve these as-is. Node code outside the engine (`cli/`, `test/`) writes `#engine/core/kit.js` instead (the `imports` field of `package.json` maps `#engine/*` to `./engine/*`). |
| Node built-ins with the `node:` prefix. | `import { join, resolve } from "node:path";` in `cli/`. No file in `core/` or `components/` imports a Node built-in. |
| Runtime code that Node also loads stays DOM-free. | `core/constants.js` and `core/color.js` say "No imports, no DOM: Node loads it too"; `core/fold.js` says "No imports, no DOM, no I/O"; `core/kit.js` is a leaf module with no DOM access beyond a document the caller passes in. The CLI imports `constants.js`, `color.js` and `fold.js` directly, and loads `kit.js` through `core/data.js` and `core/registry.js`. |
| Each module opens with a comment that states its contract. | For example `core/fold.js` ("Pure fold engine ... No imports, no DOM, no I/O") and `cli/problems.js` (the `Problem` shape and `formatProblem` output). Many exported helpers carry a one-line `/** ... */` doc comment, but not all do (for example `problem` and `formatProblem` in `cli/problems.js`); add one when you add an export. |

### Add or update a vendored library

Runtime libraries are copied into `vendor/`, never loaded from `node_modules/` or a CDN:

| Folder | Library | Used by |
| --- | --- | --- |
| `vendor/d3/` | d3 7.9.0, `d3.min.js` (UMD) | Charts and helpers, always through `core/d3.js` |
| `vendor/marked/` | marked 18.2.1, `marked.esm.js` | `core/inline.js` (the `markdown`, `list`, `chat`, `diagram`, `timeline` and `image` components) |
| `vendor/reveal/` | reveal.js, its CSS and the notes plugin | The reveal shell (`core/shells/reveal.js`) |

Each folder keeps its own `LICENSE`. `THIRD_PARTY_NOTICES.md` at the repository root records the version, license and files of each library, the sub-notices that minification strips from the d3 bundle (ColorBrewer, d3-ease, d3-geo, Delaunator, internmap), the vendored fonts and the palette sources. `new` copies both `vendor/` and `THIRD_PARTY_NOTICES.md` into every deck.

When you add or update a vendored file:
- Only permissive licenses, as recorded in `THIRD_PARTY_NOTICES.md`. The existing set is MIT, ISC, BSD, Apache-2.0 (the ColorBrewer schemes inside d3), OFL for fonts, and CC0 or public domain for palette and map data.
- Put the license file next to the code and add a row to `THIRD_PARTY_NOTICES.md`.
- Import d3 through `core/d3.js`, which handles the UMD bundle in the browser and in Node. Never import `vendor/d3/d3.min.js` directly.

The npm `devDependencies` (`ajv`, `marked`) are for development only. Ajv is never copied into decks, and `validate` imports it lazily, so every other command works without `npm install`.

## Keep the runtime rules

These are the properties the engine and the checks rely on. A change that breaks one of them is a bug even if every test passes.

### The fold is pure

`core/fold.js` turns a slide definition and a step index into a state. It has no imports, no DOM and no I/O, and `mergePatch` never mutates or aliases its inputs (values are copied with `structuredClone`). The same slide and step must always fold to the same state. `validate` relies on this: it folds every step of every slide in plain Node. Keep new step features inside the fold, with no side effects.

### Components end at the target state

A component's `update(props, info)` must leave the same markup whether it animated, was aborted mid-motion or jumped straight there. The built-ins say this in their headers (`text`: "Idempotent: update renders exactly the given props, whatever state came before"), and they follow one pattern:

1. Render the target state.
2. Animate only when `canAnimate(info)` (or `info.animate`) is true, passing `motion(info)` so an abort snaps to the end.
3. Clear any inline style that the motion wrote (`clearInlineStyle` from `core/animate.js`).

From `components/text/index.js`:

```js
async update(props, info) {
  render(props);
  const fade = info.animate && (info.entered || info.changed.includes("text"));
  if (fade) {
    await ctx.animate.fadeIn(p, motion(info));
  }
  // Idempotent end state: no inline style left behind, whether the fade ran or not.
  clearInlineStyle(p);
},
```

`check --played` and the browser helpers `expectJumpEqualsPlayed`, `expectBackwardEqualsJump` and `expectInterruptEqualsJump` test this property. The `x-transition` annotation in a component's `schema.json` is metadata for the catalog only; the motion it describes must be written in `index.js`.

### No globals

Components do not reach for page globals, and core modules keep the ones they read to a few defaults:
- Components create nodes from the element they are given (`const doc = el.ownerDocument;`), not from `document`.
- Core functions that need a document take it as an option with `globalThis.document` as the default (`renderSlideFrame(..., { document })`, `boot({ document, location })`, `createBareShell({ document })`), so tests can pass their own.
- Everything a component needs comes through `ctx` (`d3`, `data`, `assetUrl`, `format`, `t`, `capture`, `animate`, `tokens`, `palette`, `size`, `mount`). See the [component contract](../reference/component-contract.md).

The deliberate exceptions are `window.STEPDECK`, which `boot()` sets as the public API, and the UMD bundles (d3, reveal.js and its notes plugin), which assign themselves to `globalThis` when loaded as modules. `core/d3.js` and `core/shells/reveal.js` read those in one place each.

A few core defaults also read page globals when no option replaces them: `boot()` defaults `location` to `globalThis.location`, `core/registry.js` resolves relative roots against `globalThis.document?.baseURI`, `scopeCss` in `core/layout.js` falls back to `globalThis.CSSStyleSheet`, and `core/animate.js` times motion with `globalThis.requestAnimationFrame`, `cancelAnimationFrame` and `performance` (falling back to `setTimeout` where there is no `requestAnimationFrame`, as in Node). Keep new ones to this shape: a guarded default that an option or a fallback can replace.

### Same-origin only

A deck must work offline at presentation time ([design §3](../design/2026-11-18-engine-design.md#3-constraints)). The `spec §N` references in code comments and messages point to the sections of that design document. Every path is relative to the deck and same-origin:
- `boot()` refuses a cross-origin deck with `deck: deck must be same-origin with the page (got X, page is Y); use a relative path`.
- The data loader rejects absolute paths, schemes, `..` and `%` in data paths.
- `validate` reports `remote-url` for `http(s)://` and protocol-relative URLs in slide styles and props, and `style-import` for `@import`.
- The browser commands abort every request to another origin and `check` reports it as `network-error` (`remote <url> (blocked: only same-origin requests are allowed, spec §3)`).

Do not add code that fetches from a CDN or another host, at runtime or in a component.

## Reuse the shared helpers

Before writing a small utility, look for it here. Several recent refactors (`refactor(core)`, `refactor(components)`, `refactor(cli)` in the history) exist only to remove copies of these.

| Module | Use it for |
| --- | --- |
| `core/constants.js` | `CANVAS` (`{ w: 1920, h: 1080 }`), `DEFAULT_THEME` (`"modern"`), `DEFAULT_LAYOUT` (`"full-bleed"`), plus `HOOKS` and `LAYOUT_KINDS` (the published styling hooks and layout kinds; the schemas and `schema/stepdeck.d.ts` repeat them and a test keeps them equal), and `LAYERS`, `LAYER_ORDER` and `inLayer(layer, css)` (the cascade layers; every stylesheet the engine writes starts with `LAYER_ORDER`). Shared by the runtime and the CLI; never repeat these literals. |
| `core/accent.js` | The accent phrase in titles: `parseAccent`, `stripAccent` (the raw title without its `*`, for anywhere it shows outside the element), `escapeAccent` (for bound values) and `accentMarks` (for `validate`). |
| `core/kit.js` | Leaf helpers for the engine and components: `message(e)`, `escapeHtml`, `memoAsync` (a promise cache that evicts failures), `num`, `lerp`, `clamp01`, `SVG_NS`/`XHTML_NS`, element builders `el`, `svgEl`, `xhtmlEl`, `sizeSvg`, sizing `measureWidth`/`measureHeight`, motion `canAnimate(info)`, `motion(info)`, `motionMs(info, ctx, factor)`, and `inkMix(p)` for muted-to-ink text color. |
| `core/animate.js` | The abort-aware `ctx.animate` helpers (`fadeIn`, `reveal`, `drawPath`, `tween`, `stagger`), plus `clearInlineStyle`, `rise`, `typeCount`, `typingMs` and the typing constants (`TYPE_MS_PER_CHAR` 28, `TYPE_MAX_MS` 1400). |
| `core/chart.js` | Shared by `chart.line` and `chart.bar`: `loadTable` (loads a CSV and checks named columns), `tickFormat`, `opacityAttr`. |
| `core/color.js` | WCAG 2 math: `parseHex`, `toLinear`, `luminance`, `contrast`. Used by `chart.line` labels and by the CLI palette and contrast checks. |
| `core/inline.js` | `renderBlock(md)` and `renderInline(md)`: the one sanitizing Markdown renderer. Use it for any author text rendered as HTML; it escapes raw HTML and allows only http, https, mailto, relative and `#anchor` URLs. |
| `core/registry.js` | `levenshtein` and `suggest(name, known)`, the did-you-mean helper used by the registry, `validate` and `catalog`. |
| `core/fold.js` | `parseStepRef`, `initialElements` (the slide title and kicker sugar), `stepIndex`, `stepCount`. |
| `cli/engine.js` | CLI only: `ENGINE`, `hasEngineCopy`, `engineFor(deckDir)`, `readBuiltins`, `listDirs`, `importDeck`, `isObject`, `readJSON`, and the theme lookup shared by `validate` and `--theme` (`THEME_NAME`, `findTheme`, `assertTheme`, `exactCase`). |
| `cli/problems.js` | CLI only: `problem(...)`, `componentProblem(...)`, `formatProblem`, `formatProblems`. |

## Word an error message

Messages are read by authors on the canvas and by agents in CLI output, so they follow one style.

**Lead with the scope, then say what is wrong.** The pattern is `<scope>: <what>`:

| Scope | Example |
| --- | --- |
| Deck loading | `deck: theme '<t>' not found (...)` |
| Runtime and CLI | `stepdeck: unknown slide '<s>' (slides: ...)` |
| An element | `<slide>/<element>: did not settle within 10s` |
| A child component | `ctx.mount('<type>'): update called on a destroyed child` |

The controller adds the `<slide>/<element>: ` prefix to every element error itself (`core/controller.js`), so a component throws only the rest. Component messages usually start with the component name and the prop. Exceptions name the thing at fault instead: the shared chart column error (`column 'c' not found in <data> ...`) and terminal script errors, which start with the script path. Examples: `big-number needs a numeric \`value\`, got <json>`, `list has a duplicate item id '<id>'`.

**Quote the offending value and list the valid ones.** Names go in single quotes, prop names in backticks, and the known set in parentheses: `column 'c' not found in <data> (columns: a, b)`, `unknown shell '<x>' (available: bare, reveal)`.

**Suggest the closest name when there is one.** Use `suggest` from `core/registry.js`. It returns the nearest known name within `max(2, floor(length / 3))` edits, or `null`, so the hint is optional:

```js
const close = suggest(String(name), [...deck, ...builtin]);
throw new Error(`unknown component '${name}'${close ? `; did you mean '${close}'?` : ""}`);
```

**Usually lower case, with no trailing period.** A few messages start with a proper noun or acronym (`CSV column ...`, `HTTP 404 for ...`), and the Playwright-not-found message in `cli/browser.js` is two full sentences. Say what to do when it is not obvious (`(use a .csv file)`, `use a namespace like 'my.<n>'`).

### Write a CLI problem

`validate` and `check` report a `Problem`, built with `problem()` from `cli/problems.js`:

```
{ slide, element, step, rule, measured, limit, fix }
```

`formatProblem` prints it as `slide/element/step · rule · measured vs limit · fix`, or `deck · ...` when there is no location. Write the fields so the line reads as a sentence:

| Field | Style | Example (`unknown-layout`) |
| --- | --- | --- |
| `rule` | kebab-case id, stable, documented in [Rules](../reference/rules.md) | `unknown-layout` |
| `measured` | what was found, with the value quoted | `layout 'figure-note'` |
| `limit` | what is allowed, often the known list | `layouts: figure-notes, full-bleed, halves, statement, title` |
| `fix` | one concrete edit, with the did-you-mean value when there is one | `set layout: "figure-notes"` |

When there is no close match, the fix lists the options instead (`set layout to one of 'figure-notes', ...`). A component can return its own findings as `{ rule, id, message, limit?, fix? }` and the CLI maps them with `componentProblem` (see `diagramProblems` in `components/diagram/place.js`).

## Name CSS classes and use tokens

Structural CSS lives in `core/stepdeck.css`. Its first line states the rule: "Only structure here: colors, fonts and sizes come from theme tokens."

| Convention | Example |
| --- | --- |
| Every class stepdeck defines for its own markup starts with `sd-`. | `.sd-canvas`, `.sd-region`, `.sd-el`. Exceptions are classes stepdeck does not own or that mirror a flag: `html.capture` (the `?capture` query flag), d3's `tick` in chart axes, and reveal.js's `slides` and `fragment` in the reveal shell. |
| Component classes are `sd-<component>-<part>`. | `.sd-list-item`, `.sd-terminal-log`, `.sd-big-number-value` |
| Engine state is a class. | `.sd-hidden`, `.sd-collapsed`, `.sd-failed`, `.sd-booting` |
| Component state is a `data-*` attribute, not a class. | `.sd-list-item[data-visible="false"]`, `.sd-chat[data-style="card"]`, `.sd-diagram-node[data-dim="true"]` |
| Colors, fonts, sizes, spacing and durations come from theme tokens (`--sd-*`). | `color: var(--sd-color-muted); gap: var(--sd-space);` |
| Derived values are `calc()` on a token. | `calc(var(--sd-space) * 1.5)`, `calc(var(--sd-grid) / 2)` |
| A component that fills its region says so by type. | `.sd-region > .sd-el[data-type="diagram"] { flex: 1 1 0; min-height: 0; }` |
| A layout scopes its grid to its own name. | `.sd-canvas[data-layout="<name>"]` in `layouts/<name>/layout.css` |
| Each component block starts with a comment explaining the layout and its state rules. | `/* list component: items in a column. Hidden items keep their space ... */` |

Prefer a token over a literal. The file still has a few hard-coded values, which are known debt rather than a pattern to copy: `line-height: 1.15` in the title and Markdown heading rules (there is `--sd-line-height-tight`), `font-weight: 600` and `500` in chart labels, terminal headings and the big-number suffix (there are `--sd-font-weight-title` and `--sd-font-weight-strong`), and pixel borders and radii such as `4px` and `12px`. Chart stroke widths in SVG are also literal. When you touch one of these rules, move it to a token if one fits.

Motion in components is JavaScript (`ctx.animate`); `core/stepdeck.css` declares no CSS transitions or animations. Its only motion rule is the capture switch: `html.capture` sets `transition: none` and `animation: none` on every element.

## Update the docs with the code

A change is done when the docs agree with it. Contributing lists the three places the same facts live (`docs/`, `skill/`, and each piece's README and schema description) under [Keep the docs in sync](index.md#keep-the-docs-in-sync). Follow the same style as the existing pages: plain direct sentences, tables for props, flags and rules, and examples copied from working files or verified by running them.

Do not edit design history after the fact. `docs/design/` records what was planned and decided at the time; when the code moves on, update the user docs and leave those files as they are.

## Write a commit message

The history uses Conventional Commit prefixes: `<type>(<scope>): <summary>`.

| Type | Use for |
| --- | --- |
| `feat` | A new component, layout, option or command |
| `fix` | A behavior bug |
| `docs` | Documentation, the skill, READMEs, follow-up lists |
| `refactor` | Code changes with no behavior change |
| `chore` | Housekeeping (for example `chore: neutralize personal paths and place names`) |

Scopes used so far name the area or the piece: `core`, `cli`, `components`, `layouts`, `theme`, `css`, `skill`, `examples`, `spike`, and single components such as `list`, `timeline`, `diagram`. The scope may be omitted for cross-cutting changes (`docs: slide kit 1 follow-ups from task and branch reviews`).

The summary is lower case with no trailing period and states the outcome, often as a plain sentence:

```
feat(layouts): halves --align (start, center, end) aligns the content of both halves vertically
fix(core): reject percent signs in deck paths so %2e%2e cannot leave the deck
refactor(components): shared chart helpers (core/chart.js) for chart.line and chart.bar
```

Bodies are wrapped prose that says what moved where and why. A refactor ends with `No behaviour change.` when that holds, which is a claim reviewers check.

## Related pages

- [Contributing](index.md): setup, repository tour, development loop and which docs to update.
- [Testing](testing.md): the unit and browser suites and fixture conventions.
- [Architecture](../concepts/architecture.md): how the fold, controller, layout renderer, registry, shells and CLI fit together.
- [Component contract](../reference/component-contract.md) and [Rules](../reference/rules.md).
- [`skill/`](../../skill/SKILL.md): the agent-facing docs, which must stay in step with the code.
