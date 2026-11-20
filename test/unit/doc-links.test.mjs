// Every relative link in the tracked Markdown files points at something that exists. Links are found
// with the vendored marked, the parser the docs viewer renders them with, so code is never mistaken for a
// link and reference-style links and linked images are checked too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { Marked } from "#engine/vendor/marked/marked.esm.js";
import { isExternal } from "../../site/docs/viewer.js";
import { ROOT, publicFiles } from "./helpers/tracked.mjs";

const files = publicFiles("*.md");
const md = new Marked({ gfm: true });

test("tracked Markdown has at least one file to check", () => {
  assert.ok(files.length > 10);
});

test("relative Markdown links resolve to files or folders that exist", () => {
  const broken = [];
  for (const f of files) {
    const file = join(ROOT, f);
    md.walkTokens(md.lexer(readFileSync(file, "utf8")), (t) => {
      if (t.type !== "link" && t.type !== "image") return;
      if (t.href.startsWith("#") || isExternal(t.href)) return;
      const target = t.href.split("#")[0].split("?")[0];
      if (!target) return;
      let decoded = target;
      try { decoded = decodeURIComponent(target); } catch { /* keep as written */ }
      const abs = resolve(dirname(file), decoded);
      if (!existsSync(abs)) broken.push(`${f}: link "${t.href}" -> ${relative(ROOT, abs)} (missing)`);
    });
  }
  assert.deepEqual(broken, [], `broken links:\n${broken.join("\n")}`);
});
