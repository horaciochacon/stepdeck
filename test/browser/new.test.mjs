// A deck made by `stepdeck new` works standalone with its copied engine (spec §3, ruling R15): it is
// created outside this repo, served from its own folder, validates and checks clean from inside it,
// and its fonts load from the deck-local copy.
// Run with: STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { newDeck, newComponent } from "../../cli/new.js";
import { deckTarget, withPage } from "../../cli/browser.js";
import { check } from "../../cli/check.js";
import { formatProblem } from "../../cli/problems.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const show = (problems) => problems.map(formatProblem).join("\n") || "(no problems)";
const cli = (args, cwd) => spawnSync(process.execPath, [join(repo, "cli/index.js"), ...args], { cwd, encoding: "utf8", env: process.env });

let root;
let deck;
before(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "stepdeck-new-browser-")));
  deck = join(root, "my-talk");
  await newDeck(deck);
});
after(() => rmSync(root, { recursive: true, force: true }));

test("new deck validates and checks clean", async () => {
  assert.ok(relative(repo, deck).startsWith(".."), "the deck is outside the engine repo");
  assert.equal(deckTarget(deck).root, deck, "served from the deck itself, with its copied engine");

  const validate = cli(["validate"], deck);
  assert.equal(validate.status, 0, validate.stdout + validate.stderr);
  assert.match(validate.stdout, /^validate: 3 slides, 0 errors, 0 warnings$/m);

  const checked = cli(["check"], deck);
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  assert.match(checked.stdout, /^check: 3 slides, \d+ steps, 0 problems$/m);

  const played = cli(["check", "--played"], deck);
  assert.equal(played.status, 0, played.stdout + played.stderr);
  assert.match(played.stdout, /played arrivals compared, 0 problems$/m);
});

test("new deck: the chart slide builds over steps with ids", async () => {
  const target = deckTarget(deck);
  await withPage({ root: target.root, url: target.url({ slide: "chart", capture: true }) }, async (page) => {
    const steps = await page.evaluate(() => window.STEPDECK.steps.chart);
    assert.ok(steps.length >= 3, JSON.stringify(steps));
    for (const id of steps) assert.doesNotMatch(id, /^\d+$/, "every step has an id");
    const types = await page.evaluate(() => Object.values(window.STEPDECK.state().elements).map((e) => e.type));
    for (const t of ["chart.line", "big-number", "text"]) assert.ok(types.includes(t), types.join(", "));
  });
});

test("new deck: fonts and the engine load from the deck-local copy, nothing fails", async () => {
  const target = deckTarget(deck);
  await withPage({ root: target.root, url: target.url({ slide: "title", capture: true }) }, async (page, ctx) => {
    const fonts = ctx.requests.filter((u) => u.endsWith(".woff2"));
    assert.ok(fonts.length > 0, "fonts were requested");
    for (const u of fonts) assert.ok(u.startsWith(`${ctx.base}stepdeck/themes/modern/fonts/`), u);
    for (const u of ctx.requests) assert.ok(u.startsWith(ctx.base) || u.startsWith("data:"), `same-origin only: ${u}`);
    assert.deepEqual(ctx.failed, []);
    assert.deepEqual(ctx.errors, []);
    const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family));
    assert.ok(loaded.some((f) => /^"?Geist"?$/.test(f)), loaded.join(", "));

    // The presenting page (reveal shell, import map into ./stepdeck/) boots too.
    await ctx.open("index.html");
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.slides), ["title", "chart", "closing"]);
    assert.deepEqual(await page.evaluate(() => window.STEPDECK.errors), []);
    assert.deepEqual(ctx.failed, []);
  });
});

test("new-component in the new deck: its example slide validates and checks clean with --played", async () => {
  await newComponent(deck, "my.meter");
  const example = join(deck, "components/my.meter/example.js");
  const id = /id: "([^"]+)"/.exec(readFileSync(example, "utf8"))[1];
  copyFileSync(example, join(deck, `slides/${id}.js`));
  const deckFile = join(deck, "deck.js");
  writeFileSync(deckFile, readFileSync(deckFile, "utf8").replace(/slides: \[([^\]]*)\]/, (m, list) => `slides: [${list}, "${id}"]`));

  const validate = cli(["validate", "--slide", id], deck);
  assert.equal(validate.status, 0, validate.stdout + validate.stderr);
  const problems = await check(deck, { slide: id, played: true });
  assert.deepEqual(problems, [], show(problems));
});
