import { test } from "node:test";
import assert from "node:assert/strict";
import { makeFormat } from "../../core/format.js";
import { parseCSV, createDataLoader } from "../../core/data.js";
import { t, messages } from "../../core/i18n.js";

// ---------- makeFormat ----------

test("es format uses decimal comma", () => {
  assert.equal(makeFormat("es")(",.1f")(1234.5), "1.234,5");
});

test("en format uses decimal point and comma grouping", () => {
  assert.equal(makeFormat("en")(",.1f")(1234.5), "1,234.5");
  assert.equal(makeFormat("en")(",.0f")(12000), "12,000");
  assert.equal(makeFormat("en")(".1%")(0.256), "25.6%");
});

test("es percent keeps the d3 shape with a decimal comma", () => {
  assert.equal(makeFormat("es")(".1%")(0.256), "25,6%");
});

test("unknown lang falls back to en", () => {
  assert.equal(makeFormat("fr")(",.1f")(1234.5), "1,234.5");
});

test("negative numbers use the d3 minus sign (U+2212) in every locale", () => {
  assert.equal(makeFormat("en")(",.0f")(-5), "\u22125");
  assert.equal(makeFormat("es")(",.0f")(-1500), "\u22121.500");
});

test("invalid format spec throws an error naming the spec", () => {
  assert.throws(() => makeFormat("en")("not a format"), /not a format/);
});

// ---------- parseCSV ----------

test("code column with leading zero stays string", () => {
  const rows = parseCSV("ubigeo\n080101");
  assert.deepEqual(rows, [{ ubigeo: "080101" }]);
  assert.equal(typeof rows[0].ubigeo, "string");
});

test("undeclared columns are numbers only when every non-empty value is numeric", () => {
  const rows = parseCSV("a,b,c,d\n1,2.5,x,-3\n2,,y,0.5\n");
  assert.deepEqual(rows, [
    { a: 1, b: 2.5, c: "x", d: -3 },
    { a: 2, b: null, c: "y", d: 0.5 },
  ]);
});

test("a single non-numeric value keeps the whole column as strings", () => {
  const rows = parseCSV("v\n1\n2\nn/a");
  assert.deepEqual(rows, [{ v: "1" }, { v: "2" }, { v: "n/a" }]);
});

test("a zero on its own and 0.5 are numbers, 007 and 00.5 are not", () => {
  assert.deepEqual(parseCSV("n\n0\n0.5"), [{ n: 0 }, { n: 0.5 }]);
  assert.deepEqual(parseCSV("n\n007"), [{ n: "007" }]);
  assert.deepEqual(parseCSV("n\n00.5"), [{ n: "00.5" }]);
});

test("exponents and plus signs are not guessed as numbers", () => {
  assert.deepEqual(parseCSV("n\n1e3"), [{ n: "1e3" }]);
  assert.deepEqual(parseCSV("n\n+5"), [{ n: "+5" }]);
});

test("declared types win", () => {
  const csv = "code,n,when\n080101,12,2024-03-05\n010203,,2024-04-01";
  const rows = parseCSV(csv, { code: "number", n: "string", when: "date" });
  assert.deepEqual(rows, [
    { code: 80101, n: "12", when: "2024-03-05" },
    { code: 10203, n: "", when: "2024-04-01" },
  ]);
  // A declared string beats numeric-looking data.
  assert.deepEqual(parseCSV("id\n42", { id: "string" }), [{ id: "42" }]);
});

test("empty cells in number columns are null; empty string cells stay empty strings", () => {
  const rows = parseCSV("n,s\n,\n3,x", { n: "number" });
  assert.deepEqual(rows, [{ n: null, s: "" }, { n: 3, s: "x" }]);
});

test("a declared number column with a non-numeric cell throws naming column and row", () => {
  assert.throws(() => parseCSV("n\n1\nabc", { n: "number" }), /column "n".*row 2.*abc/s);
});

test("a declared date with an invalid value throws", () => {
  assert.throws(() => parseCSV("d\nyesterday", { d: "date" }), /column "d".*yesterday/s);
});

test("a date that does not exist on the calendar throws", () => {
  assert.throws(() => parseCSV("d\n2024-02-31", { d: "date" }), /2024-02-31/);
  assert.deepEqual(parseCSV("d\n2024-02-29", { d: "date" }), [{ d: "2024-02-29" }]);
});

