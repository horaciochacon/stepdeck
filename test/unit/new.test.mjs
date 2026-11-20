// stepdeck new / new-component (spec §5, §10), in plain Node. The browser half (the new deck checks
// clean with its copied engine) is test/browser/new.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newDeck, newComponent } from "../../cli/new.js";
import { runValidate } from "../../cli/validate.js";
import { formatProblem } from "../../cli/problems.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const cli = (args, cwd = repo) => spawnSync(process.execPath, [join(repo, "cli/index.js"), ...args], { cwd, encoding: "utf8", env: process.env });
const temp = () => realpathSync(mkdtempSync(join(tmpdir(), "stepdeck-new-")));
const show = (problems) => problems.map(formatProblem).join("\n") || "(no problems)";
const importDeck = async (dir) => (await import(`${pathToFileURL(join(dir, "deck.js")).href}?t=${Date.now()}${Math.random()}`)).default;

test("new: copies the template and the engine (no cli, test, docs, examples or node_modules)", async () => {
  const root = temp();
  const dir = join(root, "talk");
  try {
    const result = await newDeck(dir);
    assert.equal(result.dir, dir);
    for (const f of ["index.html", "deck.js", "package.json", "slides/title.js", "slides/chart.js", "slides/closing.js", "data/series.csv", "data/summary.json"]) {
      assert.ok(existsSync(join(dir, f)), f);
    }
    for (const f of ["core/render.html", "core/stepdeck.js", "components/index.json", "components/chart.line/schema.json", "layouts/figure-notes/layout.css",
      "themes/academic-light/tokens.css", "themes/academic-light/fonts/source-sans-3/OFL.txt", "themes/academic-light/fonts/source-sans-3/source-sans-3-latin-400-normal.woff2",
      "vendor/d3/LICENSE", "vendor/reveal/LICENSE", "vendor/marked/LICENSE", "schema/slide.schema.json", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
      assert.ok(existsSync(join(dir, "stepdeck", f)), `stepdeck/${f}`);
    }
    for (const f of ["cli", "test", "docs", "examples", "node_modules", "templates", "types", "package.json"]) {
      assert.ok(!existsSync(join(dir, "stepdeck", f)), `stepdeck/${f} must not be copied`);
    }
    const html = readFileSync(join(dir, "index.html"), "utf8");
    assert.match(html, /<script type="importmap">\{ "imports": \{ "stepdeck\/": "\.\/stepdeck\/" \} \}<\/script>/);
    const deck = await importDeck(dir);
    assert.equal(deck.lang, "en");
    assert.deepEqual(deck.components, []);
    assert.deepEqual(deck.slides, ["title", "chart", "closing"]);
    // Hints use the real CLI path (no `stepdeck` on PATH needed) and the deck folder as an argument.
    const cliPath = join(fileURLToPath(new URL("../../", import.meta.url)), "cli", "index.js");
    for (const cmd of ["serve", "validate", "check", "shoot", "catalog"]) {
      assert.ok(result.next.some((l) => l.startsWith(`node ${cliPath} ${cmd} ${dir}`)), `next has the ${cmd} command: ${result.next.join(" | ")}`);
    }
    assert.ok(result.next.some((l) => /already works/.test(l)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("new: the new deck validates clean in Node (no errors, no warnings)", async () => {
  const root = temp();
  try {
    await newDeck(join(root, "d"));
    const { problems, slides } = await runValidate(join(root, "d"));
    assert.deepEqual(problems, [], show(problems));
    assert.deepEqual(slides, ["title", "chart", "closing"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("new: refuses a non-empty folder and an unknown template", async () => {
  const root = temp();
  try {
    writeFileSync(join(root, "keep.txt"), "mine");
    await assert.rejects(newDeck(root), /not empty/);
    assert.equal(readFileSync(join(root, "keep.txt"), "utf8"), "mine");
    await assert.rejects(newDeck(join(root, "x"), { template: "nope" }), /unknown template 'nope'.*talk/);
    await assert.rejects(newDeck(join(root, "y"), { template: "component" }), /unknown template 'component'/);
    assert.ok(!existsSync(join(root, "x")) && !existsSync(join(root, "y")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("new-component rejects bare name", async () => {
  const root = temp();
  try {
    await newDeck(join(root, "d"));
    await assert.rejects(newComponent(join(root, "d"), "meter"), /'meter' needs a namespace, e\.g\. 'my\.meter'/);
    await assert.rejects(newComponent(join(root, "d"), "chart.line"), /'chart\.line' is a built-in/);
    await assert.rejects(newComponent(join(root, "d"), "My.Thing"), /lowercase/);
    assert.ok(!existsSync(join(root, "d/components")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("new-component: scaffolds the template with the name, appends it to deck.js, and still validates", async () => {
  const root = temp();
  const dir = join(root, "d");
  try {
    await newDeck(dir);
    const result = await newComponent(dir, "my.meter");
    assert.equal(result.deckUpdated, true);
    for (const f of ["index.js", "schema.json", "example.js", "README.md"]) assert.ok(existsSync(join(dir, "components/my.meter", f)), f);
    const schema = JSON.parse(readFileSync(join(dir, "components/my.meter/schema.json"), "utf8"));
    assert.equal(schema.title, "my.meter");
    assert.ok(schema.description);
    for (const [k, p] of Object.entries(schema.properties)) {
      assert.ok(p.description && Array.isArray(p.examples) && p.examples.length && p["x-transition"], `prop ${k}`);
    }
    for (const f of ["index.js", "example.js", "README.md"]) {
      const text = readFileSync(join(dir, "components/my.meter", f), "utf8");
      assert.ok(!/__NAME__|__ID__/.test(text), `${f} has a placeholder left`);
      assert.match(text, /my\.meter/);
    }
    assert.deepEqual((await importDeck(dir)).components, ["my.meter"]);
    await assert.rejects(newComponent(dir, "my.meter"), /already exists/);

    const { problems } = await runValidate(dir);
    assert.deepEqual(problems, [], show(problems));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("new-component: edits deck.js only when safe; otherwise prints the line to add", async () => {
  const root = temp();
  try {
    // No components key: inserted before slides.
    const a = join(root, "a");
    mkdirSync(a);
    writeFileSync(join(a, "deck.js"), 'export default {\n  title: "a",\n  slides: ["s"],\n};\n');
    assert.equal((await newComponent(a, "my.one")).deckUpdated, true);
    assert.equal(readFileSync(join(a, "deck.js"), "utf8"), 'export default {\n  title: "a",\n  components: ["my.one"],\n  slides: ["s"],\n};\n');
    // Existing entries kept, in order.
    assert.equal((await newComponent(a, "my.two")).deckUpdated, true);
    assert.deepEqual((await importDeck(a)).components, ["my.one", "my.two"]);

    // Built from code: left alone, with the exact line to add.
    const b = join(root, "b");
    mkdirSync(b);
    const code = 'const extra = ["my.base"];\nexport default { title: "b", components: [...extra], slides: ["s"] };\n';
    writeFileSync(join(b, "deck.js"), code);
    const res = await newComponent(b, "my.three");
    assert.equal(res.deckUpdated, false);
    assert.equal(readFileSync(join(b, "deck.js"), "utf8"), code);
    assert.match(res.line, /add "my\.three" to components in deck\.js/);
    assert.ok(existsSync(join(b, "components/my.three/index.js")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cli: new and new-component, with --json", () => {
  const root = temp();
  try {
    const made = cli(["new", "talk"], root);
    assert.equal(made.status, 0, made.stdout + made.stderr);
    assert.match(made.stdout, /node \S+cli\/index\.js serve /);
    assert.match(made.stdout, /node \S+cli\/index\.js check \S+ --played/);
    assert.doesNotMatch(made.stdout, /^\s*stepdeck /m);
    const again = cli(["new", "talk", "--json"], root);
    assert.equal(again.status, 2);
    assert.match(JSON.parse(again.stdout).error, /not empty/);
    const comp = cli(["new-component", "my.meter", "--json"], join(root, "talk"));
    assert.equal(comp.status, 0, comp.stdout + comp.stderr);
    assert.equal(JSON.parse(comp.stdout).deckUpdated, true);
    const bare = cli(["new-component", "meter"], join(root, "talk"));
    assert.equal(bare.status, 2);
    assert.match(bare.stderr, /needs a namespace/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
