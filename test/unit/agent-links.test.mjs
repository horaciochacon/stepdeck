// The files an agent is routed through point at things that exist: every relative link in skill/**/*.md,
// AGENTS.md and llms.txt resolves to a file or folder, every #anchor to a heading of its target (ids as the
// docs viewer makes them), and every `$STEPDECK/<path>` the skill names is a path of this repository. Read from
// disk, not from git, so a new file is checked before it is tracked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { Marked } from "#engine/vendor/marked/marked.esm.js";
import { isExternal, renderMarkdown } from "../../site/docs/viewer.js";
import { ROOT } from "./helpers/tracked.mjs";

const skill = readdirSync(join(ROOT, "skill"), { recursive: true })
  .map((f) => join("skill", String(f)))
  .filter((f) => f.endsWith(".md"));
const files = [...skill, "AGENTS.md", "llms.txt"];
const md = new Marked({ gfm: true });

const anchors = new Map();
function anchorsOf(abs) {
  if (!anchors.has(abs)) {
    const { html } = renderMarkdown(readFileSync(abs, "utf8"), relative(ROOT, abs));
    anchors.set(abs, new Set([...html.matchAll(/<h[1-6] id="([^"]*)"/g)].map((m) => m[1])));
  }
  return anchors.get(abs);
}

test("the agent entry files exist", () => {
  assert.ok(skill.length >= 8, "skill/SKILL.md and its references");
  for (const f of ["AGENTS.md", "llms.txt", "GEMINI.md"]) assert.ok(existsSync(join(ROOT, f)), f);
});

test("links and #anchors in skill/, AGENTS.md and llms.txt resolve", () => {
  const broken = [];
  for (const f of files) {
    const file = join(ROOT, f);
    md.walkTokens(md.lexer(readFileSync(file, "utf8")), (t) => {
      if (t.type !== "link" && t.type !== "image") return;
      if (isExternal(t.href)) return;
      const [path, anchor] = t.href.split("#");
      let decoded = path.split("?")[0];
      try { decoded = decodeURIComponent(decoded); } catch { /* keep as written */ }
      const abs = decoded ? resolve(dirname(file), decoded) : file;
      if (!existsSync(abs)) return void broken.push(`${f}: link "${t.href}" -> ${relative(ROOT, abs)} (missing)`);
      if (anchor && abs.endsWith(".md") && !anchorsOf(abs).has(anchor)) broken.push(`${f}: link "${t.href}": no heading #${anchor} in ${relative(ROOT, abs)}`);
    });
  }
  assert.deepEqual(broken, [], `broken links:\n${broken.join("\n")}`);
});

test("every $STEPDECK/<path> the skill and AGENTS.md name is in the repository", () => {
  const missing = [];
  for (const f of files) {
    for (const m of readFileSync(join(ROOT, f), "utf8").matchAll(/\$STEPDECK\/([\w./-]+)/g)) {
      const path = m[1].replace(/\.+$/, "");
      if (!existsSync(join(ROOT, path))) missing.push(`${f}: $STEPDECK/${path}`);
    }
  }
  assert.deepEqual(missing, [], `paths that do not exist:\n${missing.join("\n")}`);
});

test("llms.txt lists every skill reference", () => {
  const text = readFileSync(join(ROOT, "llms.txt"), "utf8");
  for (const f of skill) assert.ok(text.includes(`(${f})`), `llms.txt has no link to ${f}`);
});
