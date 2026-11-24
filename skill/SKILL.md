---
name: stepdeck
description: Make slides, a presentation, a slide deck or a talk as an interactive step-by-step HTML presentation with stepdeck, then validate, check and screenshot it. Use when the user asks for slides, a deck, a presentation or a talk (unless they ask for PowerPoint, Keynote or Google Slides files), for an animated or step-by-step explanation of data, a chart, a map, a diagram or a process, or to create or edit a stepdeck deck, slide, theme, layout or component. Slides are declarative JS specs (a layout, elements, steps) over built-in components (line, bar and points charts, big number, map, diagram, list, chat, timeline, terminal session, text, markdown, image), with data bindings and custom components.
---

# stepdeck

stepdeck turns slide specs into a presentation that runs in Chromium with no build step.
- A slide is plain data: a layout, the elements in its regions, and an array of steps.
- Each step is a patch over the step before.
- Anything the built-ins cannot show becomes a custom component under the same contract.

This skill is about using the engine. It does not plan your talk's content, but [design](references/design.md) gives the defaults that make slides read, with the limits the checks enforce.

**Read `catalog/index.json`, never engine source.** This skill, the catalog and the CLI output cover building slides. Never read engine code to find out how something works: `stepdeck/core/`, `stepdeck/components/*/index.js`, `stepdeck/vendor/`.
- The data files under `stepdeck/` are fine to read or copy: `example.js`, `README.md`, `schema.json`, `tokens.css`, `palettes.json`, `layout.css`.
- The next place to look is `$STEPDECK/docs/reference/components/<name>.md` (`chart-line.md`, `big-number.md`, …): each component's DOM, part classes, optional fields and error messages. The docs describe the engine and are fine to read; engine code is not, so skip the "Source code" line at the top of those pages.
- Finished, checked slide specs are data and fine to read: `$STEPDECK/site/gallery/slides/*.js` (43 slides; their data is in `$STEPDECK/site/gallery/data/`) and `$STEPDECK/examples/kit/slides/*.js` (10 slides).
- If all of these leave a question open, say so in your report.

## Setup: the CLI

This skill is not standalone: the CLI and the engine live in the stepdeck repository. Below, `$STEPDECK` stands for the absolute path of that repository, the folder that holds `cli/index.js`. Find it in this order:
1. From the Claude Code plugin it is `${CLAUDE_PLUGIN_ROOT}`. If that reads here as a literal `${…}`, it was not substituted: go on to the next line.
2. Read from a clone, it is the parent of this `skill/` folder.
3. Otherwise ask the user where stepdeck is cloned.

Then:
- **Verify it first** with `node "$STEPDECK/cli/index.js" --help`. It must print the usage.
- **Shell state may not persist between your commands.** Run `export STEPDECK=/abs/path/to/stepdeck` in the same shell call as the command, or write the path out.
- **`validate` needs Ajv.** Only if `validate` says it is missing, run `(cd "$STEPDECK" && npm install)`, and do it before installing Playwright: a later `npm install` removes Playwright. Every other command, `--help` and `new` included, works without it. If it is missing, `validate` prints "run `npm install` in <path> first" and exits 2.

```sh
export STEPDECK=/abs/path/to/stepdeck
node "$STEPDECK/cli/index.js" --help
node "$STEPDECK/cli/index.js" new /abs/path/outside/stepdeck/my-talk   # a new deck, with the engine copied into it
```

Give `new`, and every later command, the deck's **absolute path, outside the stepdeck folder**. A relative path is resolved from the folder you run in, so `new my-talk` run from the repository would build the deck inside it. Below, `my-talk` stands for that absolute path.

Every command takes the deck folder as its positional argument; without one, it uses the current folder. There are four exceptions:
- `new <dir>` takes the new folder to create, not an existing deck.
- `new-component <name> [deckDir]` takes the component name first, then the deck folder.
- `catalog [name] [folder]` takes the entry name and the folder in either order.
- `boundaries <ISO3> <ADM0-ADM5> [--deck dir]` takes a country code and an admin level, and the deck folder as `--deck`. It fetches open admin boundaries from geoBoundaries into `<deck>/data/` and is the only command that needs the network; use it only when the project has no boundaries of its own (see the map rule below).

