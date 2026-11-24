# Quickstart

This page takes you from a fresh clone to a running deck, a clean check and a folder of screenshots in about five minutes. It is for people who write slides by hand and have not used stepdeck before. Each step links to a page with more depth.

If you work through an agent, point it at [skill/SKILL.md](../../skill/SKILL.md) instead. It covers the same workflow for agents.

## Requirements

| Need | Why |
|---|---|
| Node 20 or later | Runs the CLI (`package.json` `engines`). The test scripts need Node 22.15 or later (see [Testing](../contributing/testing.md)). |
| Chrome | `check`, `dump` and `shoot` drive your system Chrome by default. Set `STEPDECK_CHANNEL` to use another Playwright channel. |
| Playwright | Not a dependency of this repo. The CLI resolves it from its own `cli/` folder, so installing it inside a deck does nothing. Install it in the stepdeck clone with `npm run playwright`, which runs `npm install --no-save` for the version CI uses and leaves `package.json` and the lockfile alone. Run it after `npm install`; a later plain `npm install` removes it again. Or set `STEPDECK_PLAYWRIGHT` to a `playwright` package folder, for example `STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright`. |
| `npm install` | Installs Ajv, which only `validate` needs. Without it, `validate` asks you to run `npm install` and exits 2. The other commands still work. |

```sh
git clone https://github.com/horaciochacon/stepdeck.git
cd stepdeck
npm install
npm run playwright    # optional: for check, dump and shoot
```

The commands below run from the `stepdeck` folder and use `node cli/index.js`. After `npm link`, `stepdeck <command>` does the same thing.

## Create a deck

```sh
node cli/index.js new ../my-talk
```

`new` copies the `talk` template, which is the only template today, into `../my-talk/`. It then copies the engine into `../my-talk/stepdeck/`. The deck is self-contained: it needs no build step and no network to present. `new` refuses a folder that exists and is not empty:

```text
stepdeck: /…/my-talk is not empty; pass a new or empty folder
```

On success, it prints the next commands with the full path to the CLI, ready to paste:

```text
created /…/my-talk (template talk; engine copied to stepdeck/)

next:
  the deck already works: slides/chart.js, slides/closing.js, slides/title.js;
  edit them, or delete a slide file and its id in deck.js `slides`; add slides as slides/<id>.js
  node /…/stepdeck/cli/index.js serve /…/my-talk  # present: open the URL it prints (index.html, reveal shell)
  node /…/stepdeck/cli/index.js validate /…/my-talk  # in Node: schemas, props at every step, data, paths
  …
```

The new folder holds:

| File | What it is |
|---|---|
| `deck.js` | Deck settings and the slide order: `title`, `lang: "en"`, `theme: "modern"`, `components: []`, `slides: ["title", "chart", "closing"]`. |
| `slides/title.js` | The cover, on the `title` layout. No steps. |
| `slides/chart.js` | A line chart that builds up over four steps (`base`, `compare`, `mark`, `latest`), on the `figure-notes` layout. |
| `slides/closing.js` | The closing slide, on the `title` layout. No steps. |
| `data/make-data.mjs` | Writes the example data, `data/series.csv` and `data/summary.json`. Run `node data/make-data.mjs` in the deck to rebuild both. |
| `index.html` | The page you present. Its import map points `stepdeck/` at `./stepdeck/`, and it calls `boot({ shell: "reveal" })`. |
| `package.json` | Marks `deck.js` and `slides/*.js` as ES modules so `validate` can import them in Node. |
| `.gitignore` | Ignores `shots/` and `catalog/`. |
| `stepdeck/` | The copied engine: `core`, `components`, `layouts`, `themes`, `vendor`, `schema`, plus `LICENSE` and `THIRD_PARTY_NOTICES.md`. You do not edit it. |

Each slide is one file, `slides/<id>.js`, plus its id in the `slides` list in `deck.js`.

## Serve and present

```sh
node cli/index.js serve ../my-talk
```

```text
serving /…/my-talk
present: http://127.0.0.1:8000/
(Ctrl-C to stop)
```

Open the `present:` URL in Chrome. The server binds to `127.0.0.1` only and uses port 8000 by default. If 8000 is taken, pass `--port 0` to pick a free port, or another number.

In the presentation:

| Key or URL | Does |
|---|---|
| Arrow keys | Step forward and back. |
| Space | Steps forward. |
| `S` | Opens the presenter view, with notes, a timer and the next step. |
| `#/<slide>/<step>` | Addresses any step, for example `#/chart/compare`. Steps without an id use their number. |

## Check the deck

These commands start their own server, so `serve` does not need to be running.

```sh
node cli/index.js validate ../my-talk
node cli/index.js check ../my-talk --played
node cli/index.js shoot ../my-talk
```

| Command | Runs in | Checks or writes |
|---|---|---|
| `validate` | Node, no browser | Deck and slide schemas, props at every step, step references, data files, columns and bindings, paths, a source line on every figure. |
| `check --played` | Chrome | Per step: text outside the canvas or its region, overlapping text, text under the audience minimum, contrast, console, network and render errors. `--played` also plays into each step forward and backward and compares the result with jumping to it. |
| `shoot` | Chrome | One PNG per step in `../my-talk/shots/960/`. |

On the fresh deck all three pass:

```text
validate: 3 slides, 0 errors, 0 warnings
check: 3 slides, 6 steps, 6 played arrivals compared, 0 problems
/…/my-talk/shots/960/title-00-0.png
/…/my-talk/shots/960/chart-00-base.png
/…/my-talk/shots/960/chart-01-compare.png
/…/my-talk/shots/960/chart-02-mark.png
/…/my-talk/shots/960/chart-03-latest.png
/…/my-talk/shots/960/closing-00-0.png
shoot: 6 PNGs at 960×540
```

Open the PNGs and look at them. Checks catch measurable problems; they do not tell you whether a slide reads well.

Exit codes: `0` clean, `1` problems found (for `validate`, warnings alone still exit 0), `2` usage error or a run that could not complete. All commands and options are in the [CLI reference](../reference/cli.md).

## The edit loop

1. Change a slide file, for example a prop or a step in `slides/chart.js`.
2. Reload the browser. `serve` sends `Cache-Control: no-store` on every response, so a plain reload picks up the change.
3. Run `validate` again, then `check` (and `shoot` when you want to look).

Every problem prints as one line, `slide/element/step · rule · measured vs limit · fix`. For example, a misspelled prop on the chart:

```text
chart/chart/base · unknown-prop · prop 'colour' vs props of chart.line: data, x, y, series, series_shown, highlight, annotate, axes, format, types, interval, points, forecast, until, ticker, draws · remove 'colour'; allowed keys are data, x, y, series, series_shown, highlight, annotate, axes, format, types, interval, points, forecast, until, ticker, draws (props of chart.line)
validate: 3 slides, 1 error, 0 warnings
```

Use `--slide <id>` to limit any check to one slide while you work on it.

## Next steps

- [Your first deck](first-deck.md): replace the starter slides with your own.
- [The step model](step-model.md): how steps patch a slide, and `from`, `at` and `advance`.
- [Checking a deck](checking-a-deck.md): what each rule measures and how to fix it.
- [Troubleshooting](../troubleshooting.md): Playwright not found, Ajv missing, a deck that does not load.
