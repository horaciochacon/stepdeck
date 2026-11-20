// The contract between layouts, themes and core (default-theme spec §5.2, §10.1):
//   - layout CSS is placement only: no colour, font, font family, weight, style, letter-spacing,
//     text-transform, line-height, text-align or -webkit-text-fill-color, no --sd-* custom property,
//     no !important, and font-size only as var(--sd-…);
//   - a layout schema's `hooks` map names real regions and published hooks; `kind` is a layout kind;
//   - a theme's theme.css targets hooks, never [data-layout] or [data-region], and never !important.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createAjv, compile } from "../../cli/ajv.js";
import { classifyErrors } from "../../cli/check.js";
import * as constants from "#engine/core/constants.js";

// A namespace import, so a missing export fails the tests that use it rather than the whole file.
const { HOOKS = [], REGION_HOOKS = [], LAYOUT_KINDS = [], LAYER_ORDER } = constants;

const repo = new URL("../../", import.meta.url);
const engine = new URL("../../engine/", import.meta.url);
const dirs = (url) => readdirSync(url, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const layoutDirs = [
  ...dirs(new URL("layouts/", engine)).map((n) => new URL(`layouts/${n}/`, engine)),
  new URL("test/fixtures/fourth-layout/", repo),
];
const read = (url) => readFileSync(url, "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const FORBIDDEN = new Set([
  "color", "font", "font-family", "font-weight", "font-style", "letter-spacing", "text-transform",
  "line-height", "text-align", "-webkit-text-fill-color",
]);

/** Every way `css` breaks the placement-only rule, one line each ([] when it is clean). */
function placementViolations(css) {
  const out = [];
  const text = stripComments(css);
  if (/!\s*important/i.test(text)) out.push("!important");
  // Innermost declaration blocks: layouts do not nest rules, and an at-rule's inner rules are innermost too.
  for (const [, block] of text.matchAll(/\{([^{}]*)\}/g)) {
    for (const decl of block.split(";")) {
      const m = /^\s*([-\w]+)\s*:\s*([\s\S]*?)\s*$/.exec(decl);
      if (!m) continue;
      const prop = m[1].toLowerCase();
      const value = m[2];
      if (FORBIDDEN.has(prop)) out.push(`${prop}: ${value}`);
      else if (prop.startsWith("--sd-")) out.push(`${prop} (an --sd-* custom property)`);
      else if (prop === "font-size" && !/^var\(--sd-[\w-]+\)$/.test(value)) out.push(`font-size: ${value} (only var(--sd-…) with no fallback)`);
    }
  }
  return out;
}

test("the placement scan itself: what it rejects and what it lets through", () => {
  assert.deepEqual(placementViolations("a { background-color: red; border-color: blue; grid-area: x }"), []);
  assert.deepEqual(placementViolations("/* color: red; font-weight: 700 */ a { padding: 0 }"), [], "comments are stripped");
  assert.deepEqual(placementViolations("a { font-size: var(--sd-font-size-note) }"), []);
  assert.deepEqual(placementViolations("a { color: red }"), ["color: red"]);
  assert.deepEqual(placementViolations("a{font-weight:600}"), ["font-weight: 600"]);
  assert.deepEqual(placementViolations("a { letter-spacing: -0.02em; text-transform: uppercase }"), ["letter-spacing: -0.02em", "text-transform: uppercase"]);
  assert.deepEqual(placementViolations("a { font: 600 40px x }"), ["font: 600 40px x"]);
  assert.deepEqual(placementViolations("a { --sd-color-ink: #000 }"), ["--sd-color-ink (an --sd-* custom property)"]);
  assert.deepEqual(placementViolations("a { --notes-width: 600px }"), [], "a layout's own grid variable is fine");
  assert.deepEqual(placementViolations("a { font-size: 64px }"), ["font-size: 64px (only var(--sd-…) with no fallback)"]);
  assert.deepEqual(placementViolations("a { font-size: var(--sd-x, 64px) }"), ["font-size: var(--sd-x, 64px) (only var(--sd-…) with no fallback)"]);
  assert.deepEqual(placementViolations("a { display: none !important }"), ["!important"]);
  assert.deepEqual(
    placementViolations("a { line-height: 1.2; text-align: center; -webkit-text-fill-color: red; justify-content: center }"),
    ["line-height: 1.2", "text-align: center", "-webkit-text-fill-color: red"],
  );
  assert.deepEqual(placementViolations("@container x (width < 10px) { a { color: red } }"), ["color: red"]);
});

for (const dir of layoutDirs) {
  const name = dir.pathname.split("/").filter(Boolean).at(-1);
  test(`layout ${name}: layout CSS is placement only`, () => {
    assert.deepEqual(placementViolations(read(new URL("layout.css", dir))), []);
  });
}

