# AGENTS.md

stepdeck is an engine for step-by-step HTML presentations: slides are data, a CLI checks them. This file routes you and states invariants only. Details live in the files it points to. When a doc and the CLI disagree, the CLI is right: say so in your report.

First decide which job you have.

## A. Make or edit a presentation (slides, a deck, a talk)

Read `skill/SKILL.md` now, before writing anything. It is the whole workflow; open its `references/` only when it sends you there.

`$STEPDECK` is the absolute path of this folder. Shell state may not persist between your commands, so set it in each call or write the path out.

```sh
export STEPDECK=/abs/path/to/this/folder
export DECK=/abs/path/outside/this/repo/my-talk                         # always absolute (see below)
(cd "$STEPDECK" && npm install)          # only if validate says Ajv is missing; run it before the next line
(cd "$STEPDECK" && npm run playwright)   # only if check says Playwright is missing (needs the network)
node "$STEPDECK/cli/index.js" new      "$DECK"                           # a working 3-slide deck
node "$STEPDECK/cli/index.js" catalog  "$DECK"                           # then read $DECK/catalog/index.json
node "$STEPDECK/cli/index.js" validate "$DECK" --slide <id>              # Node only, fast
node "$STEPDECK/cli/index.js" check    "$DECK" --slide <id> --played     # headless Chrome
node "$STEPDECK/cli/index.js" shoot    "$DECK" --slide <id>              # PNGs in $DECK/shots/960/: open them
node "$STEPDECK/cli/index.js" dump     "$DECK" --slide <id> --json       # if you cannot view images
```

Invariants:
- The deck is its own folder outside this repository, made with `new`. Never build a talk in `templates/`, `examples/` or `site/`. Give every command the deck's absolute path (`$DECK`): a relative path is resolved from the folder you run in, and from this folder `new my-talk` would build the deck inside the repository.
- Do not read engine code to learn how something works: `engine/core/`, `engine/components/*/index.js`, `engine/vendor/`, or their copies in `<deck>/stepdeck/`. Read the skill, `<deck>/catalog/` and the CLI's output. The pages in `docs/` describe the engine and are fine to read; skip their "Source code" links. Finished slide specs are data and fine to read: `site/gallery/slides/*.js`, `examples/kit/slides/*.js`.
- Do not change this repository to build a deck, and add no dependency to it. `check`, `dump` and `shoot` need Chrome and Playwright, resolved from `cli/`: `(cd "$STEPDECK" && npm run playwright)` installs the pinned version without editing `package.json`, or set `STEPDECK_PLAYWRIGHT` to an existing `playwright` package folder. Installing it in the deck does nothing, and a later plain `npm install` in this folder removes it.
- `serve` runs until stopped: start it in the background or hand the user the command. A deck does not open from `file://`.
- Done means: `validate` and `check --played` exit 0 for every slide, and you looked at every step (PNG or dump). Say in your report what you could not run.

## B. Change stepdeck itself (engine, CLI, components, layouts, themes, tests, docs, the skill)

Read `docs/contributing/index.md` (setup, repository tour, keeping the docs in sync), then `docs/contributing/conventions.md`, then the page for your change: `adding-a-component.md`, `adding-a-layout.md`, `adding-a-theme.md`, `adding-a-rule.md`. Tests are described in `docs/contributing/testing.md`.

```sh
npm install
npm test                                        # unit, no browser; needs Node 22.15+
node --test test/unit/<file>.test.mjs           # one file
STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser   # Chrome, minutes; run the file you touched first
```

Invariants:
- The code is the ground truth. A change to a behaviour, prop, flag, default or rule id is not done until `docs/`, `skill/` and the piece's own `README.md` and `schema.json` agree with it, in the same change.
- Every spec in `skill/references/cookbook.md` passes `validate` and `check --played` in a deck made with `new`.
- No build step, no runtime dependency, no network at presentation time. `engine/` is copied verbatim into decks.
- Never commit `node_modules/`, `shots/` or `catalog/`.
