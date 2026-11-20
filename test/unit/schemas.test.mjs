// Every built-in schema compiles with the shared Ajv setup (R16): component props schemas are JSON
// Schemas (2020-12, with x- annotation keywords); layout schema.json files are descriptors and must
// match schema/layout.schema.json. The deck and slide schemas compile and accept the spike deck.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createAjv, readSchema } from "../../cli/ajv.js";

const root = new URL("../../engine/", import.meta.url);
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

test("the slide schema takes motion names and objects, and bounds delay and duration", () => {
  const validate = createAjv().compile(readSchema("slide"));
  const slide = (extra) => ({ id: "s", elements: [{ id: "a", type: "text", ...extra }] });
  assert.ok(validate(slide({ enter: "pop", exit: "none" })), JSON.stringify(validate.errors));
  assert.ok(validate(slide({ enter: { motion: "rise", delay: 120, duration: 5000 } })), JSON.stringify(validate.errors));
  assert.ok(validate(slide({ ghost: true })) && validate(slide({ ghost: "Next" })), JSON.stringify(validate.errors));
  assert.equal(validate(slide({ enter: { motion: "rise", delay: 6000 } })), false, "delay over 5000");
  assert.equal(validate(slide({ exit: { motion: "fade", duration: -1 } })), false, "negative duration");
  assert.equal(validate(slide({ enter: { delay: 100 } })), false, "motion is required");
  assert.equal(validate(slide({ enter: { motion: "rise", speed: 2 } })), false, "no extra keys");
  assert.equal(validate(slide({ enter: "rize" })), false);
  assert.equal(validate(slide({ ghost: "" })), false, "empty ghost label");
});
