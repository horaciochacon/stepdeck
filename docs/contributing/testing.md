# Testing

This page is for contributors who change the engine, a built-in component, a layout, a theme or a check. It covers how the two test suites are organised, how to run them, the fixture conventions, the shared browser helpers, and which tests a new piece must add.

stepdeck has two suites, both on Node's built-in test runner (`node:test` with `node:assert/strict`). There is no test framework to install.

| Suite | Command | Files | Needs |
| --- | --- | --- | --- |
| Unit | `npm test` | `test/unit/**/*.test.mjs` | Node and `npm install` (Ajv, marked). No browser. |
| Browser | `npm run test:browser` | `test/browser/**/*.test.mjs` | Playwright, located by `STEPDECK_PLAYWRIGHT`, and Chrome. |

Shared test data lives in `test/fixtures/`. Run both suites before you send a change.

## Run the unit suite

```sh
npm install
npm test
```

`npm test` runs `node --test 'test/unit/**/*.test.mjs'`. It never starts a browser and finishes in a few seconds. It needs Node 22.15 or later (or 23.5 or later), although `package.json` declares `node >= 20`: the quoted glob is expanded by `node --test` itself, which needs Node 21, and the [no-Ajv hook](#the-no-ajv-hook) uses `registerHooks` from `node:module`, which needs 22.15 or 23.5. On an older Node, `cli-no-ajv.test.mjs` fails.

The unit suite covers everything that runs in plain Node:
- the fold engine and the controller (`fold.test.mjs`, `controller.test.mjs`);
- bindings, the data loader, i18n (`bindings`, `data`, `i18n`);
- `validate`, one fixture deck per case (`validate.test.mjs`);
- the CLI's pure parts: problem formatting, deck targets, `new`, `catalog` (`problems`, `deck-target`, `new`, `catalog`);
- schemas and file completeness for components and layouts (`schemas`, `components-index`, `layouts`);
- theme checks: palettes, the minimum audience font alias, the `modern` theme's tokens, fonts, contrast and `theme.css` rules (`palette`, `min-audience-font`, `theme-modern`);
- the layout/theme contract: placement-only layout CSS, hooks and kinds in the schemas, the layer order (`layout-contract`), and the accent phrase parser (`accent`);
- the pure helpers of components, with no DOM: `list.test.mjs` (`components/list/derive.js`), `chat.test.mjs`, `terminal-derive.test.mjs`, `timeline.test.mjs`, `diagram-place.test.mjs`;
- running the CLI without Ajv (`cli-no-ajv.test.mjs`, see [below](#the-no-ajv-hook)).

To run one file, pass it to `node --test` directly:

```sh
node --test test/unit/validate.test.mjs
```

## Run the browser suite

```sh
STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
```

`npm run test:browser` runs `node --test --test-concurrency=1 'test/browser/**/*.test.mjs'`. Each test opens a page in Chrome through `withPage` in `cli/browser.js`, which starts a local static server on the repository root, launches the browser and blocks every request that is not same-origin.

- **`--test-concurrency=1`** runs the files one at a time. Every `withPage` call starts its own server and browser, so in effect each test launches one Chrome, and running files in parallel would launch many at once. `check.test.mjs` also writes `examples/spike/shots/` (through `shoot`). Keep the flag when you run files by hand.
- **`STEPDECK_PLAYWRIGHT`** names a `playwright` package folder. Playwright is not a dependency of the repository. If the variable is unset, Node must be able to resolve `playwright` on its own; otherwise every browser test fails (it does not skip) with `Playwright not found. Install it (npm i -D playwright) or set STEPDECK_PLAYWRIGHT to a playwright package directory.`
- **`STEPDECK_CHANNEL`** picks the browser channel. The default is `chrome`, the system Chrome.

To run one file, keep the concurrency flag. Some file headers show this single-file command; others show `npm run test:browser`. The pattern is:

```sh
STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright node --test --test-concurrency=1 test/browser/list.test.mjs
```

A single component file takes about half a minute; the whole suite takes several minutes.

The browser suite covers what needs a real page: the bare and reveal shells, every component's rendering and motion, the layouts, `dump`, `check` (including `--played`), `shoot`, `new` on a fresh deck, the watchdog on a hanging component, and the two example decks. `kit.test.mjs` requires `examples/kit` (on the default theme, `modern`) to pass `validate`, `check` and `check --played` with no problems; `check.test.mjs` requires `examples/spike` to pass `check` and `check --played`, and `validate.test.mjs` (unit suite) requires it to validate clean. These two decks are the clean baselines: a change that adds a problem to either one fails the suite. The gallery deck (`site/gallery`, one slide per built-in layout and component, each the engine's own `example.js`) is the third: `gallery.test.mjs` in the unit suite keeps it in step with `components/index.json` and `layouts/` and requires it to validate clean, and `gallery.test.mjs` in the browser suite requires `check --played` to pass under both shipped themes.

## Fixtures

Every fixture under `test/fixtures/` is a deck folder (a `deck.js` and a `slides/` folder, plus `components/` or `data/` when the case needs them), except `decks/with-engine/`, which holds only a `stepdeck/` engine copy (`stepdeck/core/render.html`) and no `deck.js` or `slides/`. Fixture decks use the repository engine and have no engine copy.

```
test/fixtures/
  validate/<case>/    one deck per validate case
  check/<rule>/       one deck per check rule, exactly one problem each
  decks/<name>/       shared decks for browser and unit tests
```

### `test/fixtures/validate/<case>/`

One minimal deck per `validate` case, used by `test/unit/validate.test.mjs` through a `fixture(name)` helper. The folder is named after the case, which is not always the rule name: `figure-without-source` produces `figure-source`, `numeric-step-id` produces `step-id-numeric`, `bad-binding` produces three binding rules. Most tests assert the exact sorted list of rules, so a fixture must produce only the problems its test expects:

```js
test("hex colors in props are rejected", async () => {
  const problems = await validate(fixture("hex-color"));
  assert.deepEqual(rules(problems), ["hex-color"], show(problems));
});
```

A fixture is as small as it can be. `test/fixtures/validate/hex-color/` is a whole case:

```js
// deck.js
// Fixture (R6): a hex color typed into a prop.
export default {
  title: "validate fixture",
  lang: "en",
  theme: "academic-light",
  slides: ["s"],
};
```

```js
// slides/s.js
// a hex color typed into a prop.
export default {
  id: "s", title: "Hex color",
  elements: [
    { id: "lead", type: "markdown", props: { md: "The <span style=\"color:#c0392b\">red</span> line." } },
  ],
};
```

`validate.test.mjs` also requires `examples/spike` to validate with no errors and no warnings.

### `test/fixtures/check/<rule>/`

One deck per `check` rule, used by `test/browser/check.test.mjs`. The contract is strict: each fixture yields **exactly one problem**, its rule equals the folder name, and the problem is on slide `s`. The test is driven by a `cases` map from folder name to where the problem must point:

```js
const cases = {
  "text-outside-canvas": { element: "edge", step: "0" },
  "text-outside-region": { element: "wide", step: "0" },
  "text-overlap": { element: "b", step: "0" },
  "font-too-small": { element: "small", step: "0" },
  contrast: { element: "pale", step: "0" },
  "console-error": { element: null, step: "0" },
  "network-error": { element: null, step: "0" },
  "remote-style": { element: null, step: "0", rule: "network-error" },
  "remote-fetch": { element: null, step: "0", rule: "network-error" },
  "render-error": { element: null, step: "0" },
  "step0-shows-all": { element: null, step: "first" },
};
```

Two folders are not named after their rule: `remote-style` (a remote URL in `slide.style`) and `remote-fetch` (a component that fetches a remote URL) both produce `network-error`, which the `rule` field says. For each case the test asserts one rule, one problem, the slide, the element (`null` for slide- or step-level problems), the step label, and non-empty `measured`, `limit` and `fix`.

The `contrast` fixture shows the shape. The deck names its single rule, and the slide holds one passing element next to the failing one:

```js
// slides/s.js
// Light grey text on the white canvas: about 1.9:1, under 4.5:1.
export default {
  id: "s",
  layout: "full-bleed",
  style: "[data-el=\"pale\"] .sd-text { color: rgb(187, 187, 187); }",
  elements: [
    { id: "ok", region: "main", type: "text", props: { text: "Dark ink reads well." } },
    { id: "pale", region: "main", type: "text", props: { text: "Pale text is hard to read." } },
  ],
};
```

`played-mismatch` is not in this folder: it needs `--played`, so its deck lives in `test/fixtures/decks/played-mismatch/` and has its own tests.

### `test/fixtures/decks/<name>/`

Shared decks that several tests open. Most belong to one component or feature:

| Deck | Used by |
| --- | --- |
| `bars` | `chart-bar.test.mjs` (component `chart.bar`). |
| `chat`, `diagram`, `image`, `list`, `timeline` | The browser test of the same name. |
| `components-m1`, `chart-broken` | `components-m1.test.mjs`, `chart-line.test.mjs` (the M1 components and a failing chart). |
| `layouts`, `layouts-kit` | `layouts.test.mjs`, `layouts-kit.test.mjs`. |
| `broken`, `styled` | `bare.test.mjs` (boot errors, slide styles); `broken` also in `reveal.test.mjs`. |
| `hanging` | `hanging.test.mjs` (a component that never settles: the watchdog). |
| `played-mismatch` | `played.test.mjs`, `check.test.mjs` (a component whose played state differs from a jump). |
| `collision` | `custom.test.mjs` (a deck component named like a built-in). |
| `catalog-throws` | `catalog.test.mjs` (a component whose `index.js` throws on import). |
| `with-engine` | `deck-target.test.mjs` (only a `stepdeck/` engine copy, no deck files). |

`terminal.test.mjs` uses no fixture deck: it opens the `terminal` slide of `examples/spike`.

Browser tests open a fixture deck in the bare shell with a URL relative to the repository root, such as `core/render.html?deck=../test/fixtures/decks/list/&slide=reveal&step=none`. `deckPages()` builds these URLs for you.

## Browser helpers

`test/browser/helpers.mjs` holds the checks every component test repeats. Each helper takes the `page` and `ctx` that `withPage` passes to the test (`ctx.open(url)` loads a page and waits for `STEPDECK.settled()`; `ctx.errors` collects console and page errors), and a `pages` object from `deckPages()`.

| Helper | What it does |
| --- | --- |
| `deckPages(deckDir)` | Returns `{ url(slide, query) }` for a deck folder relative to the repository root. `url` builds the bare-shell URL; `query` is appended, for example `"step=a&motion=full"`. |
| `goTo(page, slide, step)` | Calls `STEPDECK.goTo(slide, step)`, then waits for `STEPDECK.settled()`. |
| `settled(page)` | Waits for `STEPDECK.settled()`. |
| `elementHtml(page, id)` | The `outerHTML` of `[data-el=id]`, or `null`. |
| `htmlAfterJump(ctx, page, pages, slide, step, id)` | Loads the slide directly at `step` (no motion) and returns the element's `outerHTML`. |
| `expectJumpEqualsPlayed(ctx, page, { pages, slide, steps, id })` | Jumps to every step in `steps`, then plays through them one at a time with `motion=full`. The element's html must be equal at every step, with no `STEPDECK.errors` and no page errors. |
| `expectBackwardEqualsJump(ctx, page, { pages, slide, steps, id })` | For each adjacent pair of steps in `steps`, opens the later step with `motion=full`, goes back to the earlier one, and the html must equal a jump to the earlier step. |
| `expectInterruptEqualsJump(ctx, page, { pages, slide, from, via, to, id })` | Starts an animated move `from -> via`, re-targets to `to` 100 ms in, and settles. The html must equal a jump to `to`, and no node inside the element may keep a `style` attribute. |
| `expectAnimatedStepMoves(ctx, page, { pages, slide, from, to, id, probe? })` | Plays one forward step and samples `probe(page)` 120 ms in (default: the element's `outerHTML`). The mid-flight sample must differ from the end state, so the step really animates. Returns `{ mid, end }`. |

"Equal" is strict `outerHTML` equality. A component must end every `update()` at its target state and clear the inline styles its motion wrote. The `expect*` helpers that play motion first assert that `STEPDECK.flags.animate` is `true`, so a test cannot pass by accident with motion off. The html-comparison assertions name the slide, element and step(s) that differ; the motion check (`expectAnimatedStepMoves`), the inline-style check, the `animate` flag check and the error checks have generic messages.

A component test uses them together. This is an abridged excerpt from `test/browser/list.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withPage } from "../../cli/browser.js";
import { deckPages, expectJumpEqualsPlayed, expectInterruptEqualsJump } from "./helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const pages = deckPages("test/fixtures/decks/list/");
const REVEAL = ["none", "one", "two", "three"];

test("jump equals played: reveal and checklist", async () => {
  await withPage({ root, url: pages.url("reveal", "step=none") }, async (page, ctx) => {
    await expectJumpEqualsPlayed(ctx, page, { pages, slide: "reveal", steps: REVEAL, id: "list" });
    // ... the same for the `check` slide
  });
});

test("interrupt mid-motion equals jump", async () => {
  await withPage({ root, url: pages.url("reveal", "step=none") }, async (page, ctx) => {
    await expectInterruptEqualsJump(ctx, page, { pages, slide: "reveal", from: "none", via: "one", to: "three", id: "list" });
    // ... three more re-targets
  });
});
```

These helpers test one element closely. `check --played` (rule `played-mismatch`) compares presence, visibility, text and boxes for every element of a deck; use it, through `check(deck, { played: true })`, to keep a fixture deck clean as a whole.

## The no-Ajv hook

`validate` is the only command that needs Ajv, and it imports Ajv lazily, so `--help`, `new` and the other commands work before `npm install`. `test/unit/cli-no-ajv.test.mjs` keeps it that way. It runs the CLI with a module hook that makes Ajv look missing:

```sh
node --import ./test/unit/helpers/no-ajv.mjs cli/index.js validate examples/spike
```

`test/unit/helpers/no-ajv.mjs` registers a `resolve` hook with `registerHooks` from `node:module` (Node 22.15+ or 23.5+). Any import of `ajv` or `ajv/...` throws an error with code `ERR_MODULE_NOT_FOUND`, the same as a missing `node_modules`, without touching `node_modules`. The test checks that:
- the hook really hides Ajv;
- `--help` and `new` exit 0;
- `validate` exits 2 and says to run `` `npm install` `` in the engine folder, both as text on stderr and as `{ "error": ... }` with `--json`.

If you add a command that imports Ajv, or move an Ajv import to the top level of a module that every command loads, this test fails. Import Ajv inside the command that needs it, as `loadValidate` in `cli/index.js` does, and add a case to `cli-no-ajv.test.mjs` for any new command that must run without it.

## What a new piece must add

Some tests scan the folders, so a new piece is covered by them as soon as it exists. Others name pieces explicitly and must be extended. The lists below say which is which.

### A component

See [Adding a component](adding-a-component.md) for the files themselves.

Covered automatically, once the folder exists:
- `components-index.test.mjs`: `components/index.json` must list exactly the folders that hold an `index.js`. Add the name to `index.json`.
- `schemas.test.mjs`: the `schema.json` must compile with the shared Ajv setup.
- `catalog.test.mjs`: the built-in catalog must have no problems, so every prop needs `description`, `examples` and `x-transition` (`tween`, `draw`, `fade` or `snap`).

You add:
1. A fixture deck in `test/fixtures/decks/<name>/` with slides whose step ids walk through the component's states, including the states that animate.
2. A browser test `test/browser/<name>.test.mjs` that calls `expectJumpEqualsPlayed`, `expectBackwardEqualsJump`, `expectInterruptEqualsJump` (forward and backward re-targets) and `expectAnimatedStepMoves` for each prop that animates, plus tests for rendering, element errors (each error message names the bad value, and a sibling element keeps working), and a `check` run on the fixture deck that finds no problems.
3. Unit tests for any pure helper module (as `derive.js`, `place.js` or `stops.js` are tested), in `test/unit/<name>.test.mjs`. Keep logic that needs no DOM in such a module so it can be tested without a browser.
4. If `validate` gains a component-specific check (as `diagram-id` and `diagram-overlap` did), a `validate` fixture and test for it; see [a rule](#a-rule).

### A layout

See [Adding a layout](adding-a-layout.md).

Covered automatically: `layouts.test.mjs` runs one test per folder in `layouts/`. It requires `layout.css`, `schema.json`, `example.js` and `README.md`, and checks that:
- `schema.json` has `name`, `description`, `regions` and `variables` (and optionally `hooks` and `kind`), and `name` equals the folder name;
- `layout.css` reads every variable as `var(<name>, <default>)` with the default from `schema.json`;
- the README names every region and variable in backticks;
- `layout.css` has no gradients and no hex or `rgb()` colors (colors come from theme tokens);
- (in `layout-contract.test.mjs`) `layout.css` is placement only: no color, font, line-height, text-align, `--sd-*` property or `!important`, and `font-size` only as `var(--sd-…)`;
- `example.js` imports in plain Node, uses this layout, places elements only in its regions, and every element's props pass its component schema.

`schemas.test.mjs` also checks `schema.json` against `schema/layout.schema.json`. A `hooks` map must name regions the layout has and hooks in `HOOKS`; a `kind` must be in `LAYOUT_KINDS`.

You add:
1. The layout name to the exact layout list (`names("layout")`) in the first test of `catalog.test.mjs`, `catalog index lists chart.line with animates including y`. That test fails until you do.
2. Optionally, the name to the list in the test `built-in layouts: full-bleed, figure-notes, halves, statement and title` in `layouts.test.mjs`; it only checks that the named folders exist.
3. Slides that use the layout in a fixture deck (`test/fixtures/decks/layouts-kit/` holds the kit layouts) and a browser test that measures region and element boxes in canvas pixels, as `layouts-kit.test.mjs` does: regions in the right order and place, no overlap, text inside its region, and a figure that fills its region when it should.

### A theme

See [Adding a theme](adding-a-theme.md).

Covered automatically: `min-audience-font.test.mjs` runs for every folder of `themes/` that holds a `tokens.css`. `--min-audience-font` must hold a pixel value and `--sd-min-audience-font` must be exactly `var(--min-audience-font)`.

Several tests name `academic-light` and must be extended or copied for a new theme:
- `catalog.test.mjs` asserts the list of catalog themes is exactly `["academic-light", "modern"]`. Update it.
- `palette.test.mjs` reads `themes/academic-light/palettes.json` (and `theme-modern.test.mjs` checks `modern`'s palette, tokens, contrast pairs and fonts) and checks kinds, citations, localized names, roles, and that the categorical palette passes contrast and colour-vision checks on the theme background. Add the same checks for the new theme's palettes.
- `layouts.test.mjs` checks that the academic-light font URLs are relative, exist on disk, and that each font folder has its `OFL.txt` with the upstream copyright line first. Add the same for vendored fonts in the new theme.
- `test/browser/layouts.test.mjs` checks that the academic-light fonts load from the theme folder and are in use, and runs the layout checks under both built-in themes (its `THEMES` list). `test/browser/theme-modern.test.mjs` does the same for `modern`'s fonts, type and `check --theme`. Add a page check for the new theme, for example with `?theme=<name>` on an existing fixture deck, and add it to those lists.
- `test/browser/theme-hooks.test.mjs` pins the hook classes, the layer order, slide `style` over `theme.css`, and that academic-light's boxes did not move; extend it if your `theme.css` adds rules that can change a box.

If the new theme becomes the default (`DEFAULT_THEME` in `core/constants.js`), also review the tests that expect the default theme's paths, such as `new.test.mjs` and `test/browser/new.test.mjs` (they expect `modern`'s font folders today), and the baselines in `theme-hooks.test.mjs` that load `?theme=academic-light` on purpose.

### A rule

See [Adding a rule](adding-a-rule.md).

For a `validate` rule:
1. Add a minimal deck in `test/fixtures/validate/<case>/` that produces the rule and nothing else.
2. Add a test to `test/unit/validate.test.mjs` that asserts the exact rule list with `rules(problems)` (or `only(problems, rule)`), and checks the slide, element, step, and that `measured`, `limit` and `fix` name the actual values.
3. Make sure `examples/spike` still validates clean; that test is in the same file.

For a `check` rule:
1. Add a deck in `test/fixtures/check/<rule>/` with one slide `s` that yields exactly one problem of that rule.
2. Add an entry to the `cases` map in `test/browser/check.test.mjs` with the element (or `null`) and step label the problem must point to. If the folder name differs from the rule, set `rule`, as `remote-style` and `remote-fetch` do.
3. If the rule needs a mode the loop does not use (as `played-mismatch` needs `--played`), put its deck in `test/fixtures/decks/` and write a dedicated test instead.
4. Run the browser suite: `examples/spike` (in `check.test.mjs`) and `examples/kit` (in `kit.test.mjs`) must still check clean.

Document the rule in [Rules](../reference/rules.md) and in [`skill/references/checks.md`](../../skill/references/checks.md), which agents read.

## See also

- [Contributing](index.md): setup and the workflow for a change.
- [Checking a deck](../guide/checking-a-deck.md): `validate`, `check`, `dump` and `shoot` from a deck author's side.
- [CLI reference](../reference/cli.md) and [Rules](../reference/rules.md).
- [Component contract](../reference/component-contract.md): the `update()` rules that the browser helpers test.
