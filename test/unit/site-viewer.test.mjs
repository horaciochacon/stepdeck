import { test } from "node:test";
import assert from "node:assert/strict";
import { REPO_URL, resolveDocPath, rewriteHref, rewriteSrc, slug, renderMarkdown, loadPage } from "../../site/docs/viewer.js";

test("resolveDocPath: default, normalization, allowed roots", () => {
  assert.equal(resolveDocPath(null), "docs/index.md");
  assert.equal(resolveDocPath(""), "docs/index.md");
  assert.equal(resolveDocPath("docs/guide/quickstart.md"), "docs/guide/quickstart.md");
  assert.equal(resolveDocPath("docs/guide/../index.md"), "docs/index.md");
  for (const ok of ["skill/SKILL.md", "components/chat/README.md", "layouts/x/README.md", "themes/modern/README.md", "templates/a.md", "README.md", "README.es.md", "CHANGELOG.md"]) {
    assert.equal(resolveDocPath(ok), ok, ok);
  }
});

test("resolveDocPath: refuses everything else", () => {
  for (const bad of ["../../etc/passwd", "https://x/a.md", "/docs/index.md", "docs/guide/quickstart.js", "docs/superpowers/plans/x.md", "docs/../docs/superpowers/x.md", "cli/index.md", "THIRD_PARTY_NOTICES.md", "docs/../../x.md", "javascript:alert(1).md", "docs\\a.md", "docs/%2e%2e/%2e%2e/x.md", "docs/%2e%2e/docs/superpowers/plans/x.md", "themes/modern/tokens.css#.md", "docs/a?.md", "docs/a#b.md", "docs/a b.md"]) {
    assert.equal(resolveDocPath(bad), null, bad);
  }
});

test("rewriteHref", () => {
  assert.equal(rewriteHref("guide/quickstart.md", "docs/index.md"), "?p=docs/guide/quickstart.md");
  assert.equal(rewriteHref("../skill/SKILL.md#rules", "docs/index.md"), "?p=skill/SKILL.md#rules");
  assert.equal(rewriteHref("../skill/references/", "docs/index.md"), REPO_URL + "/tree/main/skill/references/");
  assert.equal(rewriteHref("../../cli/index.js", "docs/reference/cli.md"), REPO_URL + "/blob/main/cli/index.js");
  assert.equal(rewriteHref("#reference", "docs/index.md"), "#reference");
  assert.equal(rewriteHref("https://marked.js.org/", "docs/x.md"), "https://marked.js.org/");
  assert.equal(rewriteHref("mailto:a@b.c", "docs/x.md"), "mailto:a@b.c");
  // A .md outside the viewer's roots, or inside docs/superpowers, is the file on GitHub.
  assert.equal(rewriteHref("../THIRD_PARTY_NOTICES.md", "docs/index.md"), REPO_URL + "/blob/main/THIRD_PARTY_NOTICES.md");
  assert.equal(rewriteHref("superpowers/plans/x.md", "docs/index.md"), REPO_URL + "/blob/main/docs/superpowers/plans/x.md");
  // A link that climbs out of the repository never leaves GitHub.
  assert.equal(rewriteHref("../../../x.md", "docs/index.md"), REPO_URL);
});

test("rewriteSrc points an image at the repository root", () => {
  assert.equal(rewriteSrc("img/a.png", "docs/guide/x.md"), "../../docs/guide/img/a.png");
  assert.equal(rewriteSrc("../../themes/modern/preview.png", "docs/guide/x.md"), "../../themes/modern/preview.png");
  assert.equal(rewriteSrc("https://x/a.png", "docs/x.md"), "https://x/a.png");
});

test("slug", () => {
  assert.equal(slug("Quick start"), "quick-start");
  assert.equal(slug("`chart.line` props"), "chartline-props");
});

test("renderMarkdown: ids, title, links, images, tables", () => {
  const { html, title } = renderMarkdown(
    "# The `step` model\n\n## Quick start\n\n## Quick start\n\n[a](guide/b.md#c) [g](../cli/x.js) ![i](p.png)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n",
    "docs/index.md",
  );
  assert.equal(title, "The step model");
  assert.match(html, /<h1 id="the-step-model">/);
  assert.match(html, /<h2 id="quick-start">/);
  assert.match(html, /<h2 id="quick-start-1">/);
  assert.match(html, /href="\?p=docs\/guide\/b\.md#c"/);
  assert.match(html, new RegExp(`href="${REPO_URL}/blob/main/cli/x\\.js"`));
  assert.match(html, /src="\.\.\/\.\.\/docs\/p\.png"/);
  assert.match(html, /<table>/);
});

test("loadPage: refused paths are never fetched, failures are missing", async () => {
  const calls = [];
  const fetchText = async (u) => {
    calls.push(u);
    if (u.endsWith("gone.md")) throw new Error("HTTP 404");
    return "# Hi\n";
  };
  assert.deepEqual(await loadPage("?p=../../etc/passwd", fetchText), { state: "missing", requested: "../../etc/passwd" });
  assert.deepEqual(await loadPage("?p=https://x/a.md", fetchText), { state: "missing", requested: "https://x/a.md" });
  assert.deepEqual(calls, []);
  assert.deepEqual(await loadPage("?p=docs/gone.md", fetchText), { state: "missing", requested: "docs/gone.md" });
  const ok = await loadPage("", fetchText);
  assert.equal(ok.state, "ready");
  assert.equal(ok.path, "docs/index.md");
  assert.equal(ok.title, "Hi");
  assert.deepEqual(calls, ["../../docs/gone.md", "../../docs/index.md"]);
});