Every command and option is in [`$STEPDECK/docs/reference/cli.md`](../docs/reference/cli.md).

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
- Playwright: it is resolved from `$STEPDECK/cli/`, so installing it in the deck does nothing. Only if a browser command says it is missing, run `(cd "$STEPDECK" && npm run playwright)` (it needs the network), which installs the pinned version without editing `package.json`, or set `STEPDECK_PLAYWRIGHT` to an existing `playwright` package folder. A later plain `npm install` in `$STEPDECK` removes it again.
- Chromium: by default they use the system Chrome. Set `STEPDECK_CHANNEL` to choose another channel.

If Playwright is missing, the command exits 2 with a message saying so.

## Workflow, in this order

0. **Plan.** One claim per slide. Write each title as that claim, and decide what each click adds. See [design](references/design.md).
1. **Catalog.** Run `node "$STEPDECK/cli/index.js" catalog my-talk`, then read `my-talk/catalog/index.json`. It holds one line per component, layout and theme, plus the props that animate and whether a component builds its own entrance (`enter: own`).
   - Then run `node "$STEPDECK/cli/index.js" catalog <name> my-talk` for each entry you will use. It prints the props, with their descriptions and examples, in a compact text form. Add `--json` when a script needs the full entry.
   - A component's README holds the shapes the props table cannot, such as the terminal script. It is at `my-talk/stepdeck/components/<name>/README.md`, and it is the `readme` key of the `--json` entry.
   - The `example` path in an entry is relative to the engine for a built-in component or a layout (`my-talk/stepdeck/<path>`), and relative to the deck for a deck component (`origin: "deck"`, `my-talk/<path>`). Example slides show the shape; their data files are not in your deck.
2. **Slide spec.** Write one file per slide, `slides/<id>.js` (`export default { id, layout, title, elements, steps }`), and add the id to `slides` in `deck.js`.
   - **`deck.js` `slides` may list an id before its file is written.** `validate --slide <id>`, `check --slide <id>`, `dump` and `shoot` of a written slide pass while other listed files are missing, so the slide order can be fixed first and the files filled in side by side. A run over the whole deck reports each missing file once, at its slide (`slide-missing` from `validate`, `render-error … slides/<id>.js not found` from `check`): the deck is not done until those are gone.
   - Put figures in data files, never in the spec (see the bindings section in [components](references/components.md)).
   - See [step-model](references/step-model.md) and the [cookbook](references/cookbook.md).
3. **Validate** (Node, no browser, well under a second): `node "$STEPDECK/cli/index.js" validate my-talk --slide <id>`. Fix every error line. Warnings exit 0.
4. **Check** (headless Chrome): `node "$STEPDECK/cli/index.js" check my-talk --slide <id> --played`. It checks layout, font size, contrast and page errors.
   - `--played` runs everything plain `check` does, then also checks that the slide looks the same when played step by step as when you jump straight to a step. One run is enough.
   - Timing: on a quiet machine a browser command starts in 1 to 2 s, and `check --played` on a whole deck of 16 to 28 steps takes about 6 to 7 s (it drives up to four pages at once; `STEPDECK_WORKERS=1` uses one). A busy machine can be several times slower.
5. **Shoot or dump.**
   - `node "$STEPDECK/cli/index.js" shoot my-talk --slide <id>` writes PNGs to `my-talk/shots/960/<slide>-<nn>-<step>.png`. `--size 1920|1280|960` picks the width (default 960); the files go to `shots/<size>/`.
   - `node "$STEPDECK/cli/index.js" dump my-talk --slide <id> --json` gives text, boxes and resolved props per step, for when you cannot view images.
   - `check` and `dump` take `--size <width>` as the viewport width (default 1920). Boxes stay in canvas pixels at every size.
