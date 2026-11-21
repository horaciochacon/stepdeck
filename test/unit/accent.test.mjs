// Accent phrase in titles and the section kicker element:
// core/accent.js, the fold's title and kicker defaults, and bindings that cannot create an accent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateAt, initialElements, stepCount } from "#engine/core/fold.js";
import { placedSlide } from "#engine/core/layout.js";

// Dynamic import: before core/accent.js exists each test fails on its own instead of the whole file.
const accent = await import("#engine/core/accent.js").catch(() => ({}));
const bindings = await import("#engine/core/bindings.js");
const call = (name, ...args) => {
  assert.equal(typeof accent[name], "function", `core/accent.js exports ${name}`);
  return accent[name](...args);
};

test("parseAccent: one accent phrase", () => {
  assert.deepEqual(call("parseAccent", "Response by *dose and regimen*"), [
    { text: "Response by ", accent: false },
    { text: "dose and regimen", accent: true },
  ]);
});

test("parseAccent: text after the phrase, and two phrases", () => {
  assert.deepEqual(call("parseAccent", "a *b* c *d*"), [
    { text: "a ", accent: false },
    { text: "b", accent: true },
    { text: " c ", accent: false },
    { text: "d", accent: true },
  ]);
});

test("parseAccent: an unmatched * gives one non-accent part that keeps the *", () => {
  assert.deepEqual(call("parseAccent", "p < 0.05 * n"), [{ text: "p < 0.05 * n", accent: false }]);
  assert.deepEqual(call("parseAccent", "a *b* c *d"), [
    { text: "a ", accent: false },
    { text: "b", accent: true },
    { text: " c *d", accent: false },
  ]);
});

test("parseAccent: \\* is a literal asterisk, \\\\ a literal backslash; a lone backslash stays", () => {
  assert.deepEqual(call("parseAccent", "a \\*b\\* c"), [{ text: "a *b* c", accent: false }]);
  assert.deepEqual(call("parseAccent", "C:\\dir \\\\*x*"), [
    { text: "C:\\dir \\", accent: false },
    { text: "x", accent: true },
  ]);
  assert.deepEqual(call("parseAccent", ""), []);
  assert.deepEqual(call("parseAccent", "plain"), [{ text: "plain", accent: false }]);
});

test("parseAccent: an empty phrase ** stays as written (\"Use **bold** here\" is not \"Use bold here\")", () => {
  assert.deepEqual(call("parseAccent", "Use **bold** here"), [{ text: "Use **bold** here", accent: false }]);
  assert.deepEqual(call("parseAccent", "*a**b*"), [{ text: "ab", accent: true }], "two phrases that touch are not an empty one");
  assert.equal(call("stripAccent", "a ** b *c*"), "a ** b c");
});

test("accentMarks: unescaped stars, and empty phrases as parseAccent reads them", () => {
  assert.deepEqual(call("accentMarks", "Use **bold** here"), { stars: 4, empty: true });
  assert.deepEqual(call("accentMarks", "*a* *b*"), { stars: 4, empty: false });
  assert.deepEqual(call("accentMarks", "*a**b*"), { stars: 4, empty: false }, "a phrase closing next to the next opener is not empty");
  assert.deepEqual(call("accentMarks", "\\*\\* and *x"), { stars: 1, empty: false });
});

test("stripAccent: the plain text, without the asterisks", () => {
  assert.equal(call("stripAccent", "a *b* \\*c"), "a b *c");
  assert.equal(call("stripAccent", "Response by *dose and regimen*."), "Response by dose and regimen.");
  assert.equal(call("stripAccent", "p < 0.05 * n"), "p < 0.05 * n");
});

test("escapeAccent round-trips through parseAccent as plain text", () => {
  for (const s of ["*boom*", "x\\", "a\\*b", "**", "plain"]) {
    assert.deepEqual(call("parseAccent", call("escapeAccent", s)), [{ text: s, accent: false }], s);
  }
});

test("fold: the title sugar sets accent: true; an explicit text title gets it unless its props say otherwise", () => {
  const sugar = initialElements({ id: "s", title: "A *b*", elements: [] });
  assert.deepEqual(sugar[0].props, { text: "A *b*", accent: true });

  const explicitDef = { id: "title", type: "text", region: "title", props: { text: "X *y*" } };
  const explicit = { id: "s", elements: [explicitDef] };
  assert.equal(stateAt(explicit, 0).elements.title.props.accent, true);
  assert.deepEqual(explicitDef.props, { text: "X *y*" }, "the author's definition is not mutated");

  const off = { id: "s", elements: [{ id: "title", type: "text", region: "title", props: { text: "X *y*", accent: false } }] };
  assert.equal(stateAt(off, 0).elements.title.props.accent, false);

  const md = { id: "s", elements: [{ id: "title", type: "markdown", region: "title", props: { md: "X *y*" } }] };
  assert.equal("accent" in stateAt(md, 0).elements.title.props, false, "a markdown title keeps markdown emphasis");
});