test("schema/layout.schema.json publishes exactly REGION_HOOKS and LAYOUT_KINDS", () => {
  const schema = JSON.parse(read(new URL("schema/layout.schema.json", engine)));
  assert.deepEqual(HOOKS, ["title", "kicker", "lede", "accent", "subtitle", "meta", "statement"]);
  assert.deepEqual(LAYOUT_KINDS, ["content", "cover"]);
  assert.deepEqual(REGION_HOOKS, ["subtitle", "meta", "statement"]);
  assert.ok(REGION_HOOKS.every((h) => HOOKS.includes(h)), "every region hook is a published hook");
  assert.deepEqual(schema.properties.hooks?.additionalProperties?.enum, REGION_HOOKS);
  assert.deepEqual(schema.properties.kind?.enum, LAYOUT_KINDS);
  assert.equal(schema.properties.kind.default, "content");
});

test("layout schemas validate: hooks name real regions and published hooks, kind is a layout kind", () => {
  const ajv = createAjv();
  const validate = compile(ajv, JSON.parse(read(new URL("schema/layout.schema.json", engine))));
  for (const dir of layoutDirs) {
    const schema = JSON.parse(read(new URL("schema.json", dir)));
    assert.ok(validate(schema), `${schema.name}: ${ajv.errorsText(validate.errors)}`);
    const regions = schema.regions.map((r) => r.name);
    for (const [region, hook] of Object.entries(schema.hooks ?? {})) {
      assert.ok(regions.includes(region), `${schema.name}: hooks names region '${region}', not one of ${regions.join(", ")}`);
      assert.ok(REGION_HOOKS.includes(hook), `${schema.name}: hook '${hook}' is not a region hook`);
    }
    assert.ok(LAYOUT_KINDS.includes(schema.kind ?? "content"), `${schema.name}: kind '${schema.kind}'`);
  }
  const title = JSON.parse(read(new URL("layouts/title/schema.json", engine)));
  assert.equal(title.kind, "cover");
  assert.deepEqual(title.hooks, { subtitle: "subtitle", meta: "meta" });
  const statement = JSON.parse(read(new URL("layouts/statement/schema.json", engine)));
  assert.deepEqual(statement.hooks, { main: "statement" });
  assert.equal(statement.kind ?? "content", "content");
});

test("theme.css targets hooks only: never [data-layout], [data-region] or !important", () => {
  const themes = dirs(new URL("themes/", engine));
  assert.ok(existsSync(new URL("themes/academic-light/theme.css", engine)), "academic-light ships a theme.css");
  for (const t of themes) {
    const file = new URL(`themes/${t}/theme.css`, engine);
    if (!existsSync(file)) continue;
    const css = stripComments(read(file));
    assert.doesNotMatch(css, /\[data-layout/, `${t}/theme.css targets a layout`);
    assert.doesNotMatch(css, /\[data-region/, `${t}/theme.css targets a region`);
    assert.doesNotMatch(css, /!\s*important/i, `${t}/theme.css uses !important`);
  }
});

test("core/stepdeck.css opens with LAYER_ORDER", () => {
  const css = stripComments(read(new URL("core/stepdeck.css", engine)));
  const first = /@layer[^;{]*;/.exec(css)?.[0];
  assert.equal(first, LAYER_ORDER);
  assert.equal(LAYER_ORDER, "@layer sd-core, sd-layout, sd-theme, sd-deck, sd-slide;");
});

test("schema/stepdeck.d.ts: LayoutDescriptor's hook union is REGION_HOOKS, and kind is LAYOUT_KINDS", () => {
  const dts = read(new URL("schema/stepdeck.d.ts", engine));
  const union = (re) => [...(re.exec(dts)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(union(/hooks\?:\s*\{\s*\[region: string\]:\s*([^};]+)\}/), REGION_HOOKS);
  assert.deepEqual(union(/kind\?:\s*([^;]+);/), LAYOUT_KINDS);
});

test("check: a 404 on an optional theme.css is not a network-error; tokens.css and other failures are", () => {
  const rules = (failed) => classifyErrors({ failed }).map((p) => p.line);
  assert.deepEqual(rules(["404 /stepdeck/themes/plain/theme.css", "404 themes/academic-light/theme.css"]), []);
  assert.deepEqual(rules(["404 /stepdeck/themes/plain/tokens.css"]), ["404 /stepdeck/themes/plain/tokens.css"]);
  assert.deepEqual(rules(["500 /themes/plain/theme.css"]), ["500 /themes/plain/theme.css"], "only a 404 means absent");
  assert.deepEqual(rules(["404 /data/theme.css", "404 /themes/a/b/theme.css"]), ["404 /data/theme.css", "404 /themes/a/b/theme.css"]);
  assert.deepEqual(classifyErrors({ failed: ["404 /stepdeck/themes/plain/tokens.css"] }).map((p) => p.rule), ["network-error"]);
});
