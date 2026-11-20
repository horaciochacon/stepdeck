// stepdeck validate (spec §10): Node only, no browser. One minimal fixture deck per rule under
// test/fixtures/validate/<case>/ (R6); the spike deck must validate clean.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validate } from "../../cli/validate.js";
import { copyEngine } from "../../cli/engine.js";
import { formatProblem } from "../../cli/problems.js";
import { cpSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const fixture = (name) => fileURLToPath(new URL(`../fixtures/validate/${name}/`, import.meta.url));
const spike = fileURLToPath(new URL("../../examples/spike/", import.meta.url));

const rules = (problems) => problems.map((p) => p.rule).sort();
const errors = (problems) => problems.filter((p) => p.severity !== "warning");
const only = (problems, rule) => {
  const found = problems.filter((p) => p.rule === rule);
  assert.equal(found.length, 1, `exactly one ${rule}: ${problems.map(formatProblem).join("\n")}`);
  return found[0];
};
const show = (problems) => problems.map(formatProblem).join("\n");

test("spike deck validates clean (no errors, no warnings)", async () => {
  const problems = await validate(spike);
  assert.deepEqual(problems, [], show(problems));
});

test("unknown prop suggests the nearest allowed key (serie_shown -> series_shown)", async () => {
  const problems = await validate(fixture("unknown-prop"));
  assert.deepEqual(rules(problems), ["unknown-prop"], show(problems));
  const p = problems[0];
  assert.equal(p.slide, "s");
  assert.equal(p.element, "chart");
  assert.match(p.measured, /serie_shown/);
  assert.match(p.fix, /series_shown/);
  assert.match(formatProblem(p), /^s\/chart · unknown-prop · .* vs .* · .*series_shown/);
});

test("advance longer than the steps left from its start", async () => {
  const problems = await validate(fixture("advance-overflow"));
  assert.deepEqual(rules(problems), ["advance-overflow"], show(problems));
  const p = problems[0];
  assert.equal(p.element, "chart");
  assert.match(p.measured, /4 values/);
  assert.match(p.limit, /2 steps/);
});

test("wrong-case data path is caught even on a case-insensitive file system", async () => {
  const problems = await validate(fixture("wrong-case"));
  assert.deepEqual(rules(problems), ["path-case"], show(problems));
  assert.match(problems[0].measured, /data\/Points\.csv/);
  assert.match(problems[0].fix, /data\/points\.csv/);
});

test("missing CSV column, with the nearest column suggested", async () => {
  const problems = await validate(fixture("missing-column"));
  assert.deepEqual(rules(problems), ["missing-column"], show(problems));
  assert.match(problems[0].measured, /yy/);
  assert.match(problems[0].limit, /x, y, group/);
  assert.match(problems[0].fix, /'y'/);
});

test("chart.bar: a missing interval column is reported at the step that names it, with the nearest column", async () => {
  const problems = await validate(fixture("missing-column-bar"));
  assert.deepEqual(rules(problems), ["missing-column"], show(problems));
  assert.equal(problems[0].element, "bars");
  assert.equal(problems[0].step, "two");
  assert.match(problems[0].measured, /interval\.upper = 'hi_'/);
  assert.match(problems[0].limit, /group, value, lo, hi/);
  assert.match(problems[0].fix, /'hi'/);
});

test("remote URLs, including protocol-relative //host, are rejected in props", async () => {
  const problems = await validate(fixture("remote-url"));
  assert.deepEqual(rules(problems), ["remote-url", "remote-url"], show(problems));
  assert.deepEqual(problems.map((p) => p.element).sort(), ["img", "link"]);
});

test("remote URLs in slide.style are rejected, with a style path and no element", async () => {
  const problems = await validate(fixture("remote-style"));
  assert.deepEqual(rules(problems), ["remote-url", "remote-url"], show(problems));
  for (const p of problems) {
    assert.equal(p.slide, "s");
    assert.equal(p.element, null);
    assert.match(p.measured, /^style has /);
  }
  assert.deepEqual(problems.map((p) => p.measured).sort(), [
    "style has //cdn.example.org/texture.png",
    "style has https://example.org/bg.png",
  ]);
});

test("@import in slide.style is rejected (replaceSync drops it)", async () => {
  const p = only(await validate(fixture("style-import")), "style-import");
  assert.equal(p.element, null);
  assert.match(p.measured, /^style has @import "extra\.css"/);
  assert.match(p.fix, /copy the rules into style/);
});

test("hex colors in props are rejected", async () => {
  const problems = await validate(fixture("hex-color"));
  assert.deepEqual(rules(problems), ["hex-color"], show(problems));
  assert.match(problems[0].measured, /#c0392b/);
});

test("a figure without a source element", async () => {
  const problems = await validate(fixture("figure-without-source"));
  assert.deepEqual(rules(problems), ["figure-source"], show(problems));
  assert.match(problems[0].fix, /role: "source"/);
});

test("props valid at step 0 but invalid at step 3 are reported at step 3", async () => {
  const problems = await validate(fixture("invalid-at-step"));
  assert.deepEqual(rules(problems), ["prop-invalid"], show(problems));
  const p = problems[0];
  assert.equal(p.element, "chart");
  assert.equal(p.step, "d");
  assert.match(p.measured, /highlight/);
});

test("(a) step ids made of digits are an error", async () => {
  const problems = await validate(fixture("numeric-step-id"));
  assert.deepEqual(rules(problems), ["step-id-numeric"], show(problems));
  assert.equal(problems[0].step, "1");
});

test("(b) duplicate element ids", async () => {
  const problems = await validate(fixture("duplicate-id"));
  assert.deepEqual(rules(problems), ["duplicate-id"], show(problems));
  assert.equal(problems[0].element, "note");
});

test("(c) a set that makes props null is an error at that step", async () => {
  const problems = await validate(fixture("props-null"));
  assert.deepEqual(rules(problems), ["props-not-object"], show(problems));
  assert.equal(only(problems, "props-not-object").step, "b");
});

test("(d) a patch naming an unknown element is an error at that step, once", async () => {
  const problems = await validate(fixture("unknown-element"));
  assert.deepEqual(rules(problems), ["unknown-element"], show(problems));
  const p = problems[0];
  assert.equal(p.step, "b");
  assert.match(p.measured, /nte/);
  assert.match(p.fix, /'note'/);
});

test("(e) a deck component named like a built-in is an error even when unused", async () => {
  const problems = await validate(fixture("collision"));
  assert.deepEqual(rules(problems), ["component-collision"], show(problems));
  assert.match(problems[0].fix, /namespace/);
});

test("(f) a deck component schema that does not compile", async () => {
  const problems = await validate(fixture("bad-component-schema"));
  assert.deepEqual(rules(problems), ["component-schema"], show(problems));
  assert.match(problems[0].measured, /fixture\.box/);
});

test("(g) the theme palette must pass checkPalette against the theme background", async () => {
  const problems = await validate(fixture("bad-palette"));
  assert.deepEqual(rules(problems), ["palette-contrast"], show(problems));
  assert.match(problems[0].element, /pale\/yellow/);
});

test("(f) a built-in schema that does not compile is an error even when unused", async () => {
  const problems = await validate(fixture("bad-builtin-schema"));
  assert.deepEqual(rules(problems), ["component-schema"], show(problems));
  assert.match(problems[0].measured, /fixture\.broken.*\(engine\)/);
});

test("a step that changes nothing is a warning, not an error", async () => {
  const problems = await validate(fixture("noop-step"));
  assert.deepEqual(rules(problems), ["noop-step"], show(problems));
  assert.equal(problems[0].severity, "warning");
  assert.equal(problems[0].step, "b");
  assert.deepEqual(errors(problems), []);
});

test("bindings: missing file, missing pointer, bad format", async () => {
  const problems = await validate(fixture("bad-binding"));
  assert.deepEqual(rules(problems), ["binding-file", "binding-format", "binding-pointer"], show(problems));
  assert.equal(only(problems, "binding-file").element, "nofile");
  assert.equal(only(problems, "binding-pointer").element, "nopointer");
  assert.equal(only(problems, "binding-format").element, "badformat");
});

test("from naming an unknown step, with the nearest step id suggested", async () => {
  const problems = await validate(fixture("bad-step-ref"));
  assert.deepEqual(rules(problems), ["step-ref"], show(problems));
  assert.match(problems[0].fix, /'three'/);
});

test("unknown key in the slide spec suggests the nearest allowed key", async () => {
  const problems = await validate(fixture("unknown-key"));
  assert.deepEqual(rules(problems), ["unknown-key"], show(problems));
  assert.equal(problems[0].element, "lead");
  assert.match(problems[0].fix, /'region'/);
});

test("unknown component type suggests the nearest component", async () => {
  const problems = await validate(fixture("unknown-component"));
  assert.deepEqual(rules(problems), ["unknown-component"], show(problems));
  assert.match(problems[0].fix, /"chart\.line"/);
});

test("unknown region for the layout", async () => {
  const problems = await validate(fixture("unknown-region"));
  assert.deepEqual(rules(problems), ["unknown-region"], show(problems));
  assert.match(problems[0].fix, /"notes"/);
});

test("validate --slide limits the run to one slide", async () => {
  assert.deepEqual(await validate(spike, { slide: "trend" }), []);
  await assert.rejects(validate(spike, { slide: "nope" }), /unknown slide 'nope'/);
});

// ---- CLI ----
const cli = (...args) => spawnSync(process.execPath, ["cli/index.js", "validate", ...args], { cwd: repo, encoding: "utf8" });

test("cli: spike exits 0 and says so", () => {
  const r = cli("examples/spike");
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /validate: 5 slides, 0 errors, 0 warnings/);
});

test("cli: errors exit 1 with one line per problem; --json gives the problems", () => {
  const r = cli("test/fixtures/validate/missing-column");
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /^s\/chart · missing-column · .+ vs .+ · .+$/m);
  const j = cli("test/fixtures/validate/missing-column", "--json");
  assert.equal(j.status, 1);
  const out = JSON.parse(j.stdout);
  assert.deepEqual(out.map((p) => p.rule), ["missing-column"]);
  assert.equal(out[0].severity, "error");
});

