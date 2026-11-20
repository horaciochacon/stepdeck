// terminal: everything shown is derived from the script and `shown` (pure functions, no DOM).
import { test } from "node:test";
import assert from "node:assert/strict";
import { clampShown, deriveTasks, deriveFiles, windowOf, lineText, checkScript } from "../../components/terminal/derive.js";

const script = Object.freeze({
  title: "t",
  command: "run",
  tasks: Object.freeze(["load", "summarize"]),
  events: Object.freeze([
    { type: "note", text: "plan" },
    { type: "task", index: 0, status: "active" },
    { type: "file", text: "src/a.py", status: "created" },
    { type: "task", index: 0, status: "done" },
    { type: "file", text: "src/b.py" },
    { type: "file", text: "src/a.py", status: "edited" },
  ].map((e) => Object.freeze(e))),
});

test("clampShown floors, clamps to the event count and treats junk as 0", () => {
  assert.equal(clampShown(3, 6), 3);
  assert.equal(clampShown(99, 6), 6);
  assert.equal(clampShown(-2, 6), 0);
  assert.equal(clampShown(2.9, 6), 2);
  assert.equal(clampShown(undefined, 6), 0);
  assert.equal(clampShown("x", 6), 0);
});

test("task statuses derive from events 0..shown-1 (index is 0-based into tasks)", () => {
  assert.deepEqual(deriveTasks(script, 0).map((t) => t.status), ["pending", "pending"]);
  assert.deepEqual(deriveTasks(script, 1).map((t) => t.status), ["pending", "pending"]);
  assert.deepEqual(deriveTasks(script, 2).map((t) => t.status), ["active", "pending"]);
  assert.deepEqual(deriveTasks(script, 4).map((t) => t.status), ["done", "pending"]);
  assert.deepEqual(deriveTasks(script, 4).map((t) => t.text), ["load", "summarize"]);
});

test("files derive in order of first appearance, latest status wins, no status means edited", () => {
  assert.deepEqual(deriveFiles(script, 2), []);
  assert.deepEqual(deriveFiles(script, 3), [{ path: "src/a.py", status: "created" }]);
  assert.deepEqual(deriveFiles(script, 5), [{ path: "src/a.py", status: "created" }, { path: "src/b.py", status: "edited" }]);
  assert.deepEqual(deriveFiles(script, 6), [{ path: "src/a.py", status: "edited" }, { path: "src/b.py", status: "edited" }]);
});

test("derivation never mutates the (shared, frozen) script", () => {
  deriveTasks(script, 6);
  deriveFiles(script, 6);
  windowOf(script, 6, 3);
  assert.equal(script.events.length, 6);
});

test("windowOf keeps the newest min(shown, capacity) events, with their indexes", () => {
  assert.deepEqual(windowOf(script, 4, 10).map((l) => l.i), [0, 1, 2, 3]);
  assert.deepEqual(windowOf(script, 6, 4).map((l) => l.i), [2, 3, 4, 5]);
  assert.deepEqual(windowOf(script, 6, 0), []);
  assert.deepEqual(windowOf(script, 0, 4), []);
});

test("lineText: text, or derived from the task and file events", () => {
  assert.equal(lineText(script, script.events[0]), "plan");
  assert.equal(lineText(script, script.events[1]), "load: active");
  assert.equal(lineText(script, script.events[2]), "src/a.py (created)");
  assert.equal(lineText(script, script.events[4]), "src/b.py (edited)");
});

test("checkScript names the problem", () => {
  assert.throws(() => checkScript(null, "d/s.json"), /d\/s\.json/);
  assert.throws(() => checkScript({ command: "x", tasks: [], events: "no" }, "s.json"), /events/);
  assert.throws(() => checkScript({ command: "x", tasks: [], events: [{ type: "bogus" }] }, "s.json"), /event 0.*bogus/);
  assert.throws(() => checkScript({ command: "x", tasks: ["a"], events: [{ type: "task", index: 3, status: "done" }] }, "s.json"), /event 0.*task index 3/);
  assert.throws(() => checkScript({ command: "x", tasks: ["a"], events: [{ type: "task", index: 0, status: "nope" }] }, "s.json"), /status/);
  assert.doesNotThrow(() => checkScript(script, "s.json"));
});
