// The one Ajv setup every stepdeck tool shares (ruling R16). Dev tooling only: core/ never imports Ajv.
//
// createAjv() -> Ajv2020 instance: strict, allErrors (report every problem, not the first), verbose
//   (errors carry parentSchema, so did-you-mean can list the allowed keys). Annotation keywords that
//   stepdeck schemas use (`x-transition` on props, `x-enter` at the top level, and any other `x-*` found in
//   a schema passed to compile()) are registered as no-op keywords, so strict mode still rejects real typos.
// compile(ajv, schema) -> validate function; registers the schema's `x-*` keywords first.
// readSchema(name) -> parsed engine/schema/<name>.schema.json ("deck", "slide", "layout").
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { ENGINE } from "./engine.js";

const ANNOTATIONS = ["x-transition", "x-enter"];
const registered = new WeakMap(); // ajv -> Set of annotation keywords added

function annotate(ajv, keyword) {
  const known = registered.get(ajv);
  if (known.has(keyword)) return;
  ajv.addKeyword(keyword);
  known.add(keyword);
}

export function createAjv() {
  const ajv = new Ajv2020({ allErrors: true, verbose: true, strict: true });
  registered.set(ajv, new Set());
  for (const k of ANNOTATIONS) annotate(ajv, k);
  return ajv;
}

function annotationKeywords(node, out = new Set()) {
  if (Array.isArray(node)) for (const v of node) annotationKeywords(v, out);
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith("x-")) out.add(k);
      annotationKeywords(v, out);
    }
  }
  return out;
}

export function compile(ajv, schema) {
  for (const k of annotationKeywords(schema)) annotate(ajv, k);
  return ajv.compile(schema);
}

export function readSchema(name) {
  return JSON.parse(readFileSync(join(ENGINE, "schema", `${name}.schema.json`), "utf8"));
}
