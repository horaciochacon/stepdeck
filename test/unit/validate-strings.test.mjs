// stepdeck validate: what it decides from the shape of a string (a file, a URL, a hex colour), step ids, the fix
// text of a file that does not parse, a component's own severity, and the schema it reads. Node only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "../../cli/validate.js";
import { readSchema } from "../../cli/ajv.js";
import { copyEngine } from "../../cli/engine.js";
import { formatProblem } from "../../cli/problems.js";

const fixture = (name) => fileURLToPath(new URL(`../fixtures/validate/${name}/`, import.meta.url));
const show = (problems) => problems.map(formatProblem).join("\n");
const errors = (problems) => problems.filter((p) => p.severity !== "warning");
const warnings = (problems) => problems.filter((p) => p.severity === "warning");
/** Elements are checked side by side, so problems of different elements come in no fixed order: by element id. */
const byElement = (problems) => [...problems].sort((a, b) => String(a.element).localeCompare(String(b.element)));

/** A deck in a new temporary folder: { "deck.js": text, "slides/a.js": text, … }; fn(dir). Removed afterwards. */
async function withDeck(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), "stepdeck-validate-"));
  try {
    for (const [path, text] of Object.entries({ "deck.js": 'export default { title: "t", slides: ["a"] };\n', ...files })) {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const slide = (elements, rest = "") => `export default { id: "a", ${rest} elements: ${JSON.stringify(elements)} };\n`;

test("a path is checked through ./, a space, ?query and #fragment; running text is not a path, a colour or a host", async () => {
  const problems = byElement(await validate(fixture("prose-and-paths")));
  assert.deepEqual(errors(problems).map((p) => [p.element, p.rule, p.measured]), [
    ["dot", "file-missing", "src = ./assets/nope.png"],
    ["hash", "file-missing", "src = assets/nope.svg#mark"],
    ["query", "file-missing", "src = assets/nope.PNG?v=2"],
    ["space", "file-missing", "src = assets/my photo.png"],
  ], show(problems));
  assert.match(errors(problems)[2].fix, /^create assets\/nope\.PNG in the deck/, "the fix names the path, without the query");
  // The one thing said of the prose: the URL it cites, as a warning.
  const [cited, ...more] = warnings(problems);
  assert.deepEqual(more, [], show(problems));
  assert.equal(cited.element, "prose");
  assert.equal(cited.rule, "remote-url");
  assert.equal(cited.measured, "items[1].text has https://www.who.int/data in running text");
  assert.match(cited.fix, /^keep it if it is a citation/);
});

test("outside running text nothing changed: a colour, a URL that loads and a bare file name are still errors", async () => {
  const elements = [
    { id: "color", type: "text", props: { text: "#123" } },
    { id: "span", type: "markdown", props: { md: 'The <span style="color:#c00">red</span> line.' } },
    { id: "img", type: "markdown", props: { md: "See ![logo](https://example.org/logo.png) here" } },
    { id: "tag", type: "markdown", props: { md: 'An <img src="//cdn.example.org/a.png" alt="a"> image' } },
    { id: "bare", type: "text", props: { text: "results.csv" } },
    { id: "host", type: "text", props: { text: "Served from //cdn.example.org/lib.js today" } },
  ];
  await withDeck({ "slides/a.js": slide(elements) }, async (dir) => {
    const problems = byElement(await validate(dir));
    assert.deepEqual(problems.map((p) => [p.element, p.rule, p.severity]), [
      ["bare", "file-missing", "error"],
      ["color", "hex-color", "error"],
      ["host", "remote-url", "warning"],
      ["img", "remote-url", "error"],
      ["span", "hex-color", "error"],
      ["tag", "remote-url", "error"],
    ], show(problems));
  });
});

test("step ids outside letters, digits, _ and - are a warning (step-id-chars)", async () => {
  const problems = await validate(fixture("step-id-chars"));
  assert.deepEqual(problems.map((p) => [p.rule, p.severity, p.step]), [
    ["step-id-chars", "warning", "x/../../escaped"],
    ["step-id-chars", "warning", "two words"],
  ], show(problems));
  assert.match(problems[0].fix, /^rename step 1 to such an id \(e\.g\. 'x-escaped'\)/);
  assert.match(problems[1].fix, /'two-words'/);
});

test("a file with a syntax error: the fix says how to find the line", async () => {
  await withDeck({ "slides/a.js": 'export default { id: "a", elements: [ };\n' }, async (dir) => {
    const [p, ...more] = await validate(dir);
    assert.deepEqual(more, []);
    assert.equal(p.rule, "slide-load");
    assert.equal(p.fix, "syntax error; run `node --check slides/a.js` for the line");
  });
  await withDeck({ "deck.js": "export default { title: ;\n" }, async (dir) => {
    const [p] = await validate(dir);
    assert.equal(p.rule, "deck-load");
    assert.equal(p.fix, "syntax error; run `node --check deck.js` for the line");
  });
  // Any other failure keeps the general fix.
  await withDeck({ "slides/a.js": 'document.title = "x";\nexport default { id: "a", elements: [] };\n' }, async (dir) => {
    const [p] = await validate(dir);
    assert.equal(p.rule, "slide-load");
    assert.match(p.fix, /no DOM, fetch or top-level await/);
  });
});

test("a diagram's own severity is kept: two drawn nodes in one cell are a warning, a node off the grid an error", async () => {
  const diagram = (nodes) => [{ id: "d", type: "diagram", props: { cols: 2, rows: 1, nodes } }];
  await withDeck({ "slides/a.js": slide(diagram([{ id: "x", label: "X", shape: "box", col: 0, row: 0 }, { id: "y", label: "Y", shape: "box", col: 0, row: 0 }])) }, async (dir) => {
    const problems = await validate(dir);
    assert.deepEqual(problems.map((p) => [p.rule, p.severity]), [["diagram-overlap", "warning"]], show(problems));
    assert.match(problems[0].measured, /nodes 'x' and 'y' share a cell/);
  });
  await withDeck({ "slides/a.js": slide(diagram([{ id: "x", label: "X", shape: "box", col: 0, row: 0 }, { id: "y", label: "Y", shape: "box", col: 2, row: 0 }])) }, async (dir) => {
    const problems = await validate(dir);
    assert.deepEqual(problems.map((p) => [p.rule, p.severity]), [["diagram-grid", "error"]], show(problems));
  });
});

test("prop-invalid for a number bound where a string is expected: the fix offers a format on the binding", async () => {
  const files = {
    "data/summary.json": '{ "count": 42, "rate": 37.3, "name": "B" }\n',
    "slides/a.js": slide([
      { id: "whole", type: "text", props: { text: "{{data/summary.json#/count}}" } },
      { id: "rate", type: "text", props: { text: "{{data/summary.json#/rate}}" } },
      { id: "typed", type: "text", props: { text: 42 } },
    ]),
  };
  await withDeck(files, async (dir) => {
    const problems = byElement(await validate(dir));
    assert.deepEqual(problems.map((p) => [p.element, p.rule, p.limit]), [["rate", "prop-invalid", "must be string"], ["typed", "prop-invalid", "must be string"], ["whole", "prop-invalid", "must be string"]], show(problems));
    assert.match(problems[0].fix, /\{\{data\/summary\.json#\/rate \| \.1f\}\}/);
    assert.equal(problems[1].fix, "make text a string (props of text)", "a number typed in the slide has no binding to format");
    assert.equal(problems[2].fix, "make text a string, or add a format to the binding to get a string: {{data/summary.json#/count | d}} (props of text)");
  });
});

test("validate reads the deck, slide and layout schemas of the deck's own engine copy", async () => {
  await withDeck({ "slides/a.js": slide([{ id: "t", type: "text", props: { text: "Hello." } }], 'section: "Part one",') }, async (dir) => {
    assert.deepEqual(await validate(dir), [], "valid against this repository's schema");
    // An engine copy whose slide schema does not know `section` (an engine of another version).
    copyEngine(join(dir, "stepdeck"));
    const file = join(dir, "stepdeck", "schema", "slide.schema.json");
    const schema = JSON.parse(readFileSync(file, "utf8"));
    delete schema.properties.section;
    writeFileSync(file, JSON.stringify(schema));
    assert.ok(!("section" in readSchema("slide", join(dir, "stepdeck")).properties));
    const problems = await validate(dir);
    assert.deepEqual(problems.map((p) => [p.rule, p.measured]), [["unknown-key", "key 'section'"]], show(problems));
    // A copy without schema/ falls back to this repository's.
    rmSync(join(dir, "stepdeck", "schema"), { recursive: true });
    assert.ok("section" in readSchema("slide", join(dir, "stepdeck")).properties);
  });
});
