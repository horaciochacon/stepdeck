// Every built-in layout folder is complete and its schema has the documented shape (spec §6.1, §7).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createAjv, compile } from "../../cli/ajv.js";

const root = new URL("../../engine/layouts/", import.meta.url);
const folders = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();

test("built-in layouts: full-bleed, figure-notes, halves, statement and title", () => {
  for (const name of ["figure-notes", "full-bleed", "halves", "statement", "title"]) assert.ok(folders.includes(name), name);
});

for (const name of folders) {
  test(`layout ${name}: layout.css, schema.json, example.js and README.md, consistent`, async () => {
    for (const f of ["layout.css", "schema.json", "example.js", "README.md"]) {
      assert.ok(existsSync(new URL(`${name}/${f}`, root)), `${name}/${f}`);
    }
    const schema = JSON.parse(readFileSync(new URL(`${name}/schema.json`, root), "utf8"));
    const keys = Object.keys(schema).filter((k) => k !== "hooks" && k !== "kind").sort(); // hooks, kind: optional
    assert.deepEqual(keys, ["description", "name", "regions", "variables"]);
    assert.equal(schema.name, name);
    assert.ok(schema.description);
    assert.ok(schema.regions.length > 0);
    for (const r of schema.regions) assert.deepEqual(Object.keys(r).sort(), ["description", "name"]);
    for (const v of schema.variables) {
      assert.deepEqual(Object.keys(v).sort(), ["default", "description", "name"]);
      assert.match(v.name, /^--[a-z-]+$/);
    }
    const css = readFileSync(new URL(`${name}/layout.css`, root), "utf8");
    const readme = readFileSync(new URL(`${name}/README.md`, root), "utf8");
    for (const v of schema.variables) {
      assert.ok(css.includes(`var(${v.name}, ${v.default})`), `${name}: layout.css reads ${v.name} with default ${v.default}`);
      assert.ok(readme.includes(`\`${v.name}\``), `${name}: README documents ${v.name}`);
    }
    for (const r of schema.regions) assert.ok(readme.includes(`\`${r.name}\``), `${name}: README documents region ${r.name}`);
    assert.doesNotMatch(css, /gradient\(/, "no gradients");
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,6}\b|rgb\(/, "colors come from theme tokens");
    // The example imports in plain Node, uses this layout and only its regions.
    const { default: example } = await import(new URL(`${name}/example.js`, root));
    assert.equal(example.layout, name);
    const regions = schema.regions.map((r) => r.name);
    for (const el of example.elements ?? []) assert.ok(regions.includes(el.region ?? "main"), `${el.id} in ${el.region}`);
    // Every example element's props validate against its component's schema, so a broken example fails here.
    const ajv = createAjv();
    for (const el of example.elements ?? []) {
      const schemaUrl = new URL(`../../engine/components/${el.type}/schema.json`, import.meta.url);
      assert.ok(existsSync(schemaUrl), `${el.id}: component ${el.type} exists`);
      const validate = compile(ajv, JSON.parse(readFileSync(schemaUrl, "utf8")));
      assert.ok(validate(el.props ?? {}), `${name}/${el.id} (${el.type}) props: ${ajv.errorsText(validate.errors)}`);
    }
  });
}

test("theme tokens: relative font URLs are rebased onto the tokens.css URL; others are kept", async () => {
  const { rebaseCssUrls } = await import("#engine/core/stepdeck.js");
  const base = "http://127.0.0.1:8000/themes/academic-light/tokens.css";
  const css = `a{src:url("fonts/a.woff2")} b{src:url(fonts/b.woff2)} c{src:url('../x/c.woff2')} d{background:url(data:image/png;base64,AA)} e{src:url(/root.woff2)} f{filter:url(#f)}`;
  assert.equal(
    rebaseCssUrls(css, base),
    `a{src:url("http://127.0.0.1:8000/themes/academic-light/fonts/a.woff2")} b{src:url("http://127.0.0.1:8000/themes/academic-light/fonts/b.woff2")} c{src:url("http://127.0.0.1:8000/themes/x/c.woff2")} d{background:url(data:image/png;base64,AA)} e{src:url(/root.woff2)} f{filter:url(#f)}`,
  );
  // The shipped theme declares its faces with relative URLs that exist on disk.
  const tokens = readFileSync(new URL("../../engine/themes/academic-light/tokens.css", import.meta.url), "utf8");
  const urls = [...tokens.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 12);
  for (const u of urls) {
    assert.match(u, /^fonts\/(source-sans-3|ibm-plex-mono)\/[\w-]+\.woff2$/);
    assert.ok(existsSync(new URL(`../../engine/themes/academic-light/${u}`, import.meta.url)), u);
  }
  const copyright = {
    "source-sans-3": "Copyright 2010-2020 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'.",
    "ibm-plex-mono": "Copyright © 2017 IBM Corp. with Reserved Font Name 'Plex'.",
  };
  for (const [f, line] of Object.entries(copyright)) {
    const ofl = readFileSync(new URL(`../../engine/themes/academic-light/fonts/${f}/OFL.txt`, import.meta.url), "utf8");
    assert.equal(ofl.split("\n")[0], line, `${f}: upstream copyright line first`);
    assert.doesNotMatch(ofl, /^Google Inc\.$/m);
    assert.match(ofl, /SIL OPEN FONT LICENSE Version 1\.1/);
  }
  assert.match(tokens, /font-display: block/);
  assert.doesNotMatch(tokens, /font-display: (swap|fallback|optional|auto)/);
});

test("loadFonts: a face that fails to load is reported with its family and declared URLs", async () => {
  const { loadFonts } = await import("#engine/core/stepdeck.js");
  const face = (family, weight, ok) => ({
    family: `"${family}"`, weight, style: "normal", status: "unloaded",
    load: () => (ok ? Promise.resolve() : Promise.reject(new Error("NetworkError"))),
  });
  const doc = { fonts: [face("Good Sans", "400", true), face("Lost Sans", "600", false)] };
  const css = `@font-face { font-family: "Lost Sans"; font-style: normal; font-weight: 600; src: url("http://h/fonts/lost-600.woff2") format("woff2"); }
@font-face { font-family: "Lost Sans"; font-style: normal; font-weight: 400; src: url("http://h/fonts/lost-400.woff2") format("woff2"); }`;
  assert.deepEqual(await loadFonts(doc, css), [
    "font 'Lost Sans' 600 normal failed to load (http://h/fonts/lost-600.woff2)",
  ]);
  assert.deepEqual(await loadFonts({}, css), [], "no FontFaceSet (Node): nothing to load");
});
