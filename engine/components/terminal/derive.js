// terminal: pure derivation from the script and `shown` (no DOM). The script is a shared cached
// value: nothing here mutates it; every result is a new structure.

export const EVENT_TYPES = ["read", "run", "result", "note", "error", "code", "file", "task"];
export const TASK_STATUSES = ["pending", "active", "done"];
export const FILE_STATUSES = ["created", "edited"];

/** Validates the script's shape; throws an error that names the file and the event. */
export function checkScript(script, where) {
  const bad = (msg) => {
    throw new Error(`${where}: ${msg}`);
  };
  if (script === null || typeof script !== "object" || Array.isArray(script)) bad("not a terminal script (expected an object { title, command, tasks, events })");
  if (script.command != null && typeof script.command !== "string") bad("`command` must be a string");
  if (script.title != null && typeof script.title !== "string") bad("`title` must be a string");
  const tasks = script.tasks ?? [];
  if (!Array.isArray(tasks) || tasks.some((t) => typeof t !== "string")) bad("`tasks` must be an array of strings");
  if (!Array.isArray(script.events)) bad("`events` must be an array");
  script.events.forEach((e, i) => {
    if (e === null || typeof e !== "object") bad(`event ${i} is not an object`);
    if (!EVENT_TYPES.includes(e.type)) bad(`event ${i} has unknown type '${e.type}' (use ${EVENT_TYPES.join(", ")})`);
    if (e.type === "task") {
      if (!Number.isInteger(e.index) || e.index < 0 || e.index >= tasks.length) bad(`event ${i}: task index ${e.index} is not in 0..${tasks.length - 1}`);
      if (!TASK_STATUSES.includes(e.status)) bad(`event ${i}: task status '${e.status}' is not one of ${TASK_STATUSES.join(", ")}`);
    } else if (e.type === "file") {
      if (typeof e.text !== "string" || e.text === "") bad(`event ${i}: a file event needs its path in \`text\``);
      if (e.status != null && !FILE_STATUSES.includes(e.status)) bad(`event ${i}: file status '${e.status}' is not one of ${FILE_STATUSES.join(", ")}`);
    } else if (e.text != null && typeof e.text !== "string") bad(`event ${i}: \`text\` must be a string`);
  });
  return script;
}

/** `shown` as an integer in 0..count; anything else is 0. */
export function clampShown(shown, count) {
  const n = Math.floor(Number(shown));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, count);
}

/** Task rows from events 0..shown-1 (task `index` is 0-based into `tasks`); the last status wins. */
export function deriveTasks(script, shown) {
  const rows = (script.tasks ?? []).map((text) => ({ text, status: "pending" }));
  for (const e of script.events.slice(0, shown)) if (e.type === "task" && rows[e.index]) rows[e.index].status = e.status;
  return rows;
}

/** Files from events 0..shown-1: in order of first appearance, the latest status wins (none: edited). */
export function deriveFiles(script, shown) {
  const byPath = new Map();
  for (const e of script.events.slice(0, shown)) {
    if (e.type !== "file") continue;
    const row = byPath.get(e.text) ?? { path: e.text, status: "edited" };
    row.status = e.status ?? "edited";
    byPath.set(e.text, row);
  }
  return [...byPath.values()];
}

/** The newest min(shown, capacity) events, each with its index in the script. */
export function windowOf(script, shown, capacity) {
  const cap = Math.max(0, Math.floor(capacity) || 0);
  const from = Math.max(0, shown - cap);
  return script.events.slice(from, shown).map((event, k) => ({ i: from + k, event }));
}

/** The text a log line shows: the event's `text`, or one derived from a task or file event. */
export function lineText(script, event) {
  if (event.type === "task") return `${script.tasks?.[event.index] ?? `task ${event.index}`}: ${event.status}`;
  if (event.type === "file") return `${event.text} (${event.status ?? "edited"})`;
  return event.text == null ? "" : String(event.text);
}
