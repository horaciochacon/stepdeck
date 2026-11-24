// The command line itself (cli/index.js), without a browser: the usage text, --version, --name=value, the options a
// command refuses, what --json keeps off stdout, and the messages of `new`, `catalog`, `serve` and the browser
// commands for a folder they cannot use.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "../../cli/serve.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [join(repo, "cli/index.js"), ...args], { cwd: repo, encoding: "utf8" });
const temp = () => mkdtempSync(join(tmpdir(), "stepdeck-cli-"));
/** A deck of one text slide in a new temporary folder (no engine copy: validate reads this repository's engine). */
function tempDeck(deckJs = 'export default { title: "t", slides: ["a"] };\n') {
  const dir = temp();
  mkdirSync(join(dir, "slides"));
  writeFileSync(join(dir, "deck.js"), deckJs);
  writeFileSync(join(dir, "slides", "a.js"), 'export default { id: "a", elements: [{ id: "t", type: "text", props: { text: "Hello." } }] };\n');
  return dir;
}

test("help says what an agent needs: exit codes, the environment, every command's positionals, where the docs are", () => {
  const r = cli("help");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^usage: stepdeck <command> \[deckDir\] \[options\]/);
  for (const text of ["exit codes:", "  0  ", "  2  usage error", "STEPDECK_PLAYWRIGHT", "STEPDECK_CHANNEL", "STEPDECK_WORKERS", "new-component <name> [deckDir]", "catalog [name] [folder]", "  help ", "--version", "--name=value", join("docs", "reference", "cli.md"), "rules.md"]) {
    assert.ok(r.stdout.includes(text), `usage names ${text}`);
  }
  assert.equal(cli("check", "--help").stdout, r.stdout, "--help in any position");
});

test("--version prints the version of package.json", () => {
  const r = cli("--version");
  assert.equal(r.status, 0);
  assert.equal(r.stdout, `${JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).version}\n`);
});

test("--name=value is --name value; a flag takes no value", () => {
  const one = cli("validate", "examples/spike", "--slide=hello");
  assert.equal(one.status, 0, one.stderr);
  assert.match(one.stdout, /^validate: 1 slide, /m);
  assert.match(cli("validate", "examples/spike", "--slide=no=pe").stderr, /unknown slide 'no=pe'/, "only the first = splits");
  for (const [args, message] of [
    [["validate", "--json=yes"], "--json takes no value"],
    [["validate", "--slide"], "--slide needs a value"],
    [["validate", "--nope=1"], "unknown option --nope=1"],
  ]) {
    const r = cli(...args);
    assert.equal(r.status, 2);
    assert.ok(r.stderr.startsWith(`stepdeck: ${message}\n\nusage: `), r.stderr.split("\n")[0]);
  }
});

test("an unknown command gets a did-you-mean", () => {
  const r = cli("chek");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^stepdeck: unknown command 'chek'; did you mean 'check'\?\n\nusage: /);
  assert.match(cli("zzzzzz").stderr, /^stepdeck: unknown command 'zzzzzz'\n\nusage: /);
});

test("a command refuses an option it does not read, and names the commands that do", () => {
  const cases = [
    [["validate", "examples/spike", "--theme", "modern"], "validate does not take --theme (dump, check and shoot do)"],
    [["validate", "examples/spike", "--played"], "validate does not take --played (check does)"],
    [["validate", "examples/spike", "--step", "1"], "validate does not take --step: it folds and checks every step of a slide; use --slide <id>"],
    [["catalog", "--port", "3"], "catalog does not take --port (serve does)"],
    [["dump", "examples/spike", "--played"], "dump does not take --played (check does)"],
    [["new", "x", "--slide", "a"], "new does not take --slide (validate, dump, check and shoot do)"],
    [["serve", "examples/spike", "--size", "960"], "serve does not take --size (dump, check and shoot do)"],
  ];
  for (const [args, message] of cases) {
    const r = cli(...args);
    assert.equal(r.status, 2, args.join(" "));
    assert.equal(r.stderr, `stepdeck: ${message}\n`);
    assert.equal(r.stdout, "");
  }
  const json = cli("validate", "examples/spike", "--theme", "modern", "--json");
  assert.equal(json.status, 2);
  assert.deepEqual(JSON.parse(json.stdout), { error: "validate does not take --theme (dump, check and shoot do)" });
  assert.equal(cli("help", "--port", "3").status, 0, "help ignores every option");
});