test("declaring a type for a missing column or an unknown type throws", () => {
  assert.throws(() => parseCSV("a\n1", { b: "number" }), /"b"/);
  assert.throws(() => parseCSV("a\n1", { a: "float" }), /float/);
});

test("quotes, embedded commas and newlines, CRLF and BOM", () => {
  const csv = '﻿name,note\r\n"Springfield, Northland","said ""hi""\nthere"\r\nRivertown,plain\r\n';
  assert.deepEqual(parseCSV(csv), [
    { name: "Springfield, Northland", note: 'said "hi"\nthere' },
    { name: "Rivertown", note: "plain" },
  ]);
});

test("blank lines are skipped; header only gives no rows", () => {
  assert.deepEqual(parseCSV("a\n1\n\n2\n"), [{ a: 1 }, { a: 2 }]);
  assert.deepEqual(parseCSV("a,b\n"), []);
  assert.deepEqual(parseCSV(""), []);
});

test("a row with more cells than the header throws; fewer cells are padded", () => {
  assert.throws(() => parseCSV("a\n1,2"), /row 1/);
  assert.deepEqual(parseCSV("a,b\n1\n2,5"), [
    { a: 1, b: null },
    { a: 2, b: 5 },
  ]);
  // A column with no values at all has nothing to guess from and stays strings.
  assert.deepEqual(parseCSV("a,b\n1,\n2,"), [{ a: 1, b: "" }, { a: 2, b: "" }]);
});

// ---------- createDataLoader ----------

function memoryReader(files) {
  const calls = [];
  const read = async (p) => {
    calls.push(p);
    if (!(p in files)) throw Object.assign(new Error("ENOENT " + p), { code: "ENOENT" });
    return files[p];
  };
  return { read, calls };
}

test("loader reads json, geojson and csv relative to root", async () => {
  const { read, calls } = memoryReader({
    "/deck/data/a.json": '{"x":1}',
    "/deck/data/m.geojson": '{"type":"FeatureCollection","features":[]}',
    "/deck/data/t.csv": "k,v\na,1\n",
  });
  const load = createDataLoader({ root: "/deck", read });
  assert.deepEqual(await load("data/a.json"), { x: 1 });
  assert.equal((await load("data/m.geojson")).type, "FeatureCollection");
  assert.deepEqual(await load("data/t.csv"), [{ k: "a", v: 1 }]);
  assert.deepEqual(calls, ["/deck/data/a.json", "/deck/data/m.geojson", "/deck/data/t.csv"]);
});

test("a root with a trailing slash and a ./ path resolve the same file", async () => {
  const { read, calls } = memoryReader({ "/deck/data/a.json": "[1]" });
  const load = createDataLoader({ root: "/deck/", read });
  assert.deepEqual(await load("./data/a.json"), [1]);
  assert.deepEqual(await load("data/a.json"), [1]);
  assert.deepEqual(calls, ["/deck/data/a.json"]);
});

test("concurrent and repeated loads share one read", async () => {
  const { read, calls } = memoryReader({ "r/a.json": '{"x":1}' });
  const load = createDataLoader({ root: "r", read });
  const [a, b] = await Promise.all([load("a.json"), load("a.json")]);
  assert.equal(a, b);
  assert.equal(await load("a.json"), a);
  assert.equal(calls.length, 1);
});

test("the CSV cache key includes types", async () => {
  const { read, calls } = memoryReader({ "r/t.csv": "code\n080101" });
  const load = createDataLoader({ root: "r", read });
  const guessed = await load("t.csv");
  const asNumber = await load("t.csv", { types: { code: "number" } });
  const again = await load("t.csv", { types: { code: "number" } });
  assert.deepEqual(guessed, [{ code: "080101" }]);
  assert.deepEqual(asNumber, [{ code: 80101 }]);
  assert.equal(again, asNumber);
  assert.equal(calls.length, 2);
});

test("types key order does not change the cache key", async () => {
  const { read, calls } = memoryReader({ "r/t.csv": "a,b\n1,2" });
  const load = createDataLoader({ root: "r", read });
  const x = await load("t.csv", { types: { a: "string", b: "string" } });
  const y = await load("t.csv", { types: { b: "string", a: "string" } });
  assert.equal(x, y);
  assert.equal(calls.length, 1);
});

test("a missing file rejects with data file not found: <path>", async () => {
  const { read } = memoryReader({});
  const load = createDataLoader({ root: "r", read });
  await assert.rejects(load("data/nope.json"), (e) => {
    assert.equal(e.message, "data file not found: data/nope.json");
    return true;
  });
});

