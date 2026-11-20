import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBinding, resolveBindings, lookupPointer } from "#engine/core/bindings.js";
import { makeFormat } from "#engine/core/format.js";

const docs = {
  "data/x.json": { a: { b: [10, 20, { c: "deep" }] }, "k/l": 1, "m~n": 2, n: 12000, name: "Springfield", ok: true, nil: null },
  "d.json": { n: 12000 },
  "data/t.csv": [{ year: 2020, v: 1.5 }],
};
const load = async (path) => {
  if (!(path in docs)) throw new Error(`data file not found: ${path}`);
  return docs[path];
};
const fmt = makeFormat("en");

// ---------- parseBinding ----------

test("parseBinding parses path, pointer and optional format", () => {
  assert.deepEqual(parseBinding("{{data/x.json#/a/b | ,.0f}}"), {
    path: "data/x.json",
    pointer: "/a/b",
    format: ",.0f",
  });
  assert.deepEqual(parseBinding("{{data/x.json#/a/b}}"), { path: "data/x.json", pointer: "/a/b", format: null });
});

test("parseBinding trims whitespace around the pipe and inside braces", () => {
  const want = { path: "d.json", pointer: "/n", format: ",.0f" };
  assert.deepEqual(parseBinding("{{d.json#/n|,.0f}}"), want);
  assert.deepEqual(parseBinding("{{ d.json#/n   |   ,.0f }}"), want);
});

test("parseBinding allows an empty pointer (whole document)", () => {
  assert.deepEqual(parseBinding("{{data/t.csv#}}"), { path: "data/t.csv", pointer: "", format: null });
});

test("parseBinding returns null for non-bindings and for {{color:...}}", () => {
  assert.equal(parseBinding("plain text"), null);
  assert.equal(parseBinding("{{color:accent}}"), null);
  assert.equal(parseBinding("{{no-hash-here}}"), null);
  assert.equal(parseBinding("Total {{d.json#/n}} people"), null, "embedded is not a whole-string binding");
  assert.equal(parseBinding("{{a.json#/x}} and {{b.json#/y}}"), null);
  assert.equal(parseBinding(" {{d.json#/n}} "), null, "outer whitespace makes it text");
  assert.equal(parseBinding(42), null);
  assert.equal(parseBinding(undefined), null);
});

// ---------- lookupPointer ----------

test("lookupPointer follows RFC 6901 including escapes and array indexes", () => {
  const d = docs["data/x.json"];
  assert.deepEqual(lookupPointer(d, "/a/b/1"), { found: true, value: 20 });
  assert.deepEqual(lookupPointer(d, "/a/b/2/c"), { found: true, value: "deep" });
  assert.deepEqual(lookupPointer(d, "/k~1l"), { found: true, value: 1 });
  assert.deepEqual(lookupPointer(d, "/m~0n"), { found: true, value: 2 });
  assert.deepEqual(lookupPointer(d, "/nil"), { found: true, value: null });
  assert.equal(lookupPointer(d, "").value, d);
  assert.equal(lookupPointer(d, "/a/b/9").found, false);
  assert.equal(lookupPointer(d, "/a/b/01").found, false);
  assert.equal(lookupPointer(d, "/a/b/-").found, false);
  assert.equal(lookupPointer(d, "/zzz").found, false);
  assert.equal(lookupPointer(d, "/n/deeper").found, false);
});

test("lookupPointer never reads inherited properties", () => {
  assert.equal(lookupPointer({}, "/constructor").found, false);
  assert.equal(lookupPointer({}, "/__proto__").found, false);
  assert.equal(lookupPointer([], "/length").found, false);
});

test("lookupPointer rejects malformed pointers", () => {
  assert.throws(() => lookupPointer({}, "a/b"), /invalid JSON pointer/);
  assert.throws(() => lookupPointer({}, "/a~2"), /invalid JSON pointer/);
});

// ---------- resolveBindings ----------

test("binding resolves pointer", async () => {
  const out = await resolveBindings({ value: "{{data/x.json#/a/b/1}}" }, load, fmt);
  assert.deepEqual(out, { value: 20 });
});

