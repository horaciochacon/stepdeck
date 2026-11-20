// Shared Markdown renderer for the built-in components that show author text (`markdown`, `list`, `chat`).
//
// - renderInline(md) -> html: inline Markdown only (emphasis, code, links, images, line breaks), no block
//   wrapper, so it fits inside a span or an li.
// - renderBlock(md) -> html: full Markdown (paragraphs, headings, lists, code, quotes).
// Both use one sanitizing marked instance:
// - Raw HTML is never passed through: html tokens render as escaped text, so `<script>` shows as
//   text and nothing runs. Links and images are built here with the URL HTML-escaped, and only http, https, mailto, #anchors and relative
//   URLs are kept; any other scheme (javascript:, data:, entity-encoded tricks) renders as plain text.
// - The result is a string for innerHTML. Callers resolve their own tokens (such as {{color:...}}) first.
import { Marked } from "../vendor/marked/marked.esm.js";
import { escapeHtml } from "./kit.js";

// URL allowlist. The scheme is read from the href with whitespace and control characters removed (so
// "java\tscript:" is seen as "javascript:"); a scheme must be http, https or mailto. A href with no scheme
// (a "#anchor", a relative path) is fine. An "&" before the scheme delimiter means an HTML entity such as
// "&#106;avascript:" that a browser would decode, so it is refused. Anything else renders as plain text.
const SAFE_SCHEMES = new Set(["http", "https", "mailto"]);
function safeUrl(href) {
  const clean = String(href ?? "").replace(/[\u0000-\u0020\u007f-\u009f]/g, "");
  const m = /^([^:/?#]*)([:/?#]|$)/.exec(clean);
  if (m[2] !== ":") return !m[1].includes("&");
  return SAFE_SCHEMES.has(m[1].toLowerCase());
}

// Same encoding as marked's own renderer (encodeURI, keeping "%"), then HTML-escaped as an attribute
// value so an entity in the source stays literal text and is never decoded by the browser.
function attrUrl(href) {
  let url = href;
  try {
    url = encodeURI(href).replace(/%25/g, "%");
  } catch {
    // malformed surrogate pairs: keep the raw text, it is escaped below
  }
  return escapeHtml(url);
}

const marked = new Marked({
  gfm: true,
  async: false,
  renderer: {
    html({ text, block }) {
      const escaped = escapeHtml(text);
      return block ? `<p class="sd-md-raw">${escaped}</p>\n` : escaped;
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!safeUrl(href)) return text;
      return `<a href="${attrUrl(href)}"${title ? ` title="${escapeHtml(title)}"` : ""}>${text}</a>`;
    },
    image({ href, title, text }) {
      if (!safeUrl(href)) return escapeHtml(text ?? "");
      return `<img src="${attrUrl(href)}" alt="${escapeHtml(text ?? "")}"${title ? ` title="${escapeHtml(title)}"` : ""}>`;
    },
  },
});

/** Block Markdown to html (paragraphs, headings, lists, code...). */
export function renderBlock(md) {
  return marked.parse(String(md ?? ""));
}

/** Inline Markdown to html: no wrapping <p>, no block elements. */
export function renderInline(md) {
  return marked.parseInline(String(md ?? ""));
}
