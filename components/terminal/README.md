# terminal

A terminal window that replays a recorded agent session: a typed command, an activity log, a task
list and a file list. It carries no product names or logos; the title bar shows only the script's `title`.

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `script` | string | (required) | snap | JSON file relative to the deck root (shape below). |
| `shown` | integer >= 0 | (required) | fade | How many events are visible: events `0..shown-1`. Clamped to the event count. |
| `typing` | boolean | `false` | draw | Type the command character by character when it first appears in an animated step. |

Script shape. A complete script (save it as `data/session.json` in the deck; the deck made by `new` has none):

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

Events and what each one shows. **Every event is one log line**, task and file events included:

| `type` | Fields | Log line (marker, text) | Side panel |
|---|---|---|---|
| `note` | `text` | `note` + text | |
| `read` | `text` (a path) | `read` + text | |
| `run` | `text` (a command) | `run` + text | |
| `result` | `text` | `out` + text | |
| `error` | `text` | `error` + text | |
| `code` | `text`, optional `lang` | `code` + text | |
| `file` | `text` (the path), optional `status`: `created` or `edited` (default `edited`) | `file` + `<path> (<status>)` | Files list, in order of first appearance; the latest status wins |
| `task` | `index` (0-based into `tasks`), `status`: `pending`, `active` or `done` | `task` + `<task>: <status>` | Tasks list: `[ ]` pending, `[~]` active, `[x]` done |

- A task's status is the status of the **last shown** event naming it. A task no shown event names stays `[ ] pending`,
  so a session that should end with every box ticked needs a `done` event for every task, shown by the last step.
  A task can go straight to `done`; `active` first is optional.
- Task events cost log lines like any other; to keep the log about the work, emit task events only when a status changes.
- `shown: 0` is an empty terminal (prompt only, no command). It is a natural first step ("before the agent starts"),
  and `step0-shows-all` does not fire, since `shown` differs at the last step. Start at `shown > 0` to open on activity.

Behaviour:
- **Driven by props only.** The component never reads the slide's step. A slide sets `shown` per step with `advance`:
  `advance: { prop: "shown", values: [0, 4, 9, 22], start: "start" }` (one value per step from `start`; the last holds).
- **Derived state.** Task statuses (the last event naming a task wins; untouched tasks are `pending`) and the
  file list (in order of first appearance, the latest status wins) come from events `0..shown-1`. So a task done in
  the 7th event (array index 6) is done at `shown=9` and pending at `shown=4`.
- **Scroll window.** The log shows only the newest `min(shown, N)` lines, where N is how many lines fit its box,
  measured in canvas pixels at every update (`data-capacity` on `.sd-terminal`). Older lines leave the DOM.
  Lines are one row each (no wrapping; long text is cut with an ellipsis), so keep event text short.
- **Command line.** Empty prompt while `shown` is 0; the command appears once `shown > 0`. With `typing: true` it is
  typed out only in an animated step that takes `shown` from 0 to above 0; if the slide opens with `shown > 0`, or the step
  is jumped to, the command simply appears.
- **Idempotent.** Every `update` ends by writing the state straight from props. With `info.animate` and `shown`
  increasing, it first types the command (if `typing` and the session just started) and staggers the new lines in
  (`ctx.animate.stagger`); all motion is bound to `info.signal`, so an aborted step snaps to its end state.
  Backward moves and jumps render directly.
- All text is at least `--sd-min-audience-font`; colors and fonts come from theme tokens. The script is a shared
  cached value and is never mutated.

See `example.js` for a slide that uses it.
