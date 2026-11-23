---
name: stepdeck
description: Build, validate, check and screenshot step-by-step HTML presentations (decks) with stepdeck. Slides are declarative JS specs (a layout, elements, steps) with built-in components (line chart, bar chart, points chart, big number, terminal session, text, markdown, list, diagram, chat, timeline, image, map), data bindings and custom components. Use when asked to create or edit a stepdeck deck or slide, to make an HTML presentation or slide deck with stepdeck, or to write a stepdeck component.
---

# stepdeck

stepdeck turns slide specs into a presentation that runs in Chromium with no build step.
- A slide is plain data: a layout, the elements in its regions, and an array of steps.
- Each step is a patch over the step before.
- Anything the built-ins cannot show becomes a custom component under the same contract.

This skill is about using the engine. It does not cover how to plan or write a talk.

**Read `catalog/index.json`, never engine source.** Everything you need is in this skill, in the catalog and in the CLI output. Never read engine code to find out how something works: `stepdeck/core/`, `stepdeck/components/*/index.js`, `stepdeck/vendor/`. The data files under `stepdeck/` are fine to read or copy: `example.js`, `README.md`, `schema.json`, `tokens.css`, `palettes.json`, `layout.css`. If the catalog and this skill leave a question open, say so in your report.

## Setup: the CLI

The CLI lives in the stepdeck repository, which is the folder that holds this `skill/` folder. Below, `$STEPDECK` stands for that folder's absolute path.
- Either run `export STEPDECK=/abs/path/to/stepdeck` in the same shell call as the command, or write the path out.
- Only `validate` needs the repo's dependencies (Ajv); every other command, `--help` and `new` included, works without them. If they are missing, `validate` prints "run `npm install` in <path> first" and exits 2: run `npm install` once in `$STEPDECK`, then validate again.

```sh
node "$STEPDECK/cli/index.js" --help
node "$STEPDECK/cli/index.js" new my-talk          # a new deck, with the engine copied into my-talk/stepdeck/
```

Every command takes the deck folder as its positional argument; without one, it uses the current folder. There are four exceptions:
- `new <dir>` takes the new folder to create, not an existing deck.
- `new-component <name> [deckDir]` takes the component name first, then the deck folder.
- `catalog [name] [folder]` takes the entry name and the folder in either order.
- `boundaries <ISO3> <ADM0-ADM5> [--deck dir]` takes a country code and an admin level, and the deck folder as `--deck`. It fetches open admin boundaries from geoBoundaries into `<deck>/data/` and is the only command that needs the network; use it only when the project has no boundaries of its own (see the map rule below).