test("--json: what a deck module logs goes to stderr, so stdout parses", () => {
  const dir = tempDeck('console.log("loading the deck");\nconsole.info("still loading");\nexport default { title: "t", slides: ["a"] };\n');
  try {
    const json = cli("validate", dir, "--json");
    assert.equal(json.status, 0, json.stderr);
    assert.deepEqual(JSON.parse(json.stdout), []);
    assert.match(json.stderr, /loading the deck\nstill loading\n/);
    const text = cli("validate", dir);
    assert.match(text.stdout, /^loading the deck\n/, "without --json the log stays on stdout");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("new: a folder holding only .git, .gitignore and OS litter counts as empty; a file is said to be a file", () => {
  const dir = temp();
  try {
    const deck = join(dir, "repo");
    mkdirSync(join(deck, ".git"), { recursive: true });
    for (const name of [".gitignore", ".DS_Store", "Thumbs.db"]) writeFileSync(join(deck, name), "");
    const made = cli("new", deck);
    assert.equal(made.status, 0, made.stderr);
    assert.ok(existsSync(join(deck, "deck.js")) && existsSync(join(deck, "stepdeck", "core", "render.html")));
    const again = cli("new", deck);
    assert.equal(again.status, 2);
    assert.match(again.stderr, /is not empty; pass a new or empty folder\n$/);
    const file = join(dir, "notes.txt");
    writeFileSync(file, "x");
    const onFile = cli("new", file);
    assert.equal(onFile.status, 2);
    assert.match(onFile.stderr, /^stepdeck: .*notes\.txt is a file; pass a new or empty folder\n$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("catalog: a rerun removes what the last run wrote and leaves the user's own JSON files alone", () => {
  const dir = tempDeck();
  try {
    assert.equal(cli("catalog", dir).status, 0);
    const out = join(dir, "catalog");
    writeFileSync(join(out, "my-notes.json"), '{"mine":true}\n');
    writeFileSync(join(out, "stale.json"), "{}\n");
    // An entry the previous index lists and the next run no longer writes is removed.
    const index = JSON.parse(readFileSync(join(out, "index.json"), "utf8"));
    writeFileSync(join(out, "index.json"), JSON.stringify([...index, { kind: "component", name: "stale" }]));
    assert.equal(cli("catalog", dir).status, 0);
    assert.equal(readFileSync(join(out, "my-notes.json"), "utf8"), '{"mine":true}\n');
    assert.ok(!existsSync(join(out, "stale.json")), "the stale entry of the last index is removed");
    assert.ok(existsSync(join(out, "text.json")) && existsSync(join(out, "index.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("serve and the browser commands on a folder that is not a deck say so, as validate does", () => {
  const dir = temp();
  try {
    for (const command of ["serve", "dump", "check", "shoot", "validate"]) {
      const r = cli(command, dir);
      assert.equal(r.status, 2, command);
      assert.match(r.stderr, /^stepdeck: no deck\.js in .*; pass the deck folder \(the one holding deck\.js\)\n$/, command);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("serve: a port in use is one plain line, exit 2", async () => {
  const busy = await serve({ root: repo, port: 0 });
  try {
    const r = spawnSync(process.execPath, [join(repo, "cli/index.js"), "serve", "examples/spike", "--port", String(busy.port)], { cwd: repo, encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.equal(r.stderr, `stepdeck: port ${busy.port} is in use; pass --port 0 for a free port, or another --port\n`);
  } finally {
    await busy.close();
  }
});
