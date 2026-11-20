// --min-audience-font (spec name) and --sd-min-audience-font (theme prefix) are one value: the
// prefixed token is an alias, so a theme author who edits either one changes what `check` measures
// (check reads --sd-min-audience-font, which resolves through the alias).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const themes = fileURLToPath(new URL("../../themes/", import.meta.url));
const check = readFileSync(fileURLToPath(new URL("../../cli/check.js", import.meta.url)), "utf8");

/** Custom properties declared in the :root block of a tokens.css. */
function rootTokens(css) {
  const body = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

for (const name of readdirSync(themes).filter((d) => existsSync(`${themes}${d}/tokens.css`))) {
  test(`theme ${name}: --sd-min-audience-font aliases --min-audience-font`, () => {
    const tokens = rootTokens(readFileSync(`${themes}${name}/tokens.css`, "utf8"));
    assert.match(tokens["--min-audience-font"] ?? "", /^\d+(\.\d+)?px$/, "the spec name holds the value");
    assert.equal(tokens["--sd-min-audience-font"], "var(--min-audience-font)", "the prefixed token is an alias, not a second value");
  });
}

test("check measures against the prefixed token, which resolves through the alias", () => {
  assert.match(check, /getPropertyValue\("--sd-min-audience-font"\)\) \|\| parseFloat\(tokens\.getPropertyValue\("--min-audience-font"\)\)/);
});
