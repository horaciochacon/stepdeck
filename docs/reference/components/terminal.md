# terminal

`terminal` replays a recorded agent session in a terminal window: a command line, an activity log, a task list and a file list. The session lives in a JSON script; the slide only says how many of its events are visible at each step. This page lists every prop, the script format, what each event shows, how the component animates, and the errors it reports. It is for anyone writing slides by hand or reviewing what an agent wrote.

Sources: [`components/terminal/schema.json`](../../../engine/components/terminal/schema.json), [`components/terminal/index.js`](../../../engine/components/terminal/index.js), [`components/terminal/derive.js`](../../../engine/components/terminal/derive.js), [`core/animate.js`](../../../engine/core/animate.js), [`core/stepdeck.css`](../../../engine/core/stepdeck.css). For the other components, see the [components reference](index.md).

## Use it

The terminal slide of the spike example (`examples/spike/slides/terminal.js`). `advance` sets `shown` once per step, so the slide never patches the terminal itself:

```js
export default {
  id: "terminal",
  section: "Agents",
  layout: "full-bleed",
  title: "An agent works through a task",
  elements: [
    { id: "term", region: "main", type: "terminal",
      props: { script: "data/session.json", shown: 0, typing: true },
      advance: { prop: "shown", values: [0, 4, 9, 14, 18, 22], start: "open" } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic agent session." } },
  ],
  steps: [
    { id: "open" },
    { id: "inspect" },
    { id: "summarize" },
    { id: "fix" },
    { id: "report" },
    { id: "done" },
  ],
  seconds: 90,
};
```

