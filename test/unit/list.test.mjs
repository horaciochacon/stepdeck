// list: everything shown is derived from the props (pure functions, no DOM).
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveList } from "../../components/list/derive.js";
import { renderInline, renderBlock } from "../../core/inline.js";

const three = [{ text: "x" }, { text: "y" }, { text: "z" }];
const idsABC = [{ id: "a", text: "x" }, { id: "b", text: "y" }, { id: "c", text: "z" }];

test("letters run a, b, c", () => {
  assert.deepEqual(deriveList({ items: three, marker: "letter" }).items.map((i) => i.marker), ["a.", "b.", "c."]);
});

test("letters go on past z and stay latin", () => {
  const items = Array.from({ length: 28 }, (_, i) => ({ text: String(i) }));
  const markers = deriveList({ items, marker: "letter" }).items.map((i) => i.marker);
  assert.equal(markers[25], "z.");
  assert.equal(markers[26], "aa.");
  assert.equal(markers[27], "ab.");
});

test("numbers, bullets and check markers", () => {
  assert.deepEqual(deriveList({ items: three, marker: "number" }).items.map((i) => i.marker), ["1.", "2.", "3."]);
  assert.deepEqual(deriveList({ items: three, marker: "bullet" }).items.map((i) => i.marker), ["•", "•", "•"]);
  assert.deepEqual(deriveList({ items: three, marker: "check" }).items.map((i) => i.marker), ["", "", ""]);
});

test("id defaults to the index as a string; index and sub are carried", () => {
  const { items } = deriveList({ items: [{ text: "x", sub: "s" }, { id: "k", text: "y" }], marker: "number" });
  assert.deepEqual(items.map((i) => i.id), ["0", "k"]);
  assert.deepEqual(items.map((i) => i.index), [0, 1]);
  assert.deepEqual(items.map((i) => i.sub), ["s", undefined]);
  assert.deepEqual(items.map((i) => i.text), ["x", "y"]);
});

test("shown hides the tail", () => {
  assert.deepEqual(deriveList({ items: three, marker: "number", shown: 1 }).items.map((i) => i.visible), [true, false, false]);
  assert.deepEqual(deriveList({ items: three, marker: "number" }).items.map((i) => i.visible), [true, true, true]);
  assert.deepEqual(deriveList({ items: three, marker: "number", shown: 0 }).items.map((i) => i.visible), [false, false, false]);
  assert.deepEqual(deriveList({ items: three, marker: "number", shown: 9 }).items.map((i) => i.visible), [true, true, true]);
});

test("done by count and by id", () => {
  assert.deepEqual(deriveList({ items: three, marker: "check", done: 2 }).items.map((i) => i.done), [true, true, false]);
  assert.deepEqual(deriveList({ items: idsABC, marker: "check", done: ["c"] }).items.map((i) => i.done), [false, false, true]);
  assert.deepEqual(deriveList({ items: three, marker: "check" }).items.map((i) => i.done), [false, false, false]);
});

test("done only matters for check", () => {
  assert.deepEqual(deriveList({ items: three, marker: "number", done: 2 }).items.map((i) => i.done), [false, false, false]);
});

test("unknown done id throws naming it", () => {
  assert.throws(() => deriveList({ items: idsABC, marker: "check", done: ["zz"] }), /zz/);
});

test("active matches an index or an id; an unknown id throws naming it", () => {
  assert.deepEqual(deriveList({ items: three, marker: "bullet", active: 1 }).items.map((i) => i.active), [false, true, false]);
  assert.deepEqual(deriveList({ items: idsABC, marker: "bullet", active: "c" }).items.map((i) => i.active), [false, false, true]);
  assert.deepEqual(deriveList({ items: three, marker: "bullet" }).items.map((i) => i.active), [false, false, false]);
  assert.throws(() => deriveList({ items: idsABC, marker: "bullet", active: "nope" }), /nope/);
});

test("bad input throws a readable error", () => {
  assert.throws(() => deriveList({ marker: "number" }), /items/);
  assert.throws(() => deriveList({ items: [{ text: "x" }], marker: "roman" }), /roman/);
  assert.throws(() => deriveList({ items: [{ id: "a", text: "x" }, { id: "a", text: "y" }], marker: "number" }), /duplicate.*a/i);
  assert.throws(() => deriveList({ items: [{ sub: "x" }], marker: "number" }), /text/);
});

test("deriveList does not mutate its props", () => {
  const props = Object.freeze({ items: Object.freeze(three.map((i) => Object.freeze({ ...i }))), marker: "check", done: Object.freeze(["1"]) });
  assert.doesNotThrow(() => deriveList(props));
});

test("shared inline renderer: inline markdown without a block wrapper, html escaped, unsafe links dropped", () => {
  assert.equal(renderInline("a **b** `c`"), "a <strong>b</strong> <code>c</code>");
  assert.equal(renderInline("<script>x</script>"), "&lt;script&gt;x&lt;/script&gt;");
  assert.equal(renderInline("[x](javascript:alert(1))"), "x");
  assert.match(renderInline("[x](#ok)"), /^<a href="#ok">x<\/a>$/);
  assert.match(renderBlock("# t\n\n- a"), /<h1>t<\/h1>[\s\S]*<ul>/);
});
