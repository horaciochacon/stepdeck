// chat: everything shown is derived from the props (pure functions, no DOM).
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveChat } from "../../components/chat/derive.js";

const three = [{ role: "user", text: "a" }, { role: "agent", text: "b" }, { role: "note", text: "c" }];

test("style defaults to bubbles; every message is visible when shown is absent", () => {
  const d = deriveChat({ messages: three });
  assert.equal(d.style, "bubbles");
  assert.deepEqual(d.messages.map((m) => m.visible), [true, true, true]);
  assert.equal(d.newest, 2);
});

test("shown hides the later messages and names the newest visible one", () => {
  assert.deepEqual(deriveChat({ messages: three, shown: 1 }).messages.map((m) => m.visible), [true, false, false]);
  assert.equal(deriveChat({ messages: three, shown: 2 }).newest, 1);
  assert.equal(deriveChat({ messages: three, shown: 0 }).newest, -1);
  assert.equal(deriveChat({ messages: three, shown: 99 }).newest, 2, "clamped to the message count");
});

test("label, role and text are carried; the label is optional", () => {
  const { messages } = deriveChat({ messages: [{ role: "user", label: "Tú", text: "hola" }, { role: "agent", text: "x" }], style: "card" });
  assert.deepEqual(messages.map((m) => [m.index, m.role, m.label ?? null, m.text]), [[0, "user", "Tú", "hola"], [1, "agent", null, "x"]]);
});

test("bad props throw an error naming the problem", () => {
  assert.throws(() => deriveChat({}), /messages/);
  assert.throws(() => deriveChat({ messages: [] }), /messages/);
  assert.throws(() => deriveChat({ messages: [{ role: "robot", text: "x" }] }), /robot/);
  assert.throws(() => deriveChat({ messages: [{ role: "user" }] }), /text/);
  assert.throws(() => deriveChat({ messages: three, style: "fancy" }), /fancy/);
  assert.throws(() => deriveChat({ messages: three, shown: -1 }), /shown/);
  assert.throws(() => deriveChat({ messages: three, shown: 1.5 }), /shown/);
});
