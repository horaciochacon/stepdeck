// Built-in `markdown`: Markdown text with inline formatting (spec §6.4).
//
// - Raw HTML is never passed through and unsafe URLs render as plain text: the sanitizing renderer lives
//   in core/inline.js (renderBlock here), shared with `list` and `chat`.
// - `{{color:<role>}}` becomes the palette's name for that color role in the deck language, so text
//   never names a color the theme does not show. An unknown role is an error naming the role.
//   (Data bindings are resolved by the engine before the props reach the component.)
// - Idempotent: update renders exactly the given props. A change of `md` fades in when the engine animates
//   (info.animate), timed by the theme; an element that appears is moved by its box, not by itself.
//   No inline opacity is left behind.
import { renderBlock } from "../../core/inline.js";
import { clearInlineStyle } from "../../core/animate.js";
import { motion } from "../../core/kit.js";

const PALETTE_KINDS = ["categorical", "sequential", "diverging"];

/** The localized name of the color a role points at (accent -> "azul" in es), from the deck's palettes. */
function colorName(ctx, role) {
  const known = new Set();
  for (const kind of PALETTE_KINDS) {
    const palette = ctx.palette?.(kind);
    if (!palette) continue;
    for (const r of Object.keys(palette.roles ?? {})) known.add(r);
    const value = palette.roles?.[role];
    const i = value === undefined ? -1 : palette.colors.indexOf(value);
    if (i >= 0) return palette.names[i];
  }
  throw new Error(`unknown color role '${role}' in {{color:${role}}} (known roles: ${[...known].join(", ") || "none"})`);
}

// A name is inserted as Markdown source: escape its punctuation so it always reads as text.
const asMarkdownText = (s) => s.replace(/[\\`*_[\]<>~|#!&]/g, "\\$&");

function toHtml(md, ctx) {
  if (typeof md !== "string") throw new Error("markdown needs a string `md`");
  const source = md.replace(/\{\{\s*color:\s*([^}\s]+?)\s*\}\}/g, (_, role) => asMarkdownText(colorName(ctx, role)));
  return renderBlock(source);
}

export default {
  mount(el, props, ctx) {
    const root = el.ownerDocument.createElement("div");
    root.className = "sd-markdown";
    el.appendChild(root);
    let shown = null; // the html currently in the DOM
    const render = (props) => {
      const html = toHtml(props.md, ctx);
      if (html !== shown) {
        root.innerHTML = html;
        shown = html;
      }
    };
    render(props);
    return {
      async update(props, info) {
        render(props);
        try {
          if (info.animate && !info.entered && info.changed.includes("md")) {
            await ctx.animate.fadeIn(root, motion(info, ctx));
          }
        } finally {
          // Idempotent end state: no inline style left behind, whether the fade ran or not.
          clearInlineStyle(root);
        }
      },
      destroy() {
        root.remove();
      },
    };
  },
};