test("fold: a replace on the title keeps the accent default (jump and play agree)", () => {
  const s = { id: "s", title: "One *a*", elements: [], steps: [{}, { replace: { title: { text: "Two *b*" } } }] };
  assert.deepEqual(stateAt(s, 1).elements.title.props, { text: "Two *b*", accent: true });
});

test("fold: section becomes the kicker element, before the title, in the title region", () => {
  const s = { id: "s", section: "Methods", title: "T", elements: [{ id: "b", type: "text", props: { text: "x" } }] };
  const defs = initialElements(s);
  assert.deepEqual(defs.map((d) => d.id), ["kicker", "title", "b"]);
  assert.deepEqual(defs[0], { id: "kicker", type: "text", region: "title", props: { text: "Methods" } });
  assert.deepEqual(stateAt(s, 0).elements.kicker.props, { text: "Methods" });

  const noTitle = initialElements({ id: "s", section: "Methods", elements: [] });
  assert.deepEqual(noTitle.map((d) => d.id), ["kicker"], "a slide with a section and no title still gets the kicker");
  assert.deepEqual(initialElements({ id: "s", title: "T", elements: [] }).map((d) => d.id), ["title"], "no section, no kicker");
});

test("bindings: a bound value cannot create an accent in an accent text, whole or embedded", async () => {
  assert.equal(typeof bindings.resolveElementProps, "function", "core/bindings.js exports resolveElementProps");
  const files = { "d.json": { star: "*boom*", slash: "x\\", n: 3 } };
  const load = async (p) => files[p];
  const fmt = () => (v) => String(v);
  const text = async (t, extra = {}) => (await bindings.resolveElementProps("text", { text: t, accent: true, ...extra }, load, fmt)).text;

  assert.deepEqual(call("parseAccent", await text("Rate {{d.json#/star}} *up*")), [
    { text: "Rate *boom* ", accent: false },
    { text: "up", accent: true },
  ]);
  assert.deepEqual(call("parseAccent", await text("{{d.json#/slash}}*up*")), [
    { text: "x\\", accent: false },
    { text: "up", accent: true },
  ]);
  assert.deepEqual(call("parseAccent", await text("{{d.json#/star}}")), [{ text: "*boom*", accent: false }], "a whole-string binding");
  assert.deepEqual(call("parseAccent", await text("*n = {{d.json#/n}}*")), [{ text: "n = 3", accent: true }], "a binding inside the phrase");
  // Not an accent text: bindings resolve as before.
  assert.equal((await bindings.resolveElementProps("text", { text: "{{d.json#/star}}" }, load, fmt)).text, "*boom*");
  assert.equal((await bindings.resolveElementProps("markdown", { md: "{{d.json#/star}}", accent: true }, load, fmt)).md, "*boom*");
});

test("placedSlide: a layout without a title region drops the kicker and every step patch that names it", () => {
  const slide = {
    id: "s", layout: "main-only", section: "Methods",
    elements: [{ id: "lead", type: "text", props: { text: "Body." } }],
    steps: [
      { id: "a" },
      { id: "b", set: { kicker: { text: "Later" }, lead: { text: "More." } } },
      { id: "c", replace: { kicker: { text: "R" } }, hide: ["kicker", "lead"] },
      { id: "d", only: { kicker: { text: "O" } }, show: ["kicker", "lead"] },
    ],
  };
  const before = structuredClone(slide);
  const { section, ...noSection } = slide;
  assert.throws(() => stateAt(noSection, "b"), /unknown element 'kicker'/, "control: dropping section alone breaks the step");
  const placed = placedSlide(slide, ["main"]);
  for (let k = 0; k < stepCount(placed); k++) {
    const st = stateAt(placed, k);
    assert.deepEqual(Object.keys(st.elements), ["lead"], `step ${k}`);
  }
  assert.equal(stateAt(placed, "b").elements.lead.props.text, "More.");
  assert.equal(stateAt(placed, "c").elements.lead.visible, false);
  assert.equal(stateAt(placed, "d").elements.lead.visible, true);
  assert.deepEqual(placed.steps.map((s) => s.id), ["a", "b", "c", "d"]);
  assert.deepEqual(slide, before, "the slide is not mutated");
  assert.equal(placedSlide(slide, ["title", "main"]), slide, "a layout with a title region keeps the slide as it is");
});
