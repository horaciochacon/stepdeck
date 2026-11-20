# Presenting and the presenter view

This page covers how to run a talk from a stepdeck deck: serving it, the keys, the presenter view, the URLs that address a slide and step, reduced motion, and the bare shell that the CLI uses for previews. It is for people who present a deck they wrote by hand. If an agent builds your deck, the short version is in the [skill](../../skill/SKILL.md#present).

## Serve the deck

Commands on this page run from the stepdeck repository folder and use `node cli/index.js`; after `npm link`, `stepdeck <command>` does the same. See the [Quickstart](quickstart.md#requirements) for setup.

```sh
node cli/index.js serve ../my-talk
```

```text
serving /…/my-talk
present: http://127.0.0.1:8000/
(Ctrl-C to stop)
```

Open the `present:` URL in Chrome. It loads the deck's `index.html`, which boots the reveal shell (`boot({ shell: "reveal" })`).

What `serve` does:

| Behaviour | Detail |
|---|---|
| Address | Binds to `127.0.0.1` only. |
| Port | `8000` by default. `--port <n>` picks another; `--port 0` picks a free one. |
| Caching | Every response carries `Cache-Control: no-store`, so a reload always shows your latest edits. |
| Methods | `GET` and `HEAD` only; anything else gets `405`. |
| Paths | A path that escapes the served folder gets `403`; a missing file gets `404`; a folder serves its `index.html`. |
| `--json` | Prints `{ "url", "root", "port" }` instead of the text lines. |
| Stopping | Runs until Ctrl-C (`SIGINT`) or `SIGTERM`. |

A deck made with `new` has the engine copied into `<deck>/stepdeck/`, so `serve` serves the deck folder itself. A deck inside this repository without an engine copy, such as `examples/kit`, is served from the repository root, and the `present:` URL ends with the deck's path (`http://127.0.0.1:8000/examples/kit/`). A deck outside the repository with no engine copy is refused:

```text
stepdeck: deck at /…/talk has no engine copy; run `stepdeck new` or copy the engine to /…/talk/stepdeck/
```

### Any static server works

`serve` is a convenience. Because the engine sits inside the deck folder, any static file server that serves the deck folder over HTTP can present it. Two requirements:

- **Same origin.** The deck must come from the same origin as the page. `index.html` uses the page's own folder as the deck, which always satisfies this. A deck URL on another origin is a fatal boot error, shown on the first slide:

  ```text
  deck: deck must be same-origin with the page (got http://other:9000, page is http://127.0.0.1:8000); use a relative path
  ```

- **HTTP, not `file://`.** The engine loads ES modules and fetches `deck.js`, slides, data and fonts. Serve the folder; do not open `index.html` from disk.

For example, with Python 3 and no stepdeck checkout:

```sh
cd my-talk
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8000/`. Unlike `serve`, this server may let the browser cache files, so force a reload after editing.

### No network needed

A deck needs no network at presentation time. The engine, reveal.js, the fonts and the deck's data are all files in the deck folder. `check` blocks every request to another origin and reports it as `network-error`, so a deck that passes `check` does not reach out to the internet while you present.

## Keys

The reveal shell hands keyboard navigation to reveal.js. stepdeck turns each step after step 0 into a reveal fragment, so "next" moves one step, and moves to the next slide only after the last step.

| Key | Action |
|---|---|
| Right arrow, Down arrow, Space, `N` | Next step (then next slide). |
| Left arrow, Up arrow, `P`, Shift+Space | Previous step (then previous slide, at its last step). |
| Alt + arrow | Move by slide, skipping steps. |
| Shift + Left / Right arrow, `Home` / `End` | Jump to the first / last slide. |
| `S` | Open the presenter view. |
| `Esc`, `O` | Slide overview. |
| `F` | Full screen. |
| `B`, `.` | Pause (blank the screen). |
| `G` | Jump to a slide. |

Moving forward by exactly one step plays that step's motion. Every other move (back, a jump, Alt + arrow) shows the target state directly, with no animation. Both end in the same state. See [Animation and motion](animation-and-motion.md).

### What the reveal shell shows

- One reveal `<section>` per slide, holding that slide's 1920 x 1080 canvas, scaled to the window and letterboxed in the theme's letterbox color.
- A thin progress bar at the bottom, in the theme's muted ink color.
- No reveal transitions between slides (`transition: "none"`). All motion comes from stepdeck components, so slides look the same as in `check` and `shoot`.
- No on-screen arrow controls and no slide number.
- In the overview, a slide that has not been mounted yet shows only its title.

## The presenter view

Press `S` in the presentation window. reveal's notes plugin (`vendor/reveal/plugin/notes.js`) opens a separate window. If nothing opens, allow pop-ups for the page and press `S` again.

The presenter view shows:

| Panel | Content |
|---|---|
| Current | The current slide at the current step. |
| Upcoming | A preview of the next step (the next fragment, or the next slide). |
| Notes | The notes of the current step. |
| Time | The wall clock and the elapsed time since you opened the view (hover over the panel and click "Click to Reset" to restart it). |

Keys pressed in the presenter view drive the presentation window too, so you can present from either one. Put the presentation window on the projector and keep the presenter view on your screen.

### Notes per step

Notes come from the slide and its steps. The notes for step k are `step.notes ?? slide.notes ?? ""`. They are not inherited from earlier steps: a step without `notes` shows the slide's `notes`, or nothing.

From the `talk` template (`templates/talk/slides/chart.js`):

```js
steps: [
  { id: "base", notes: "Start with one series." },
  { id: "compare", set: { chart: { series_shown: ["Group A", "Group B"] } } },
  { id: "mark", set: { chart: { annotate: [{ x: 2020, label: "2020" }] } } },
  { id: "latest", only: { chart: { highlight: "Group B" } }, notes: "Land on the figure." },
],
```

This slide has no slide-level `notes`, so the presenter view shows "Start with one series." at `base`, nothing at `compare` and `mark`, and "Land on the figure." at `latest`. Add `notes` to the slide to give every step without its own notes a fallback.

Notes are plain text; HTML in them is escaped and shown as text.

### Timing

The slide schema accepts `seconds` (planned time for a slide), but the presenter view does not use it yet. The timer shows elapsed time only, with no pacing against a plan.

### Preview frames

The current and upcoming panels are the deck itself, loaded in frames with a `?receiver` query flag. A preview frame:

- never animates, so the upcoming panel shows the end state of the next step;
- mutes audio and video and turns off autoplay;
- leaves the URL hash to reveal;
- shows a small "motion off" badge in its top right corner when motion is off (the OS asks for reduced motion and the page has no `?motion=full`), so you know the audience window will not animate either.

## URLs

### The hash: `#/<slide>/<step>`

The presentation window keeps the URL hash in sync with where you are:

```text
http://127.0.0.1:8000/#/chart/mark
```

The first part is the slide id. The second is the step id, or the step's index for a step without an id (`#/title/0`). Loading `#/chart/1` opens the second step of `chart`, and the hash is rewritten to its id, `#/chart/compare`. The engine writes the hash with `history.replaceState`, so stepping through a talk does not fill the browser history. Editing the hash while presenting moves the talk there.

reveal's own hash handling is switched off; the engine owns the hash.

### Where a page opens

On load, the reveal shell picks the first of these that is present:

1. The hash, `#/<slide>/<step>`.
2. The query flags `?slide=<id>&step=<id or index>`.
3. The first slide, at step 0.

A bad hash or step does not stop the talk; each records an error in `STEPDECK.errors`. Only an unknown `?slide=` is fatal:

| URL | Result |
|---|---|
| `#/chart/nope` (unknown step) | Opens `chart` at step 0. Error: `stepdeck: unknown step 'nope' in slide 'chart' (steps: base, compare, mark, latest) in the URL hash` |
| `#/nope/1` (unknown slide) | Opens the deck as if there were no hash. Error: `stepdeck: unknown slide 'nope' (slides: title, chart, closing) in the URL hash` |
| `?slide=chart&step=zz` (unknown step) | Opens `chart` at step 0. Error: `stepdeck: unknown step 'zz' in slide 'chart' (steps: base, compare, mark, latest)` |
| `?slide=nope` (unknown slide) | Fatal: `stepdeck: unknown slide 'nope' (slides: …)` on the canvas. |

While presenting, a bad hash typed into the address bar records the same error, keeps the talk where it is and writes the current hash back.

### Query flags

| Flag | Effect |
|---|---|
| `?slide=<id>&step=<ref>` | Start slide and step (used when there is no hash). A step ref of digits is an index; anything else is a step id. |
| `?lang=<code>` | Overrides `deck.lang` (number formats and built-in labels such as "95% CI"). |
| `?theme=<name>` | Overrides `deck.theme`. An unknown theme is a boot error: `deck: theme '<name>' not found (…)`. |
| `?motion=full` | Animate even when the OS asks for reduced motion. |
| `?capture` | Screenshot mode: no animation, and every CSS transition and animation off (adds the `capture` class to `<html>`). |
| `?receiver` | Marks a presenter preview frame (see above). The notes plugin adds it; you do not need it. |

Flags go before the hash: `http://127.0.0.1:8000/?lang=es#/chart/mark`.

## Neighbouring slides

The reveal shell mounts the current slide and its neighbours (one before, one after) ahead of time: the previous slide at its last step and the next slide at step 0, which is where you arrive when you step into them. Moving to the next slide does not wait for a slow neighbour to finish.

When you leave a slide, it is paused (running motion stops) but stays mounted. Slides are destroyed only when the page is closed.

A slide that fails shows its error on its own canvas. `STEPDECK.errors` lists boot errors and the errors of the slide on screen only, so a broken neighbour is not reported there until you visit it. Run `check` before the talk to catch every slide.

## Reduced motion

stepdeck follows the OS setting. When the OS asks for reduced motion (`prefers-reduced-motion: reduce`), steps show their end state directly, with no animation. Content is the same either way; only the movement is skipped.

To animate anyway, for example when the presentation machine has reduced motion on but you want the motion, add `?motion=full`:

```text
http://127.0.0.1:8000/?motion=full#/chart/base
```

`STEPDECK.flags.motion` is `true` unless the OS asks for reduced motion and the page has no `?motion=full`. `STEPDECK.flags.animate` says whether the page animates at all: it is `false` when `motion` is `false`, with `?capture`, or in a preview frame.

## The bare shell, for previews

`core/render.html` is the bare shell. It shows one slide canvas, scaled to fit and letterboxed, with no keys, no hash and no presenter view. `dump`, `check` and `shoot` render through it, and it is handy for looking at one step in a browser tab:

```text
http://127.0.0.1:8000/stepdeck/core/render.html?slide=chart&step=mark
```

| Parameter | Meaning |
|---|---|
| `deck=<dir>` | The deck folder, relative to `render.html`. Defaults to `../../`, which is the deck folder when the engine is copied to `<deck>/stepdeck/`. |
| `slide=<id>`, `step=<ref>` | The slide and step to show. Defaults to the first slide, step 0. |
| `capture` | Screenshot mode, as above. |
| `lang`, `theme`, `motion` | As in the reveal shell. |

For a deck inside this repository served from the repository root, pass the deck: `http://127.0.0.1:8000/core/render.html?deck=../examples/kit/&slide=speed`.

In the bare shell, an unknown `?slide=` is fatal and shown on the canvas. Drive it from the console with `STEPDECK.goTo(slide, step)`. See the [Runtime API](../reference/runtime-api.md).

## Before the talk

Run the checks on the deck you will present:

```sh
node cli/index.js validate ../my-talk
node cli/index.js check ../my-talk --played
node cli/index.js shoot ../my-talk
```

- `validate` checks schemas, props at every step, data and paths.
- `check --played` renders every step, checks layout, font size, contrast and errors, and then plays into each step forward and backward and compares the result with jumping to it. It catches broken neighbour slides that the presentation would not report until you reach them.
- `shoot` writes one PNG per step to `../my-talk/shots/960/`. Flip through them to review the whole talk without presenting it.

`check` and `shoot` drive Chrome through Playwright; see [Checking a deck](checking-a-deck.md) and the [CLI reference](../reference/cli.md).

On the day:

1. Copy the whole deck folder, including `stepdeck/`, to the presentation machine, and have Chrome there. The engine copy in `stepdeck/` does not include the CLI.
2. Start a server and open its URL:
   - With a checkout of the stepdeck repository (and Node) on that machine, run `node <repo>/cli/index.js serve <deck>` and open the `present:` URL.
   - With only the deck folder, run a static server from inside it, for example `python3 -m http.server 8000 --bind 127.0.0.1`, and open `http://127.0.0.1:8000/`.
3. If the machine has reduced motion on and you want motion, add `?motion=full`.
4. Press `F` for full screen and `S` for the presenter view.

PDF export is not available yet. To hand out the slides, share the `shots/` PNGs or the deck folder itself.

## See also

- [Quickstart](quickstart.md): make a deck, serve it, present it.
- [Animation and motion](animation-and-motion.md): when motion plays and why a jump and a played step match.
- [Checking a deck](checking-a-deck.md): `validate`, `check`, `shoot` and `dump`.
- [Runtime API](../reference/runtime-api.md): `boot()`, `window.STEPDECK`, query flags and the shells.
- [Troubleshooting](../troubleshooting.md): a deck that does not load, a check that fails.
