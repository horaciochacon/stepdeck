// Every built-in schema compiles with the shared Ajv setup (R16): component props schemas are JSON
// Schemas (2020-12, with x- annotation keywords); layout schema.json files are descriptors and must
// match schema/layout.schema.json. The deck and slide schemas compile and accept the spike deck.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createAjv, readSchema } from "../../cli/ajv.js";

const root = new URL("../../", import.meta.url);
const folders = (dir) =>
  readdirSync(new URL(dir, root), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();

test("every built-in component and layout schema compiles", () => {
  const ajv = createAjv();
  const components = folders("components/");
  assert.ok(components.length >= 5);
  for (const name of components) {
    const schema = JSON.parse(readFileSync(new URL(`components/${name}/schema.json`, root), "utf8"));
    assert.doesNotThrow(() => ajv.compile(schema), `components/${name}/schema.json`);
  }
  const layoutSchema = ajv.compile(readSchema("layout"));
  const layouts = folders("layouts/");
  assert.ok(layouts.length >= 3);
  for (const name of layouts) {
    const schema = JSON.parse(readFileSync(new URL(`layouts/${name}/schema.json`, root), "utf8"));
    assert.ok(layoutSchema(schema), `layouts/${name}/schema.json: ${JSON.stringify(layoutSchema.errors)}`);
  }
  for (const name of ["deck", "slide"]) assert.doesNotThrow(() => ajv.compile(readSchema(name)), name);
});

test("a schema with an unknown type does not compile", () => {
  assert.throws(() => createAjv().compile({ type: "object", properties: { a: { type: "strng" } } }));
});
