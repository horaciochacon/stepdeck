// Built-in `text`: one paragraph of plain text with a role (body, source, note, label).
// Idempotent: update renders exactly the given props, whatever state came before. It fades in
// only when the engine says to animate (info.animate) and the text appeared or changed.
// With `accent: true` (a slide title: default-theme spec §5.4) the text's `*phrase*` renders as
// <em class="sd-accent">phrase</em>, built from DOM nodes (never innerHTML). The engine escapes values from data
// bindings first (core/bindings.js resolveElementProps), so only the author's own `*` marks make a phrase.
import { clearInlineStyle } from "../../core/animate.js";
import { motion } from "../../core/kit.js";
import { parseAccent } from "../../core/accent.js";

const ROLES = ["body", "source", "note", "label"];

export default {
  mount(el, props, ctx) {
    const doc = el.ownerDocument;
    const p = doc.createElement("p");
    el.appendChild(p);
    let shown = null; // key of what p holds
    const render = (props) => {
      const role = ROLES.includes(props.role) ? props.role : "body";
      p.className = `sd-text sd-role-${role}`;
      const text = props.text == null ? "" : String(props.text);
      const parts = props.accent === true ? parseAccent(text) : [{ text, accent: false }];
      const key = JSON.stringify(parts);
      if (key === shown) return;
      shown = key;
      p.replaceChildren(...parts.map((part) => {
        if (!part.accent) return doc.createTextNode(part.text);
        const em = doc.createElement("em");
        em.className = "sd-accent";
        em.textContent = part.text;
        return em;
      }));
    };
    render(props);
    return {
      async update(props, info) {
        render(props);
        const fade = info.animate && (info.entered || info.changed.includes("text"));
        if (fade) {
          await ctx.animate.fadeIn(p, motion(info));
        }
        // Idempotent end state: no inline style left behind, whether the fade ran or not.
        clearInlineStyle(p);
      },
      destroy() {
        p.remove();
      },
    };
  },
};
