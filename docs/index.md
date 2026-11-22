# stepdeck documentation

This page is the map of the stepdeck docs. It is for three kinds of reader:
- people who write decks by hand;
- agents that build decks, and the people who steer them;
- contributors who change the engine, its components, layouts, themes or checks.

Pick your reading path below, or jump to a page from the lists.

## What stepdeck is

stepdeck is an engine for step-by-step HTML presentations: a deck is a folder of static files, and the engine is copied into it, so it runs in Chrome with no build step and no network. A slide is plain data, a layout plus elements plus an array of steps, and the state at step k is the fold of steps 0..k, each step a patch over the one before. Jumping straight to a step and playing up to it must look the same, and the CLI checks that, along with schemas, data, layout, font size and contrast, at every step.

## Start here

### Writing decks by hand

1. [Quickstart](guide/quickstart.md): make a deck, serve it, present it.
2. [Your first deck](guide/first-deck.md): edit the starter slides into your own.
3. [The step model](guide/step-model.md): how steps fold into states.
4. [Checking a deck](guide/checking-a-deck.md): `validate`, `check`, `shoot` and `dump`.

Then use the [reference](#reference) as you need it.

### Agents, and people steering agents

1. [stepdeck for agents](guide/for-agents.md): what the agent workflow looks like and how to steer it.
2. [The stepdeck skill](../skill/SKILL.md): the instructions an agent follows. Its references are in [`skill/references/`](../skill/references/).

An agent works from the skill, the catalog that `catalog <deck>` generates at `<deck>/catalog/index.json`, and CLI output. It does not need to read engine source.

### Contributors

1. [Architecture](concepts/architecture.md): the fold engine, the slide controller, the layout renderer, the shells and the CLI.
2. [Contributing](contributing/index.md): setup, tests and the pages on adding pieces.

## Guides

| Page | What it covers |
| --- | --- |
| [Quickstart](guide/quickstart.md) | Install, create a deck with `new`, serve and present it. |
| [Your first deck](guide/first-deck.md) | Walk through the starter deck and turn it into your own slides. |
| [The step model](guide/step-model.md) | Steps as patches, `set`/`replace`/`show`/`hide`/`only`, and the `from`, `at` and `advance` shortcuts. |
| [Animation and motion](guide/animation-and-motion.md) | The named motions elements enter and leave with, how one step's entrances follow each other, the theme's motion tokens, focus-dim, the message line, badges and ghost placeholders; when motion plays, why a jump and a played step end in the same state, and reduced motion. |
| [Data and bindings](guide/data-and-bindings.md) | Data files in `data/`, bindings with a JSON pointer and an optional format, CSV column types. |
| [From your analysis code to a map slide](guide/maps-from-your-code.md) | Where a map's files come from: what your R or Python code makes and what stepdeck does with it, the exact file shapes, writer functions to copy into your code, writing boundaries, `stepdeck boundaries`, the slide and the checks. |
| [Layouts and themes](guide/layouts-and-themes.md) | Choosing a layout, placing elements in regions, region variables, theme tokens and palettes. |
| [Presenting](guide/presenting.md) | Serving a deck, keys, the presenter view, URL hashes and query flags. |
| [Checking a deck](guide/checking-a-deck.md) | Running the checks, reading problem lines and fixing common problems. |
| [Custom components](guide/custom-components.md) | Writing a deck component with `new-component` under the component contract. |
| [stepdeck for agents](guide/for-agents.md) | How agents use the skill, the catalog and the CLI, and how to direct them. |

## Reference

| Page | What it covers |
| --- | --- |
| [Deck and slide spec](reference/deck-and-slide.md) | Every key of `deck.js`, slide files, elements and steps. |
| [Components](reference/components/index.md) | The 13 built-in components and what they share. |
| [Layouts](reference/layouts.md) | The five built-in layouts, their regions and variables. |
| [Themes](reference/themes.md) | Theme files, tokens and palettes. |
| [CLI](reference/cli.md) | Every command, option, output format and exit code. |
| [Rules](reference/rules.md) | Every `validate` and `check` rule, with what triggers it and how to fix it. |
| [Runtime API](reference/runtime-api.md) | `boot()`, `window.STEPDECK`, query flags and the shells. |
| [Component contract](reference/component-contract.md) | `mount`, `update`, the `info` argument and `ctx`. |

One page per built-in component, in the order of `components/index.json`:

| Page | Component |
| --- | --- |
| [text](reference/components/text.md) | A paragraph in one of four roles: body, source, note, label. |
| [chart.line](reference/components/chart-line.md) | Line chart from a CSV, with series, highlight, annotations and an interval band. |
| [chart.bar](reference/components/chart-bar.md) | Bar chart from a CSV, one row per category. |
| [chart.points](reference/components/chart-points.md) | Estimates with intervals from a CSV, one row per category, with a reference line. |
| [terminal](reference/components/terminal.md) | A scripted terminal session revealed event by event. |
| [markdown](reference/components/markdown.md) | A block of Markdown. |
| [big-number](reference/components/big-number.md) | One number with a format, label and optional interval, counting up. |
| [list](reference/components/list.md) | A numbered, lettered, bulleted or checklist list revealed item by item. |
| [diagram](reference/components/diagram.md) | Nodes, edges and groups on a grid. |
| [chat](reference/components/chat.md) | A conversation shown as bubbles or a card. |
| [timeline](reference/components/timeline.md) | Stops along a line with a progress fill. |
| [image](reference/components/image.md) | An image file from the deck, with alt text and an optional caption. |
| [map](reference/components/map.md) | Regions from a GeoJSON file with layers of data over them (a choropleth from a CSV, rasters, points), highlights, names, a legend, flights, a zoom inset and time-lapses. Its files come from your own code: see [From your analysis code to a map slide](guide/maps-from-your-code.md). |

## Concepts

| Page | What it covers |
| --- | --- |
| [Architecture](concepts/architecture.md) | How the pieces fit: fold, controller, layout renderer, registry, shells, CLI. |

## Contributing

| Page | What it covers |
| --- | --- |
| [Contributing](contributing/index.md) | Repository layout, setup and the workflow for a change. |
| [Testing](contributing/testing.md) | Unit and browser tests, fixtures and how to run them. |
| [Adding a component](contributing/adding-a-component.md) | A new built-in component: files, schema annotations, tests. |
| [Adding a layout](contributing/adding-a-layout.md) | A new layout: `layout.css`, `schema.json`, README and example. |
| [Adding a theme](contributing/adding-a-theme.md) | A new theme: `tokens.css`, `palettes.json`, fonts and README. |
| [Adding a rule](contributing/adding-a-rule.md) | A new `validate` or `check` rule and its fixture. |
| [Conventions](contributing/conventions.md) | Code, naming, error-message and docs conventions. |

## Troubleshooting

[Troubleshooting](troubleshooting.md): common errors and what to do about them, from a deck that does not load to a check that fails.

## Design history

These files are historical records, not user docs:
- [`design/2026-11-18-engine-design.md`](design/2026-11-18-engine-design.md): the approved engine design, with passages amended after milestones M0 and M1 marked **[M0]** and **[M1]**.
- [`design/m0-findings.md`](design/m0-findings.md): where the component contract changed during the M0 spike, and the M1 amendments.

They record what was planned and decided at the time. Some of what they describe was changed later or has not been built. Where they disagree with the pages above, the code and these pages are right.

## Conventions used in these docs

- **Canvas pixels.** Every slide is drawn on a 1920 x 1080 canvas and scaled to fit the screen. Sizes, positions and element boxes are given in canvas pixels.
- **Theme values.** Font sizes, colors and spacing are quoted from `academic-light`, one of the two built-in themes, and are marked with its name. The default theme, `modern`, uses the same sizes and spacing (except the cover title) with its own colors and fonts; a theme can change any of them, and the token names stay the same. See [Themes](reference/themes.md).
- **Commands.** Examples run the CLI from the repository root as `node cli/index.js <command> [deckDir] [options]`. `cli/index.js` is also the package's `stepdeck` bin, so if the `stepdeck` bin is on your `PATH`, `stepdeck <command>` is the same thing. For most commands the deck folder defaults to the current folder. `new` needs a folder, `new-component` takes a component name first and the folder second, and `catalog` takes an optional entry name besides the folder (see the [CLI reference](reference/cli.md)).

```sh
node cli/index.js new ../my-talk
node cli/index.js validate ../my-talk
```
