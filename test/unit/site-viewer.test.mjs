import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REPO_URL, resolveDocPath, rewriteHref, rewriteSrc, slug, renderMarkdown, renderDiagram, loadPage } from "../../site/docs/viewer.js";
import { parseFlowchart, layoutFlowchart, renderFlowchart } from "../../site/docs/flowchart.js";

test("resolveDocPath: default, normalization, allowed roots", () => {
  assert.equal(resolveDocPath(null), "docs/index.md");
  assert.equal(resolveDocPath(""), "docs/index.md");
  assert.equal(resolveDocPath("docs/guide/quickstart.md"), "docs/guide/quickstart.md");
  assert.equal(resolveDocPath("docs/guide/../index.md"), "docs/index.md");
  for (const ok of ["skill/SKILL.md", "engine/components/chat/README.md", "engine/layouts/x/README.md", "engine/themes/modern/README.md", "templates/a.md", "README.md", "README.es.md", "CHANGELOG.md"]) {
    assert.equal(resolveDocPath(ok), ok, ok);
  }
});

test("resolveDocPath: refuses everything else", () => {
  for (const bad of ["../../etc/passwd", "https://x/a.md", "/docs/index.md", "docs/guide/quickstart.js", "docs/superpowers/plans/x.md", "docs/../docs/superpowers/x.md", "cli/index.md", "THIRD_PARTY_NOTICES.md", "docs/../../x.md", "javascript:alert(1).md", "docs\\a.md", "docs/%2e%2e/%2e%2e/x.md", "docs/%2e%2e/docs/superpowers/plans/x.md", "engine/themes/modern/tokens.css#.md", "docs/a?.md", "docs/a#b.md", "docs/a b.md", "components/chat/README.md", "engine/core/x.md", "engine/x.md"]) {
    assert.equal(resolveDocPath(bad), null, bad);
  }
});

test("rewriteHref", () => {
  assert.equal(rewriteHref("guide/quickstart.md", "docs/index.md"), "?p=docs/guide/quickstart.md");
  assert.equal(rewriteHref("../skill/SKILL.md#rules", "docs/index.md"), "?p=skill/SKILL.md#rules");
  assert.equal(rewriteHref("../skill/references/", "docs/index.md"), REPO_URL + "/tree/main/skill/references/");
  assert.equal(rewriteHref("../../engine/layouts/halves/README.md", "docs/reference/layouts.md"), "?p=engine/layouts/halves/README.md");
  assert.equal(rewriteHref("../../engine/core/layout.js", "docs/reference/layouts.md"), REPO_URL + "/blob/main/engine/core/layout.js");
  assert.equal(rewriteHref("../../cli/index.js", "docs/reference/cli.md"), REPO_URL + "/blob/main/cli/index.js");
  assert.equal(rewriteHref("#reference", "docs/index.md"), "#reference");
  assert.equal(rewriteHref("https://marked.js.org/", "docs/x.md"), "https://marked.js.org/");
  assert.equal(rewriteHref("mailto:a@b.c", "docs/x.md"), "mailto:a@b.c");
  // The gallery and the example decks are served by the site: their folders open live, not on GitHub.
  assert.equal(rewriteHref("../../site/gallery/", "docs/guide/quickstart.md"), "../../site/gallery/");
  assert.equal(rewriteHref("../../site/gallery/#/halves-example/0", "docs/reference/layouts.md"), "../../site/gallery/#/halves-example/0");
  assert.equal(rewriteHref("../examples/kit/", "docs/index.md"), "../../examples/kit/");
  assert.equal(rewriteHref("../../examples/spike/", "docs/guide/quickstart.md"), "../../examples/spike/");
  // A file or a subfolder of one of them is still source on GitHub.
  assert.equal(rewriteHref("../examples/kit/deck.js", "docs/index.md"), REPO_URL + "/blob/main/examples/kit/deck.js");
  assert.equal(rewriteHref("../examples/kit/slides/", "docs/index.md"), REPO_URL + "/tree/main/examples/kit/slides/");
  assert.equal(rewriteHref("../examples/", "docs/index.md"), REPO_URL + "/tree/main/examples/");
  // A .md outside the viewer's roots, or inside docs/superpowers, is the file on GitHub.
  assert.equal(rewriteHref("../THIRD_PARTY_NOTICES.md", "docs/index.md"), REPO_URL + "/blob/main/THIRD_PARTY_NOTICES.md");
  assert.equal(rewriteHref("superpowers/plans/x.md", "docs/index.md"), REPO_URL + "/blob/main/docs/superpowers/plans/x.md");
  // A link that climbs out of the repository never leaves GitHub.
  assert.equal(rewriteHref("../../../x.md", "docs/index.md"), REPO_URL);
});