test("cli: warnings are printed but do not fail", () => {
  const r = cli("test/fixtures/validate/noop-step");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^warning: s\/b · noop-step · /m);
  assert.match(r.stdout, /0 errors, 1 warning/);
});

test("cli: a missing deck is a usage-level failure (exit 2)", () => {
  const r = cli("test/fixtures/validate/does-not-exist");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /deck\.js/);
});

test("cli: validate rejects --step (it checks every step of a slide) instead of ignoring it", () => {
  const r = cli("examples/spike", "--slide", "trend", "--step", "focus");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /validate does not take --step/);
  const serve = spawnSync(process.execPath, ["cli/index.js", "serve", "examples/spike", "--step", "focus"], { cwd: repo, encoding: "utf8" });
  assert.equal(serve.status, 2, serve.stdout + serve.stderr);
  assert.match(serve.stderr, /serve does not take --step/);
});

test("diagram: an id in shown that matches nothing is diagram-id, at the step that names it", async () => {
  const problems = await validate(fixture("diagram-unknown-id"));
  assert.deepEqual(rules(problems), ["diagram-id"], show(problems));
  const p = problems[0];
  assert.equal(p.element, "flow");
  assert.equal(p.step, "two");
  assert.match(p.measured, /nope/);
  assert.match(p.limit, /'a'/);
  assert.match(formatProblem(p), /^s\/flow\/two · diagram-id · /);
});