Step `open` shows an empty prompt. Step `inspect` shows the command and the first 4 events, and so on up to all 22 at `done`. The script is `examples/spike/data/session.json`. A deck made by `stepdeck new` has no session script; copy that one or the shorter one under [Script format](#script-format) into `data/`.

`advance` is described in the [step model guide](../../guide/step-model.md).

## Props

| Prop | Type | Required | Default | Transition | Meaning |
| --- | --- | --- | --- | --- | --- |
| `script` | string | yes | | snap | Path to the session's JSON file, relative to the deck root, for example `data/session.json`. |
| `shown` | integer >= 0 | yes | | fade | How many events are visible: events `0` to `shown - 1`. `0` is an empty prompt. |
| `typing` | boolean | no | `false` | draw | Type the command character by character the first time it appears in an animated step. Otherwise it appears whole. |

The schema has `additionalProperties: false`, so any other prop is a `validate` error (`unknown-prop`). A non-integer or negative `shown`, or a non-boolean `typing`, is `prop-invalid`.

### How `shown` is read

At runtime the component turns `shown` into a whole number from 0 to the number of events:

- it is floored (`Math.floor(Number(shown))`);
- a value above the event count is clamped to the event count, so `shown: 999` shows every event;
- a negative or non-numeric value counts as 0.

`validate` rejects the non-integer and negative cases through the schema, so the floor and the `0` fallback only matter for a deck that skips `validate`. Clamping is the useful one: the last `advance` value may be larger than the script.

## Script format

The script is a JSON object:

```json
{
  "title": "Agent session",
  "command": "assistant \"summarize survey.csv\"",
  "tasks": ["Check the data", "Summarize", "Write the report"],
  "events": [
    { "type": "note", "text": "Goal: a short summary of the survey." },
    { "type": "task", "index": 0, "status": "active" },
    { "type": "read", "text": "data/survey.csv" },
    { "type": "result", "text": "1,204 rows, 12 columns" },
    { "type": "task", "index": 0, "status": "done" },
    { "type": "run", "text": "python summarize.py" },
    { "type": "file", "text": "report.md", "status": "created" },
    { "type": "task", "index": 1, "status": "done" },
    { "type": "task", "index": 2, "status": "done" }
  ]
}
```

| Key | Type | Required | Shown as |
| --- | --- | --- | --- |
| `title` | string | no | The title bar. Without it the bar is empty. |
| `command` | string | no | The command line after the `$` prompt, once `shown` is above 0. |
| `tasks` | string array | no (default `[]`) | The Tasks list in the side panel, one row per task. |
| `events` | array | yes | The log, one line per event. Task and file events also drive the side panel. |

### Event types

**Every event is one log line**, task and file events included. The marker is the event type, except `result`, whose marker is `out`.

| `type` | Fields | Log line (marker, text) | Side panel |
| --- | --- | --- | --- |
| `read` | `text` (a path) | `read` + text | |
| `run` | `text` (a command) | `run` + text | |
| `result` | `text` | `out` + text | |
| `note` | `text` | `note` + text | |
| `error` | `text` | `error` + text | |
| `code` | `text`, optional `lang` | `code` + text | |
| `file` | `text` (the path, required), optional `status`: `created` or `edited` (default `edited`) | `file` + `<path> (<status>)` | Files list |
| `task` | `index` (0-based into `tasks`), `status`: `pending`, `active` or `done` | `task` + `<task text>: <status>` | Tasks list |

- `text` is optional on `read`, `run`, `result`, `note`, `error` and `code`; a missing `text` gives a line with only the marker. When present it must be a string.
- `lang` on a `code` event is written to the line as `data-lang`. It is not shown and does not highlight anything.
- Other keys on an event are ignored.

### Tasks and files

Both lists are derived from events `0` to `shown - 1`:

- **Tasks.** Each task starts `pending`. The last shown `task` event that names it sets its status. A task no shown event names stays pending. Markers: `[ ]` pending, `[~]` active, `[x]` done. A task can go straight to `done`; `active` first is optional.
- **Files.** One row per path, in order of first appearance. The latest shown status wins; a `file` event with no `status` counts as `edited`.

The headings are localized from the deck's `lang`: `Tasks` and `Files` in English, `Tareas` and `Archivos` in Spanish.

So in the spike script, task 0 turns done at the 7th event (array index 6): it is done at `shown: 9` and still pending at `shown: 4`. To end with every box ticked, the script needs a `done` event for every task, and the last step must show it.

## Layout

- **It fills its region.** `core/stepdeck.css` gives every terminal element `flex: 1 1 0`, so it takes the free height of its region in any layout, `full-bleed` included. Other elements in the same region (the source line above) keep their natural height. `chart.line`, `chart.bar`, `diagram` and `image` do the same; see the [Fill rules](../layouts.md#fill-rules) table.
- **The log is a scroll window.** It shows the newest `min(shown, N)` events, where N is how many lines fit the log box. Older lines leave the DOM. N is measured in canvas pixels at mount and at every update, and written to `data-capacity` on `.sd-terminal`.
- **One row per line.** Log lines and the command never wrap; long text is cut with an ellipsis. Keep event text short.
- **Sizes.** All text in the window uses `--sd-font-size-label` (28px in `academic-light`). Log lines and the command use `--sd-font-mono`. The side panel is 520px wide. Colors come from theme tokens: the prompt and the `run`, `code` and `file` markers are accent, `error` lines are alert, `read`, `note` and `task` text is muted.

In the spike deck at 1920x1080 the terminal element measures 1728x730 px (from `stepdeck dump`).

## Markup

Inside its element wrapper (`div.sd-el[data-el][data-type="terminal"]`):

```html
<div class="sd-terminal" data-shown="9" data-capacity="15">
  <div class="sd-terminal-bar"><span class="sd-terminal-title">Agent session</span></div>
  <div class="sd-terminal-body">
    <div class="sd-terminal-main">
      <div class="sd-terminal-commandline">
        <span class="sd-terminal-prompt">$</span><span class="sd-terminal-command">assistant "…"</span>
      </div>
      <div class="sd-terminal-log">
        <div class="sd-terminal-line" data-type="result" data-i="5">
          <span class="sd-terminal-marker">out</span><span class="sd-terminal-text">1205 data/survey.csv …</span>
        </div>
        <!-- one div.sd-terminal-line per visible event; data-lang on code events -->
      </div>
    </div>
    <aside class="sd-terminal-side">
      <h3 class="sd-terminal-heading">Tasks</h3>
      <ul class="sd-terminal-tasks">
        <li class="sd-terminal-task" data-task="0" data-status="done">
          <span class="sd-terminal-task-mark">[x]</span><span class="sd-terminal-task-text">Check the data</span>
        </li>
      </ul>
      <h3 class="sd-terminal-heading">Files</h3>
      <ul class="sd-terminal-files">
        <li class="sd-terminal-file" data-status="created">
          <span class="sd-terminal-file-path">src/summarize.py</span><span class="sd-terminal-file-status">created</span>
        </li>
      </ul>
    </aside>
  </div>
</div>
```

`data-i` is the event's index in the script. All text is set with `textContent`, so Markdown and HTML in a script are shown as typed. The `data-capacity` value depends on the region size and theme.

## Motion

The engine animates an update only when you move forward by exactly one step, in a live presentation with motion on. Within such a step, the terminal moves only when `shown` grew:

1. **Typing.** When `typing` is true, the previous `shown` was 0 and the script has a non-empty `command`, the command is typed character by character at 28 ms per character, capped at 1400 ms in total. This speed is fixed: it ignores the step's `transition.duration`, even `0`.
2. **New lines.** The log lines whose events are new in this step fade in, one after the other, 60 ms apart. Each fade lasts the step's `transition.duration` when set, else the theme's `--sd-duration` (400 ms in `academic-light`). With a duration of 0 they appear at once. The new lines stay hidden while the command types.

The title, the task list and the file list change at once, without motion.

Every other move renders the target state directly: a jump, a backward move, the first render, an update where `shown` did not grow, and capture mode (`shoot`, `check`). If the slide opens with `shown` above 0, or you jump to a step, the command simply appears. All motion is bound to the step's abort signal, so a step interrupted by the next keypress snaps to its end state. After every update no inline style is left, so a played step and a jumped step end with the same markup; `check --played` verifies this. See [Animation and motion](../../guide/animation-and-motion.md).

`shown: 0` is a natural first step ("before the agent starts"). It also keeps `step0-shows-all` quiet, since `shown` differs at the last step.

## Errors

The component checks the script at mount and at every update. A failure becomes an element error, shown on the slide and listed in `STEPDECK.errors` as `<slide>/<element>: <message>`. After the first error the element gets no further updates.

Every script message is prefixed with the script path, for example `data/session.json: event 3 is not an object`.

| Message | Cause |
| --- | --- |
| `terminal needs a \`script\` path` | `script` is missing, empty or not a string (no path prefix). |
| `<path>: not a terminal script (expected an object { title, command, tasks, events })` | The file's top level is not a JSON object (an array, a string, `null`). |
| `<path>: \`command\` must be a string` | `command` is present and not a string. |
| `<path>: \`title\` must be a string` | `title` is present and not a string. |
| `<path>: \`tasks\` must be an array of strings` | `tasks` is not an array, or holds a non-string. |
| `<path>: \`events\` must be an array` | `events` is missing or not an array. |
| `<path>: event <i> is not an object` | Event `i` is `null` or a primitive. |
| `<path>: event <i> has unknown type '<t>' (use read, run, result, note, error, code, file, task)` | `type` is missing or not one of the eight. |
| `<path>: event <i>: task index <n> is not in 0..<len-1>` | A task `index` that is not an integer from 0 to `tasks.length - 1`. With no tasks the range reads `0..-1`. |
| `<path>: event <i>: task status '<s>' is not one of pending, active, done` | A task event without a valid `status`. |
| `<path>: event <i>: a file event needs its path in \`text\`` | A file event whose `text` is missing, empty or not a string. |
| `<path>: event <i>: file status '<s>' is not one of created, edited` | A file event with any other `status`. |
| `<path>: event <i>: \`text\` must be a string` | Any other event with a non-string `text`. |

Loading the file can fail first, with the data loader's messages: `data file not found: <path>` when the file is missing, `invalid data file <path>: <message>` when it is not valid JSON.

### Which command catches what

`validate` checks the props and that the file exists. It does not open the script:

```text
bad/term · file-missing · script = data/nope.json vs a file in the deck · create data/nope.json in the deck (generate data with a script under data/), or fix the path in script
```

Script errors show up when the slide renders, so run `check` too. It reports them as `render-error`:

```text
bad/0 · render-error · bad/term: data/bad.json: event 0: task index 3 is not in 0..0 vs no errors · fix the error shown on the slide, then run check again
```

Both lines come from a scratch deck. See [Checking a deck](../../guide/checking-a-deck.md) and the [CLI reference](../cli.md) for every rule.

## Gotchas

**Task events cost log lines.** A task event is one log line like any other. To keep the log about the work, emit task events only when a status changes.

**The log shows only what fits.** With a short region, early events scroll out of the log before the audience reads them. Check the slide with `stepdeck shoot` or in the browser; `data-capacity` tells you how many lines fit.

**`typing` only types once.** The command types only in the animated step that takes `shown` from 0 to above 0. A slide that starts above 0 never types. Moving back to `shown: 0` and forward again types it again.

## For agents

The agent-facing summary of this component is in [`skill/references/components.md`](../../../skill/references/components.md). `node cli/index.js catalog terminal --json` prints the props from the schema plus the component README, which has a complete script.