test("a failed load is not cached", async () => {
  const files = {};
  const { read, calls } = memoryReader(files);
  const load = createDataLoader({ root: "r", read });
  await assert.rejects(load("a.json"), /data file not found/);
  files["r/a.json"] = "[1]";
  assert.deepEqual(await load("a.json"), [1]);
  assert.equal(calls.length, 2);
});

test("read may return a fetch-like Response: not ok rejects as not found, ok is read as text", async () => {
  const responses = {
    "r/ok.json": { ok: true, status: 200, text: async () => '{"v":1}' },
    "r/gone.json": { ok: false, status: 404, text: async () => "Not found" },
  };
  const load = createDataLoader({ root: "r", read: async (p) => responses[p] });
  assert.deepEqual(await load("ok.json"), { v: 1 });
  await assert.rejects(load("gone.json"), (e) => {
    assert.equal(e.message, "data file not found: gone.json");
    return true;
  });
});

test("read may return bytes (Buffer from fs.readFile)", async () => {
  const load = createDataLoader({ root: "r", read: async () => Buffer.from('[{"a":1}]') });
  assert.deepEqual(await load("a.json"), [{ a: 1 }]);
});

test("read returning something else rejects as not found with a clear cause", async () => {
  const load = createDataLoader({ root: "r", read: async () => 42 });
  await assert.rejects(load("a.json"), (e) => {
    assert.match(e.message, /data file not found: a\.json/);
    assert.match(e.cause.message, /text, bytes or a fetch Response/);
    return true;
  });
});

test("invalid JSON rejects naming the path", async () => {
  const { read } = memoryReader({ "r/bad.json": "{oops" });
  const load = createDataLoader({ root: "r", read });
  await assert.rejects(load("bad.json"), /bad\.json/);
});

test("unsupported extensions and paths leaving the deck root are rejected", async () => {
  const { read, calls } = memoryReader({ "r/a.txt": "x" });
  const load = createDataLoader({ root: "r", read });
  await assert.rejects(load("a.txt"), /unsupported data file type: a\.txt/);
  await assert.rejects(load("../secret.json"), /relative to the deck root/);
  await assert.rejects(load("/etc/x.json"), /relative to the deck root/);
  assert.equal(calls.length, 0);
});

// ---------- i18n ----------

test("t returns en and es strings for the four keys", () => {
  for (const key of ["section", "step", "of", "error"]) {
    assert.equal(typeof t("en", key), "string");
    assert.equal(typeof t("es", key), "string");
  }
  assert.equal(t("en", "of"), "of");
  assert.equal(t("es", "of"), "de");
  assert.equal(t("en", "step"), "Step");
  assert.equal(t("es", "step"), "Paso");
  assert.equal(t("es", "section"), "Sección");
  assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages.es).sort());
});

test("t falls back to en for unknown lang and to the key for unknown keys", () => {
  assert.equal(t("fr", "step"), "Step");
  assert.equal(t("es", "no-such-key"), "no-such-key");
  assert.equal(t("en", "toString"), "toString");
  assert.equal(t("__proto__", "step"), "Step");
});

// ---------- loader.url ----------

test("loader.url resolves a deck-relative path against the same root as the loader, with the same rules", () => {
  const load = createDataLoader({ root: "https://host/decks/talk/", read: async () => "" });
  assert.equal(load.url("assets/a.svg"), "https://host/decks/talk/assets/a.svg");
  assert.equal(load.url("./assets//a.svg"), "https://host/decks/talk/assets/a.svg");
  for (const bad of ["../a.svg", "/abs/a.svg", "https://x/a.svg", "a\\b.svg", "", "."]) {
    assert.throws(() => load.url(bad), /data path/, `rejects ${JSON.stringify(bad)}`);
  }
  assert.equal(createDataLoader({ root: "", read: async () => "" }).url("a.svg"), "a.svg");
});

test("a percent sign in a path is rejected, so %2e%2e cannot spell a dot segment out of the deck", async () => {
  const load = createDataLoader({ root: "http://host/decks/talk/", read: async () => "[]" });
  for (const bad of ["%2e%2e/x.svg", "a/%2E%2E/x.svg", "a/%2E%2E/%2e%2e/x.svg", "data/100%.csv"]) {
    assert.throws(() => load.url(bad), /data path/, `url ${bad}`);
    await assert.rejects(load(bad.replace(/\.svg$/, ".json")), /data path/, `load ${bad}`);
  }
});