test("diagram: sibling groups that share a cell are diagram-overlap", async () => {
  const problems = await validate(fixture("diagram-overlap"));
  assert.deepEqual(rules(problems), ["diagram-overlap"], show(problems));
  assert.equal(problems[0].element, "flow");
  assert.match(problems[0].measured, /left/);
  assert.match(problems[0].measured, /wide/);
});

// Kicker and accent phrase (default-theme spec §5.4, §10.4, §10.5).
test("title-accent: an unmatched * in a title is a warning", async () => {
  const problems = await validate(fixture("title-accent"));
  assert.deepEqual(rules(problems), ["title-accent"], show(problems));
  const p = problems[0];
  assert.equal(p.severity, "warning");
  assert.equal(p.slide, "s");
  assert.equal(p.element, "title");
  assert.match(p.measured, /\*fast/);
  assert.match(p.fix, /\\\*/);
});

test("accent-empty: an empty accent phrase ** in a title is a warning", async () => {
  const problems = await validate(fixture("accent-empty"));
  assert.deepEqual(rules(problems), ["accent-empty"], show(problems));
  const p = problems[0];
  assert.equal(p.severity, "warning");
  assert.equal(p.element, "title");
  assert.match(p.measured, /\*\*bold\*\*/);
  assert.match(p.fix, /\\\*\\\*/);
  assert.match(p.fix, /\*phrase\*/);
});

test("reserved-id: an author element with the id kicker is an error", async () => {
  const problems = await validate(fixture("reserved-id"));
  assert.deepEqual(rules(problems), ["reserved-id"], show(problems));
  const p = problems[0];
  assert.equal(p.severity, "error");
  assert.equal(p.element, "kicker");
  assert.match(p.fix, /rename/);
});

