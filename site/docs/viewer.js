// Docs viewer logic (GitHub Pages site). A pure module: no DOM access, nothing runs at import time.
// site/docs/index.html?p=<repo path>.md fetches that file, renders it with the vendored marked and
// rewrites its links so that every link lands on a page that renders, on the live gallery or example
// deck, or on the file on GitHub. A ```mermaid flowchart is drawn by flowchart.js (source shown if it cannot).
import { Marked } from "../../engine/vendor/marked/marked.esm.js";
import { renderFlowchart } from "./flowchart.js";

export const REPO_URL = "https://github.com/horaciochacon/stepdeck";
const HOME = "docs/index.md";

const ROOTS = ["docs/", "skill/", "engine/components/", "engine/layouts/", "engine/themes/", "templates/"];
const FILES = ["README.md", "README.es.md", "CHANGELOG.md", "AGENTS.md"];
// Folders the site serves live: a link to one of these opens the gallery or the deck, not its source tree.
const LIVE = ["site/gallery", "examples/kit", "examples/spike"];
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const SAFE_PATH = /^[A-Za-z0-9._\/-]+$/;

/** Whether a link leaves the repository: it has a scheme ("https:", "mailto:") or is protocol-relative. */
export const isExternal = (href) => href.startsWith("//") || SCHEME.test(href);

/** Joins and normalizes "." and ".." segments. Returns null when the path climbs above its root. */
function normalize(path) {
  const out = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(seg);
  }
  return out.join("/");
}

/**
 * The repository path a `?p=` value may show, normalized, or null when it is not allowed. Null or
 * empty gives the docs home page. Allowed: *.md under docs/, skill/, engine/components/, engine/layouts/,
 * engine/themes/, templates/ (never docs/superpowers/), and README.md, README.es.md, CHANGELOG.md.
 */
export function resolveDocPath(p) {
  if (!p) return HOME;
  // Strict allow-list first: no "%" (a decoded %2e%2e would be a ".." for fetch), "?" or "#" (fetch would
  // drop them and read another file), backslash, scheme colon or control characters.
  if (typeof p !== "string" || !SAFE_PATH.test(p) || p.startsWith("/")) return null;
  const path = normalize(p);
  if (path === null || !path.endsWith(".md")) return null;
  if (path.startsWith("docs/superpowers/")) return null;
  if (FILES.includes(path) || ROOTS.some((r) => path.startsWith(r))) return path;
  return null;
}

/** Folder of a repository path, with a trailing slash ("" for a file at the root). */
const folderOf = (current) => current.slice(0, current.lastIndexOf("/") + 1);

/** A repository path from an href relative to the page `current`; null when it escapes the repository. */
function resolveAgainst(href, current) {
  const path = href.startsWith("/") ? href : folderOf(current) + href;
  return normalize(path);
}

/**
 * Where a link in the page `current` (a repository path) should go in the viewer: other pages and
 * #anchors stay in the page world, external and mailto: links are unchanged, the gallery and the
 * example decks open live (relative to site/docs/), anything else (a folder, code, data) is the file
 * on GitHub.
 */
export function rewriteHref(href, current) {
  if (href === "" || href.startsWith("#") || isExternal(href)) return href;
  const hashAt = href.indexOf("#");
  const hash = hashAt === -1 ? "" : href.slice(hashAt);
  const rel = hashAt === -1 ? href : href.slice(0, hashAt);
  const path = resolveAgainst(rel, current);
  if (path === null) return REPO_URL;
  if (rel.endsWith(".md")) {
    const doc = resolveDocPath(path);
    if (doc !== null) return `?p=${doc}${hash}`;
  }
  const folder = rel.endsWith("/");
  if (folder && LIVE.includes(path)) return `../../${path}/${hash}`;
  return `${REPO_URL}/${folder ? "tree" : "blob"}/main/${path}${folder && path ? "/" : ""}${hash}`;
}

/** The src of an image in the page `current`, relative to site/docs/ (the repository root is ../../). */
export function rewriteSrc(src, current) {
  if (src === "" || isExternal(src)) return src;
  const path = resolveAgainst(src, current);
  return path === null ? "" : `../../${path}`;
}

/** GitHub-style heading id: lowercase, characters other than [a-z0-9 -] dropped, spaces to "-". */
export function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-");
}

const escapeText = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * The figure for a ```mermaid block of the page `current`: the drawing with its source folded below,
 * or, when flowchart.js cannot draw it, the source with a link to the page on GitHub (which renders it).
 */
export function renderDiagram(source, current, id = "flow-1") {
  const code = `<pre><code>${escapeText(source)}\n</code></pre>`;
  const svg = renderFlowchart(source, { id });
  if (svg === null) {
    return `<figure class="flow flow-source">${code}<figcaption>Diagram source (<a href="${REPO_URL}/blob/main/${current}">rendered on GitHub</a>)</figcaption></figure>\n`;
  }
  return `<figure class="flow"><div class="flow-scroll">${svg}</div><details><summary>Diagram source</summary>${code}</details></figure>\n`;
}

/** Renders Markdown for the page `current`: { html, title } (title: the first # heading, or null). */
export function renderMarkdown(text, current) {
  let title = null;
  let diagrams = 0;
  const used = new Map();
  const marked = new Marked({
    gfm: true,
    walkTokens(token) {
      if (token.type === "link") token.href = rewriteHref(token.href, current);
      else if (token.type === "image") token.href = rewriteSrc(token.href, current);
    },
    renderer: {
      code({ text: source, lang }) {
        return lang === "mermaid" ? renderDiagram(source, current, `flow-${++diagrams}`) : false;
      },
      heading({ tokens, depth }) {
        const plain = this.parser.parseInline(tokens, this.parser.textRenderer);
        if (depth === 1 && title === null) title = plain;
        const base = slug(plain);
        const n = used.get(base) ?? 0;
        used.set(base, n + 1);
        const id = n === 0 ? base : `${base}-${n}`;
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
    },
  });
  const html = marked.parse(text);
  return { html, title };
}

/**
 * Loads the page asked for by a query string ("?p=docs/guide/quickstart.md"). Resolves to
 * { state: "ready", path, html, title } or { state: "missing", requested }. A refused path is
 * never fetched. `fetchText(url)` defaults to fetch and is given a url relative to site/docs/.
 */
export async function loadPage(search, fetchText = defaultFetch) {
  const requested = new URLSearchParams(search).get("p");
  const path = resolveDocPath(requested);
  if (path === null) return { state: "missing", requested };
  let text;
  try {
    text = await fetchText(`../../${path}`);
  } catch {
    return { state: "missing", requested: path };
  }
  const { html, title } = renderMarkdown(text, path);
  return { state: "ready", path, html, title };
}

async function defaultFetch(url) {
  const res = await fetch(url);
  if (!res.ok) {
    await res.body?.cancel(); // end the request: an unread error body would stay in flight
    throw new Error(`HTTP ${res.status}`);
  }
  return res.text();
}