6. **Look.** Open every PNG of the slide, or read the dump. Ask the questions at the end of [design](references/design.md): is the right thing visible at each step, nothing clipped, nothing crowded, nothing covering the figure?
7. **Fix**, then go back to 3. A slide is done when `validate` and `check --played` exit 0 and the shots look right.

Every problem line reads `slide/element/step · rule · measured vs limit · suggested fix`. [checks](references/checks.md) explains each rule and how to fix it.

Exit codes:
- `0`: clean;
- `1`: problems;
- `2`: usage error, or a run that could not complete.

## Rules agents trip on

- **Step ids are words, never digits only.** Use `"base"`, not `"1"`. Reference steps by id (`from: "annotate"`), so inserting a step never shifts anything. A slide with no `steps` has one step of its own, `0` (its shot is `<slide>-00-0.png`, its hash `#/<slide>/0`).
- **Hidden elements keep their space.** Add `collapse: true` to let the layout reflow.
- **`from` and `at` are for visibility.** `set`, `replace` and `only` change props. `only` lasts one step. `advance` drives a prop step by step (terminal `shown`, a custom `stage`).
- **A slide with a figure needs a source line.** A figure is `chart.*`, `map`, `map.*` or `big-number`. The source line is an element with `props.role: "source"`, usually in the `footer` region. Without it validate reports `figure-source`.
- **No figure is typed by hand.** Numbers come from data files through bindings (`{{data/summary.json#/total}}`) or chart columns. Generate the data with a script in `data/`.
- **A map's files come from the project's own code.** Boundaries, region ids, values, rasters and time-lapse frames are made by the project's R or Python analysis, which writes them into the deck's `data/`: rasters with the writer functions in `$STEPDECK/docs/guide/maps/` (copy one into the project). Run `boundaries` only when the project has no boundaries; put the source line it prints in the slide's source element. See `map` in [components](references/components.md) and [`$STEPDECK/docs/guide/maps-from-your-code.md`](../docs/guide/maps-from-your-code.md).
- **A "you are here" copy is a second view.** `compact: true` on a `diagram` or a `map` draws it small, with one `caption`, in a corner `box` beside the slide's own figure; `inset: { locator: true }` puts an overview in a map. Bind every structural prop of both views to one `data/` file so they cannot drift. See `diagram` and `map` in [components](references/components.md), the [cookbook](references/cookbook.md#second-views) and [`$STEPDECK/docs/guide/second-views.md`](../docs/guide/second-views.md).
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

- **`serve` keeps running until it is stopped.** Start it in the background, or hand the user the command. The default port is 8000; a busy port exits 2, and `--port 0` picks a free one (the URL it prints has the port).
- **A deck does not open from `file://`.** Its page loads the engine as modules, which browsers refuse from a file URL. Always go through `serve` or another static server.
- **There is no PDF export.** `shoot` gives a PNG per step.
- **The browser tab's title** is `deck.js` `title`, set once the deck has loaded; the `<title>` in `index.html` shows only while it loads.

## References

- [design.md](references/design.md): one claim per slide, what a step is for, which layout and component for which job, how much fits, what to look for in the shots.
- [step-model.md](references/step-model.md): states, visibility (`from`, `at`, `collapse`, `ghost`), `set`, `replace`, `show`, `hide`, `only`, `advance`, notes, transitions, entrances and exits (`enter`, `exit`), the `lede`, step ids.
- [components.md](references/components.md): the built-in components, bindings and data files.
- [custom-components.md](references/custom-components.md): when and how to write your own component.
- [themes-layouts.md](references/themes-layouts.md): layouts and regions, the kicker and accent phrase, tokens, hooks and `theme.css`, palettes, `{{color:role}}`, the audience font, adding a theme or layout.
- [checks.md](references/checks.md): every validate and check rule, what it means and how to fix it. Also the known limits.
- [cookbook.md](references/cookbook.md): complete slide specs that pass `validate` and `check --played`, maps included.