test("a whole-string binding without format returns the raw value (number, array, object, null)", async () => {
  const out = await resolveBindings(
    { n: "{{data/x.json#/n}}", arr: "{{data/x.json#/a/b}}", obj: "{{data/x.json#/a}}", nil: "{{data/x.json#/nil}}" },
    load,
    fmt,
  );
  assert.equal(out.n, 12000);
  assert.strictEqual(out.arr, docs["data/x.json"].a.b);
  assert.strictEqual(out.obj, docs["data/x.json"].a);
  assert.equal(out.nil, null);
});

test("a whole-string binding with a format returns a string", async () => {
  const out = await resolveBindings("{{d.json#/n | ,.0f}}", load, fmt);
  assert.equal(out, "12,000");
});

test("binding with format inside text", async () => {
  const out = await resolveBindings("Total {{d.json#/n | ,.0f}} people", load, fmt);
  assert.equal(out, "Total 12,000 people");
});

test("a binding padded with outer whitespace resolves as text, keeping the spaces", async () => {
  assert.equal(await resolveBindings(" {{d.json#/n}} ", load, fmt), " 12000 ");
});

test("embedded bindings without a format become strings, several per string", async () => {
  const out = await resolveBindings("{{data/x.json#/name}}: {{data/x.json#/n}} ({{data/x.json#/ok}})", load, fmt);
  assert.equal(out, "Springfield: 12000 (true)");
});

test("the es formatter is used when given", async () => {
  const out = await resolveBindings("{{d.json#/n | ,.1f}}", load, makeFormat("es"));
  assert.equal(out, "12.000,0");
});

test("walks objects and arrays deeply without mutating the input", async () => {
  const props = {
    title: "N = {{d.json#/n | ,.0f}}",
    series: [{ label: "{{data/x.json#/name}}", values: "{{data/x.json#/a/b}}" }, "plain", 7, true, null],
    nested: { deep: { v: "{{data/t.csv#/0/v | .1f}}" } },
  };
  const snapshot = structuredClone(props);
  const out = await resolveBindings(props, load, fmt);
  assert.deepEqual(props, snapshot);
  assert.equal(out.title, "N = 12,000");
  assert.equal(out.series[0].label, "Springfield");
  assert.strictEqual(out.series[0].values, docs["data/x.json"].a.b);
  assert.deepEqual(out.series.slice(1), ["plain", 7, true, null]);
  assert.equal(out.nested.deep.v, "1.5");
});

test("{{color:...}} and unrecognised braces are left untouched", async () => {
  const out = await resolveBindings(
    { a: "{{color:accent}}", b: "The {{color:alert}} line at {{d.json#/n}}", c: "{{ nothing }}" },
    load,
    fmt,
  );
  assert.equal(out.a, "{{color:accent}}");
  assert.equal(out.b, "The {{color:alert}} line at 12000");
  assert.equal(out.c, "{{ nothing }}");
});

test("each file is requested through load per binding (caching is the loader's job)", async () => {
  let calls = 0;
  const counting = async (p) => (calls++, load(p));
  await resolveBindings({ a: "{{d.json#/n}}", b: "{{d.json#/n}}" }, counting, fmt);
  assert.equal(calls, 2);
});

test("missing pointer rejects with path and pointer in message", async () => {
  await assert.rejects(resolveBindings("{{data/x.json#/a/zzz}}", load, fmt), (e) => {
    assert.match(e.message, /data\/x\.json/);
    assert.match(e.message, /\/a\/zzz/);
    return true;
  });
});

test("missing file rejects with the loader's error", async () => {
  await assert.rejects(resolveBindings({ x: "{{data/nope.json#/a}}" }, load, fmt), /data file not found: data\/nope\.json/);
});

test("a format on a non-number rejects naming path, pointer and format", async () => {
  await assert.rejects(resolveBindings("{{data/x.json#/name | ,.0f}}", load, fmt), (e) => {
    assert.match(e.message, /data\/x\.json/);
    assert.match(e.message, /\/name/);
    assert.match(e.message, /,\.0f/);
    return true;
  });
});

test("embedding an object, array or null in text rejects", async () => {
  await assert.rejects(resolveBindings("x {{data/x.json#/a}} y", load, fmt), /cannot be embedded in text/);
  await assert.rejects(resolveBindings("x {{data/x.json#/nil}} y", load, fmt), /cannot be embedded in text/);
});

test("an unknown format spec rejects naming the binding", async () => {
  await assert.rejects(resolveBindings("{{d.json#/n | bogus!}}", load, fmt), /d\.json.*\/n.*bogus!/s);
});