test("rewriteSrc points an image at the repository root", () => {
  assert.equal(rewriteSrc("img/a.png", "docs/guide/x.md"), "../../docs/guide/img/a.png");
  assert.equal(rewriteSrc("../../engine/themes/modern/preview.png", "docs/guide/x.md"), "../../engine/themes/modern/preview.png");
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

// The six docs pages that hold a Mermaid flowchart. The viewer draws them itself (site/docs/flowchart.js).
const FLOW_PAGES = ["docs/guide/step-model.md", "docs/guide/animation-and-motion.md", "docs/guide/checking-a-deck.md", "docs/guide/for-agents.md", "docs/concepts/architecture.md", "docs/contributing/index.md"];
const mermaidBlocks = (path) => [...readFileSync(new URL(`../../${path}`, import.meta.url), "utf8").matchAll(/^```mermaid\n([\s\S]*?)^```$/gm)].map((m) => m[1]);

test("parseFlowchart: nodes, shapes, chains, edge labels, dashed edges, subgraphs", () => {
  const g = parseFlowchart('flowchart LR\n  A[one] --> B["two<br/>lines"] -->|ok| C{sure?}\n  C -- no --> A\n  C -. "may be" .-> D\n\n  %% a comment\n  subgraph box["The box"]\n    D\n    E[five]\n  end\n  D -.-> E\n');
  assert.equal(g.direction, "LR");
  assert.deepEqual(g.nodes, [
    { id: "A", lines: ["one"], shape: "box", group: null },
    { id: "B", lines: ["two", "lines"], shape: "box", group: null },
    { id: "C", lines: ["sure?"], shape: "decision", group: null },
    { id: "D", lines: ["D"], shape: "box", group: null },
    { id: "E", lines: ["five"], shape: "box", group: "box" },
  ]);
  assert.deepEqual(g.edges, [
    { from: "A", to: "B", label: null, dashed: false },
    { from: "B", to: "C", label: "ok", dashed: false },
    { from: "C", to: "A", label: "no", dashed: false },
    { from: "C", to: "D", label: "may be", dashed: true },
    { from: "D", to: "E", label: null, dashed: true },
  ]);
  assert.deepEqual(g.groups, [{ id: "box", title: "The box" }]);
  assert.equal(parseFlowchart("graph TB\n  A --> B\n").direction, "TD");
});

test("parseFlowchart: anything outside the subset is refused, never half-read", () => {
  for (const bad of [
    "sequenceDiagram\n  A->>B: hi\n",
    "flowchart RL\n  A --> B\n",
    "flowchart LR\n  A(round) --> B\n",
    "flowchart LR\n  A --> B & C\n",
    "flowchart LR\n  A --- B\n",
    "flowchart LR\n  A ==> B\n",
    "flowchart LR\n  A --> A\n",
    "flowchart LR\n  A --> B\n  A --> B\n",
    "flowchart LR\n  A --> B\n  style A fill:#f00\n",
    "flowchart LR\n  subgraph one\n  subgraph two\n  A\n  end\n  end\n",
    "flowchart LR\n  subgraph one\n  A --> B\n",
    "flowchart LR\n",
    "",
  ]) {
    assert.equal(parseFlowchart(bad), null, bad);
    assert.equal(renderFlowchart(bad), null, bad);
  }
});

test("flowchart: the six diagrams of the docs parse, lay out without overlap and render", () => {
  const sizes = {};
  for (const page of FLOW_PAGES) {
    const blocks = mermaidBlocks(page);
    assert.equal(blocks.length, 1, `${page} has one mermaid block`);
    const graph = parseFlowchart(blocks[0]);
    assert.ok(graph, `${page} parses`);
    const layout = layoutFlowchart(graph);
    assert.ok(layout, `${page} lays out`);
    // No two node boxes overlap, and every coordinate is a finite number.
    for (const [i, a] of layout.nodes.entries()) {
      assert.ok([a.x, a.y, a.w, a.h].every(Number.isFinite), `${page}: ${a.id} is placed`);
      for (const b of layout.nodes.slice(i + 1)) {
        const apart = Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2;
        assert.ok(apart, `${page}: ${a.id} and ${b.id} do not overlap`);
      }
    }
    assert.equal(layout.paths.length, graph.edges.length, `${page}: one path per edge`);
    for (const p of layout.paths) assert.doesNotMatch(p.d, /NaN|undefined|Infinity/, page);
    const svg = renderFlowchart(blocks[0], { id: "t" });
    assert.match(svg, /^<svg class="flow-svg"[^>]* role="img" aria-label="Flowchart: /, page);
    assert.equal(svg.match(/<g class="flow-node"/g).length, graph.nodes.length, `${page}: one box per node`);
    assert.equal(svg.match(/<path class="flow-edge/g).length, graph.edges.length, `${page}: one line per edge`);
    assert.doesNotMatch(svg, /NaN|undefined|&lt;br/, page);
    sizes[page] = [graph.direction, graph.nodes.length, graph.edges.length, graph.groups.length];
    // Nothing is drawn wider than the page: a long left-to-right chain is turned top-down.
    assert.ok(Number(/ width="(\d+)"/.exec(svg)[1]) <= 1000, `${page} fits the page`);
  }
  assert.deepEqual(sizes, {
    "docs/guide/step-model.md": ["LR", 8, 7, 0],
    "docs/guide/animation-and-motion.md": ["TD", 7, 7, 0],
    "docs/guide/checking-a-deck.md": ["LR", 5, 7, 0],
    "docs/guide/for-agents.md": ["LR", 6, 6, 0],
    "docs/concepts/architecture.md": ["TD", 8, 8, 1],
    "docs/contributing/index.md": ["LR", 5, 6, 0],
  });
});

test("flowchart: labels are escaped, a back edge goes around, an unroutable one is refused", () => {
  const svg = renderFlowchart('flowchart LR\n  A["<b>&</b>"] -->|"x" < y| B\n  B --> A\n', { id: "t" });
  assert.match(svg, /&lt;b&gt;&amp;&lt;\/b&gt;/);
  assert.doesNotMatch(svg, /<b>/);
  assert.equal(svg.match(/<path class="flow-edge/g).length, 2);
  // C is not the outermost node of its rank, so the edge back from it would cross D.
  assert.equal(renderFlowchart("flowchart LR\n  A --> B\n  A --> C\n  A --> D\n  B --> A\n"), null);
});

test("renderMarkdown: a mermaid flowchart becomes a drawing with its source folded; other code is unchanged", () => {
  const { html } = renderMarkdown("```mermaid\nflowchart LR\n  A[a <i>] --> B\n```\n\n```js\nconst a = 1;\n```\n\n```mermaid\nflowchart LR\n  B --> C\n```\n", "docs/guide/x.md");
  assert.match(html, /<figure class="flow"><div class="flow-scroll"><svg class="flow-svg"/);
  assert.match(html, /<details><summary>Diagram source<\/summary><pre><code>flowchart LR\n {2}A\[a &lt;i&gt;\] --&gt; B\n<\/code><\/pre><\/details>/);
  assert.match(html, /<pre><code class="language-js">const a = 1;\n<\/code><\/pre>/);
  // Each drawing has its own arrowhead id.
  assert.match(html, /id="flow-1-arrow"[\s\S]*id="flow-2-arrow"/);
});

test("renderDiagram: a diagram the viewer cannot draw shows its source and links to the page on GitHub", () => {
  const html = renderDiagram("sequenceDiagram\n  A->>B: <hi>\n", "docs/guide/x.md");
  assert.equal(html, `<figure class="flow flow-source"><pre><code>sequenceDiagram\n  A-&gt;&gt;B: &lt;hi&gt;\n\n</code></pre><figcaption>Diagram source (<a href="${REPO_URL}/blob/main/docs/guide/x.md">rendered on GitHub</a>)</figcaption></figure>\n`);
  assert.doesNotMatch(html, /<svg/);
});