See [the CLI reference](../docs/reference/cli.md#new-component).

**`new` gives you a working starter deck, not an empty one.**
- It holds three slides, `slides/title.js`, `slides/chart.js` and `slides/closing.js`, listed in `deck.js` `slides`.
- Its data comes from `data/make-data.mjs`, which writes `data/series.csv` and `data/summary.json`.
- To build your own deck, edit those slides or replace them:
  - delete a slide's file **and** its id in `deck.js` `slides`;
  - add a slide as `slides/<id>.js` **and** add its id to `slides`.

  There is no CLI command for adding or removing slides; edit the files.
- Delete the starter data you no longer use.
- After creating the deck, `new` prints the next commands to run, with the real CLI path.

The browser commands are `check`, `dump` and `shoot`. They need Playwright and a Chromium:
- Playwright: set `STEPDECK_PLAYWRIGHT` to a `playwright` package folder, or install `playwright` where Node can resolve it.
- Chromium: by default they use the system Chrome. Set `STEPDECK_CHANNEL` to choose another channel.

If Playwright is missing, the command exits 2 with a message saying so.

## Workflow, in this order

1. **Catalog.** Run `node "$STEPDECK/cli/index.js" catalog my-talk`, then read `my-talk/catalog/index.json`. It holds one line per component, layout and theme, plus the props that animate and whether a component builds its own entrance (`enter: own`).
   - Then run `node "$STEPDECK/cli/index.js" catalog <name> my-talk --json` for each entry you will use. That gives you the props, the examples and the README, where component-specific shapes live (such as the terminal script).
   - The `example` path in an entry is relative to the engine, so it is `my-talk/stepdeck/<path>`. Example slides show the shape; their data files are not in your deck.
2. **Slide spec.** Write one file per slide, `slides/<id>.js` (`export default { id, layout, title, elements, steps }`), and add the id to `slides` in `deck.js`.
   - Put figures in data files, never in the spec (see the bindings section in [components](references/components.md)).
   - See [step-model](references/step-model.md) and the [cookbook](references/cookbook.md).
3. **Validate** (Node, no browser, fast): `node "$STEPDECK/cli/index.js" validate my-talk --slide <id>`. Fix every error line. Warnings exit 0.
4. **Check** (headless Chrome): `node "$STEPDECK/cli/index.js" check my-talk --slide <id> --played`. It checks layout, font size, contrast and page errors.
   - `--played` also checks that the slide looks the same when played step by step as when you jump straight to a step.
5. **Shoot or dump.**
   - `node "$STEPDECK/cli/index.js" shoot my-talk --slide <id>` writes PNGs to `my-talk/shots/960/<slide>-<nn>-<step>.png`.
   - `node "$STEPDECK/cli/index.js" dump my-talk --slide <id> --json` gives text, boxes and resolved props per step, for when you cannot view images.
6. **Look.** Open every PNG of the slide, or read the dump. Ask: is the right thing visible at each step, nothing clipped, nothing crowded?
7. **Fix**, then go back to 3. A slide is done when `validate`, `check` and `check --played` all exit 0 and the shots look right.

Every problem line reads `slide/element/step · rule · measured vs limit · suggested fix`. [checks](references/checks.md) explains each rule and how to fix it.

Exit codes:
- `0`: clean;
- `1`: problems;
- `2`: usage error, or a run that could not complete.

## Rules agents trip on

- **Step ids are words, never digits only.** Use `"base"`, not `"1"`. Reference steps by id (`from: "annotate"`), so inserting a step never shifts anything.
- **Hidden elements keep their space.** Add `collapse: true` to let the layout reflow.
- **`from` and `at` are for visibility.** `set`, `replace` and `only` change props. `only` lasts one step. `advance` drives a prop step by step (terminal `shown`, a custom `stage`).
- **A slide with a figure needs a source line.** A figure is `chart.*`, `map` or `big-number`. The source line is an element with `props.role: "source"`, usually in the `footer` region. Without it validate reports `figure-source`.
- **No figure is typed by hand.** Numbers come from data files through bindings (`{{data/summary.json#/total}}`) or chart columns. Generate the data with a script in `data/`.
- **A map's files come from the project's own code.** Boundaries, region ids, values, rasters and time-lapse frames are made by the project's R or Python analysis, which writes them into the deck's `data/`: rasters with the writer functions in `$STEPDECK/docs/guide/maps/` (copy one into the project). Run `boundaries` only when the project has no boundaries; put the source line it prints in the slide's source element. See `map` in [components](references/components.md) and [From your analysis code to a map slide](../docs/guide/maps-from-your-code.md).
- **A "you are here" copy is a second view.** `compact: true` on a `diagram` or a `map` draws it small, with one `caption`, in a corner `box` beside the slide's own figure; `inset: { locator: true }` puts an overview in a map. Bind every structural prop of both views to one `data/` file so they cannot drift. See `diagram` and `map` in [components](references/components.md), the [cookbook](references/cookbook.md#second-views) and [Show where we are](../docs/guide/second-views.md).
- **Props are JSON only.** Never put hex colors in props (`hex-color`); colors come from the theme palette. No remote URLs, so copy assets into the deck. Paths are relative to the deck root and case-exact.
- **Kicker and accent.** A slide's `section` is the kicker above its title, and `*phrase*` in a `title` is the accent phrase (one per title; `\*` for a literal asterisk). Do not define an element with id `kicker`. See [themes-layouts](references/themes-layouts.md).
- **Text is at least 28px.** That is the theme's `--min-audience-font`. Sources and the footer are exempt.
- **The canvas is 1920×1080.** All boxes and sizes are in canvas pixels.
- **Elements move in by themselves.** On a forward step, every element that appears enters in turn (the theme's `rise` or `fade`, or its own build: charts draw, lists build, big numbers count up) and every element that disappears fades out. You do not need extra steps to get motion. Use `enter: "none"` to keep one still, `transition: { stagger }` to space a step's entrances, and `lede`, badges, `highlight` and `ghost` for the message line, status tags, focus and placeholders (see [step-model](references/step-model.md) and the [cookbook](references/cookbook.md#motion)).

## Working in parallel: one slide per agent

Each slide is its own file, so several agents can work at once:
- each agent owns `slides/<id>.js`, plus any data files and custom components that only it uses;
- one owner edits `deck.js`, which holds the slide order and the `components` list;
- shared data files are generated by one script and treated as read-only.

Always pass `--slide <id>` to `validate`, `check`, `dump` and `shoot`, so nobody runs the whole deck. Two agents shooting at once write different files, because shots are named by slide.

`--step <id>` (with `--slide`) narrows `check`, `dump` and `shoot` to one step. `validate` rejects it, because it always checks every step of a slide.

## Present

`node "$STEPDECK/cli/index.js" serve my-talk` prints a URL to open in Chrome. It shows the reveal shell:
- the arrow keys or space step through;
- `S` opens the presenter view with notes;
- the URL hash is `#/<slide-id>/<step-id>`.

Add `?motion=full` to animate even when the OS asks for reduced motion.

## References

- [step-model.md](references/step-model.md): states, visibility (`from`, `at`, `collapse`, `ghost`), `set`, `replace`, `show`, `hide`, `only`, `advance`, notes, transitions, entrances and exits (`enter`, `exit`), the `lede`, step ids.
- [components.md](references/components.md): the built-in components, bindings and data files.
- [custom-components.md](references/custom-components.md): when and how to write your own component.
- [themes-layouts.md](references/themes-layouts.md): layouts and regions, the kicker and accent phrase, tokens, hooks and `theme.css`, palettes, `{{color:role}}`, the audience font, adding a theme or layout.
- [checks.md](references/checks.md): every validate and check rule, what it means and how to fix it. Also the known limits.
- [cookbook.md](references/cookbook.md): complete slide specs that pass validate and check, maps included.
