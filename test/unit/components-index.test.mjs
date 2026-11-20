import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";

const root = new URL("../../engine/components/", import.meta.url);

test("components/index.json lists exactly the built-in component folders", () => {
  const listed = JSON.parse(readFileSync(new URL("index.json", root), "utf8"));
  const folders = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(new URL(`${d.name}/index.js`, root)))
    .map((d) => d.name)
    .sort();
  assert.deepEqual([...listed].sort(), folders);
  assert.ok(listed.includes("text"));
});
