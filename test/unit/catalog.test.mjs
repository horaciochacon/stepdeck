// stepdeck catalog (spec §6.5): built from schema.json, README.md and layout/theme descriptors only,
// never from component code. Written to <dir>/catalog/index.json and <dir>/catalog/<name>.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { catalog, buildCatalog, catalogTarget } from "../../cli/catalog.js";
import { ENGINE, readBuiltins } from "../../cli/engine.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const throws = fileURLToPath(new URL("../fixtures/decks/catalog-throws/", import.meta.url));
const cli = (args, cwd = repo) => spawnSync(process.execPath, [join(repo, "cli/index.js"), ...args], { cwd, encoding: "utf8", env: process.env });
const temp = () => realpathSync(mkdtempSync(join(tmpdir(), "stepdeck-catalog-")));

test("catalog index lists chart.line with animates including y", async () => {
  const out = temp();
  try {
    const { entries, problems } = await catalog([ENGINE], { outDir: out });
    assert.deepEqual(problems, []);
    const index = JSON.parse(readFileSync(join(out, "index.json"), "utf8"));
    assert.deepEqual(index, entries);
    const line = index.find((e) => e.name === "chart.line");
    assert.equal(line.kind, "component");
    assert.ok(line.animates.includes("y"), JSON.stringify(line));
    assert.ok(!line.animates.includes("data"), "snap props do not animate");
    assert.match(line.summary, /^Line chart of one or more series/);
    assert.ok(!line.summary.includes("morphs"), "summary is the first sentence only");
    for (const e of index) assert.deepEqual(Object.keys(e), ["kind", "name", "summary", "animates"]);

    // Every built-in component, layout and theme is listed, each with its detail file.
    const builtins = readBuiltins(ENGINE);
    const names = (kind) => index.filter((e) => e.kind === kind).map((e) => e.name).sort();
    assert.deepEqual(names("component"), [...builtins].sort());
    assert.deepEqual(names("layout"), ["figure-notes", "full-bleed", "halves", "statement", "title"]);
    assert.deepEqual(names("theme"), ["academic-light", "modern"]);
    const files = readdirSync(out).sort();
    assert.deepEqual(files, ["index.json", ...index.map((e) => `${e.name}.json`)].sort());
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("catalog detail: props with description, examples and transition; layout regions; theme tokens and palettes", async () => {
  const { details } = await buildCatalog([ENGINE]);
  const line = details.get("chart.line");
  assert.equal(line.origin, "built-in");
  assert.match(line.description, /morphs the lines/);
  assert.equal(line.props.y["x-transition"], "tween");
  assert.equal(line.props.y.required, true);
  assert.ok(line.props.y.description && line.props.y.examples.length);
  assert.equal(line.props.y.schema.type, "string");
  assert.match(line.readme, /^# chart\.line/);
  assert.equal(line.example, "components/chart.line/example.js");

  const fn = details.get("figure-notes");
  assert.equal(fn.kind, "layout");
  assert.deepEqual(fn.regions.map((r) => r.name), ["title", "main", "notes", "footer"]);
  assert.deepEqual(fn.variables.find((v) => v.name === "--notes-width").default, "560px");

  const theme = details.get("academic-light");
  assert.equal(theme.kind, "theme");
  assert.match(theme.summary, /^The plain alternative theme/);
  assert.equal(theme.tokens["--sd-color-background"], "#ffffff");
  assert.equal(theme.tokens["--min-audience-font"], "28px");
  assert.equal(theme.palettes.default.categorical, "okabe-ito-dark");
  assert.equal(theme.palettes.palettes["okabe-ito-dark"].kind, "categorical");
});

test("catalog reads schema.json only: a component whose index.js throws on import still appears", async () => {
  const out = temp();
  try {
    const { entries } = await catalog([ENGINE, throws], { outDir: out });
    assert.equal(globalThis.__stepdeckCatalogImportedBoom, undefined, "index.js was imported");
    const boom = entries.find((e) => e.name === "bad.boom");
    assert.deepEqual(boom, { kind: "component", name: "bad.boom", summary: "A fixture component whose code throws on import.", animates: ["level"] });
    const detail = JSON.parse(readFileSync(join(out, "bad.boom.json"), "utf8"));
    assert.equal(detail.origin, "deck");
    assert.equal(detail.props.label["x-transition"], "snap");
    assert.ok(entries.some((e) => e.name === "chart.line"), "built-ins are listed with the deck's own");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("catalog lint: built-ins are complete, and a prop without description, examples or x-transition is a problem", async () => {
  assert.deepEqual((await buildCatalog([ENGINE])).problems, [], "every built-in schema is complete");
  const deck = temp();
  try {
    mkdirSync(join(deck, "components/my.thin"), { recursive: true });
    writeFileSync(join(deck, "deck.js"), 'export default { title: "t", components: ["my.thin"], slides: ["s"] };\n');
    writeFileSync(join(deck, "components/my.thin/schema.json"), JSON.stringify({ type: "object", properties: { a: { type: "string" } } }));
    const { problems, entries } = await buildCatalog([ENGINE, deck]);
    assert.ok(entries.some((e) => e.name === "my.thin"));
    const rules = problems.map((p) => `${p.element} ${p.rule} ${p.measured}`);
    assert.ok(rules.some((r) => /^my\.thin catalog-schema .*description/.test(r)), rules.join("\n"));
    assert.ok(rules.some((r) => /^my\.thin catalog-schema .*'a'.*x-transition/.test(r)), rules.join("\n"));
  } finally {
    rmSync(deck, { recursive: true, force: true });
  }
});

test("catalogTarget: the repository root reads engine/ and writes <repo>/catalog/; engine/ itself is an engine root", () => {
  assert.deepEqual(catalogTarget(repo), { roots: [join(repo, "engine")], outDir: join(repo, "catalog") });
  assert.deepEqual(catalogTarget(ENGINE), { roots: [join(repo, "engine")], outDir: join(repo, "engine", "catalog") });
});

test("cli: catalog <name> prints one entry; --json gives its detail; an unknown name suggests one", () => {
  const text = cli(["catalog", "chart.line"]);
  assert.equal(text.status, 0, text.stdout + text.stderr);
  assert.match(text.stdout, /^chart\.line · component/m);
  assert.match(text.stdout, /^ {2}y .*tween/m);
  const json = cli(["catalog", "chart.line", "--json"]);
  assert.equal(json.status, 0, json.stderr);
  assert.equal(JSON.parse(json.stdout).props.y["x-transition"], "tween");
  const layout = cli(["catalog", "figure-notes", "--json"]);
  assert.equal(JSON.parse(layout.stdout).kind, "layout");
  const unknown = cli(["catalog", "chart.lin"]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /no catalog entry 'chart\.lin'.*chart\.line/);
});

test("cli: catalog on a deck writes <deck>/catalog/ with the deck's components", () => {
  try {
    // The fixture deck has no engine copy, so the catalog reads this repo's engine for the built-ins.
    const res = cli(["catalog", throws, "--json"]);
    assert.equal(res.status, 0, res.stdout + res.stderr);
    const index = JSON.parse(res.stdout);
    assert.ok(index.some((e) => e.name === "bad.boom"));
    const written = JSON.parse(readFileSync(join(throws, "catalog/index.json"), "utf8"));
    assert.deepEqual(written, index);
  } finally {
    rmSync(join(throws, "catalog"), { recursive: true, force: true });
  }
});