test("kicker-no-region: section on a layout without a title region is a warning, not unknown-region", async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "stepdeck-kicker-")));
  try {
    cpSync(fixture("kicker-no-region"), tmp, { recursive: true });
    copyEngine(join(tmp, "stepdeck"));
    cpSync(join(repo, "test/fixtures/no-title-layout"), join(tmp, "stepdeck/layouts/main-only"), { recursive: true });
    const problems = await validate(tmp);
    assert.deepEqual(rules(problems), ["kicker-no-region"], show(problems));
    const p = problems[0];
    assert.equal(p.severity, "warning");
    assert.equal(p.slide, "s");
    assert.match(p.measured, /Methods/);
    assert.match(p.limit, /main-only/);
    assert.match(p.fix, /ignored/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("lede-on-cover: a lede on a cover layout is a warning that points at the subtitle region", async () => {
  const problems = await validate(fixture("lede-on-cover"));
  assert.deepEqual(rules(problems), ["lede-on-cover"], show(problems));
  const p = problems[0];
  assert.equal(p.severity, "warning");
  assert.equal(p.slide, "s");
  assert.match(p.measured, /lede/);
  assert.match(p.limit, /title/);
  assert.match(p.fix, /subtitle region/);
});

test("layout schema hooks: a key that is not a declared region, and a value that is not a region hook", async () => {
  const region = await validate(fixture("layout-hook-region"));
  assert.deepEqual(rules(region), ["layout-schema"], show(region));
  assert.match(region[0].measured, /hooks names region 'aside'/);
  const value = await validate(fixture("layout-hook-value"));
  assert.deepEqual(rules(value), ["layout-schema"], show(value));
  assert.match(value[0].measured, /hooks maps 'main' to 'title'/);
  assert.match(value[0].limit, /subtitle, meta, statement/);
});

test("ghost-collapse: a ghost on a collapsing element is an error", async () => {
  const problems = await validate(fixture("ghost-collapse"));
  assert.deepEqual(rules(problems), ["ghost-collapse"], show(problems));
  const p = problems[0];
  assert.equal(p.severity, "error");
  assert.equal(p.element, "note");
  assert.match(p.fix, /remove collapse, or remove ghost/);
});

test("an unknown motion name gets one schema problem suggesting the nearest name", async () => {
  const problems = await validate(fixture("bad-motion"));
  assert.deepEqual(rules(problems), ["spec-invalid"], show(problems));
  assert.equal(problems[0].element, "note");
  assert.match(problems[0].fix, /rise/);
});

test("enter and exit objects and a ghost label validate clean", async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "stepdeck-motion-")));
  try {
    cpSync(fixture("bad-motion"), tmp, { recursive: true });
    writeFileSync(join(tmp, "slides", "s.js"), `export default {
  id: "s", title: "Motion objects",
  elements: [
    { id: "p", type: "text", props: { text: "Hello." }, from: 1, enter: { motion: "pop", delay: 120 }, exit: { motion: "fade", duration: 200 }, ghost: "2 · Adjust" },
    { id: "q", type: "text", props: { text: "World." }, from: 1, ghost: true, enter: "draw" },
  ],
  steps: [{ id: "a" }, { id: "b" }],
};
`);
    const problems = await validate(tmp);
    assert.deepEqual(problems, [], show(problems));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

/** Validates the bad-motion deck with its slide's elements and steps replaced (written to a temporary copy). */
async function validateSlideBody(body) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "stepdeck-motion-")));
  try {
    cpSync(fixture("bad-motion"), tmp, { recursive: true });
    writeFileSync(join(tmp, "slides", "s.js"), `export default { id: "s", title: "Motion", ${body} };\n`);
    return await validate(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test("an object-form enter reports its own problem: an unknown motion name gets a did-you-mean", async () => {
  const problems = await validateSlideBody(`elements: [{ id: "note", type: "text", props: { text: "Hello." }, enter: { motion: "rize" } }]`);
  const p = only(problems, "spec-invalid");
  assert.equal(problems.length, 1, show(problems));
  assert.equal(p.element, "note");
  assert.match(p.measured, /^enter\.motion = "rize"$/);
  assert.match(p.limit, /one of "fade", "rise"/);
  assert.match(p.fix, /set enter\.motion to "rise"/);
  assert.doesNotMatch(`${p.limit} ${p.fix}`, /or an object/, "the value is an object already");
});

test("an object-form enter or exit over its bounds names the bound, and an unknown key gets a did-you-mean", async () => {
  const problems = await validateSlideBody(`elements: [
    { id: "late", type: "text", props: { text: "Late." }, enter: { motion: "rise", delay: 6000 } },
    { id: "slow", type: "text", props: { text: "Slow." }, exit: { motion: "fade", duration: 7000 } },
    { id: "typo", type: "text", props: { text: "Typo." }, enter: { motion: "pop", dealy: 100 } },
  ]`);
  assert.deepEqual(rules(problems), ["spec-invalid", "spec-invalid", "unknown-key"], show(problems));
  const late = problems.find((p) => p.element === "late");
  assert.match(late.measured, /^enter\.delay = 6000$/);
  assert.match(late.limit, /<= 5000/);
  const slow = problems.find((p) => p.element === "slow");
  assert.match(slow.measured, /^exit\.duration = 7000$/);
  assert.match(slow.limit, /<= 5000/);
  const typo = problems.find((p) => p.element === "typo");
  assert.match(typo.fix, /rename 'dealy' to 'delay'/);
});

test("transition.stagger is at most 1000 ms and transition.duration at most 5000 ms", async () => {
  const problems = await validateSlideBody(`elements: [{ id: "note", type: "text", props: { text: "Hello." }, from: "b" }],
    steps: [{ id: "a" }, { id: "b", transition: { stagger: 1500, duration: 6000 } }]`);
  assert.deepEqual(rules(problems), ["spec-invalid", "spec-invalid"], show(problems));
  assert.deepEqual(problems.map((p) => p.step), ["b", "b"]);
  assert.ok(problems.some((p) => /transition\.stagger = 1500/.test(p.measured) && /<= 1000/.test(p.limit)), show(problems));
  assert.ok(problems.some((p) => /transition\.duration = 6000/.test(p.measured) && /<= 5000/.test(p.limit)), show(problems));
});

test("motion-budget: an element whose hold plus entrance reaches 8000 ms is a warning; box, list build and count-up", async () => {
  const problems = await validate(fixture("motion-budget"));
  assert.deepEqual(rules(problems), ["motion-budget", "motion-budget", "motion-budget"], show(problems));
  const at = Object.fromEntries(problems.map((p) => [p.element, p]));
  assert.deepEqual(Object.keys(at).sort(), ["c", "n", "tasks"]);
  for (const p of problems) {
    assert.equal(p.severity, "warning");
    assert.equal(p.step, "go");
    assert.match(p.limit, /8000 ms/);
    assert.match(p.fix, /delay|duration|stagger/);
    assert.match(p.fix, /split the step/);
  }
  assert.match(at.c.measured, /slot 2/);
  assert.match(at.c.measured, /8200 ms/);
  assert.match(at.tasks.measured, /8400 ms/, "six items, 1000 ms apart, after a 3000 ms hold");
  assert.match(at.n.measured, /8100 ms/, "the count-up is 2.25 x --sd-duration");
});

test("motion-budget: the same entrances a little earlier are clean", async () => {
  const problems = await validate(fixture("motion-budget-under"));
  assert.deepEqual(problems, [], show(problems));
});

test("motion-budget: no hold on a step of duration 0, and an owned chart's explicit duration is not doubled", async () => {
  const snap = await validateSlideBody(`elements: [
    { id: "a", type: "text", props: { text: "x" }, from: "b", enter: { motion: "rise", delay: 5000, duration: 5000 } },
  ], steps: [{ id: "a0" }, { id: "b", transition: { duration: 0 } }]`);
  assert.deepEqual(snap, [], show(snap));
  const own = await validateSlideBody(`elements: [
    { id: "n", type: "big-number", props: { value: 1, format: "d" }, from: "b", enter: { motion: "draw", delay: 4000, duration: 3900 } },
    { id: "src", type: "text", props: { role: "source", text: "Synthetic." } },
  ], steps: [{ id: "a0" }, { id: "b" }]`);
  assert.deepEqual(own, [], show(own));
});

test("exit-delay-ignored: an exit object with a delay is a warning (exits start at once)", async () => {
  const problems = await validate(fixture("exit-delay"));
  assert.deepEqual(rules(problems), ["exit-delay-ignored"], show(problems));
  const p = problems[0];
  assert.equal(p.severity, "warning");
  assert.equal(p.element, "note");
  assert.match(p.measured, /delay/);
  assert.match(p.limit, /t = 0/);
  assert.match(p.fix, /remove delay/);
});
