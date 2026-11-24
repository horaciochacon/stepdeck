// Built-in `text`: one paragraph of plain text with a role (body, source, note, label, lede, badge).
// Idempotent: update renders exactly the given props, whatever state came before. An element that appears is
// moved by its box (the engine's entrance), never by the paragraph itself. A change of the text while the
// element stays on screen crossfades when the engine animates (info.animate): the old text fades out, the text
// swaps, the new text fades in. The theme's --sd-duration-fast times each half (a step's transition.duration
// is split in two). An abort renders the final text at once, and no inline style is left behind.
// A badge's `tone` picks its colour from the categorical palette (ctx.palette). The pill's border takes that
// colour (inline `border-color`); the text takes it darkened (lightened on a dark background) until it reads at
// 4.5:1 on the theme's --sd-color-background (inline `color`, textColor in core/color.js), so every tone passes
// `check`. A change of tone while the badge is on screen fades both colours over the same time; a change of
// `role` or of `accent` alone never animates (the class, the colours and the phrase swap at once). Without a tone
// the theme's accent colour applies to both (the theme draws the border in currentColor).
// With `accent: true` (a slide title) the text's `*phrase*` renders as
// <em class="sd-accent">phrase</em>, built from DOM nodes (never innerHTML). The engine escapes values from data
// bindings first (core/bindings.js resolveElementProps), so only the author's own `*` marks make a phrase.
import { clearInlineStyle } from "../../core/animate.js";
import { motion, tweenColor } from "../../core/kit.js";
import { parseAccent } from "../../core/accent.js";
import { textColor } from "../../core/color.js";

const ROLES = ["body", "source", "note", "label", "lede", "badge"];

export default {
  mount(el, props, ctx) {
    const doc = el.ownerDocument;
    const p = doc.createElement("p");
    el.appendChild(p);
    let shown = null; // key of what p holds
    let shownText = null; // the `text` p was written from
    let shownRole = null; // the role p carries
    let shownColor = null; // the palette colour p carries (null: the theme's own)
    const background = ctx.tokens?.["--sd-color-background"];
    /** A palette colour's inks: the border as it is, the text darkened to text contrast; null for the theme's own. */
    const inks = (color) => (color === null ? null : { text: textColor(color, background), border: color });
    /** What the props show: the role's class, the badge's palette colour, and the text as parts plus its key. */
    const read = (props) => {
      const role = ROLES.includes(props.role) ? props.role : "body";
      const text = props.text == null ? "" : String(props.text);
      const parts = props.accent === true ? parseAccent(text) : [{ text, accent: false }];
      const tone = role === "badge" && Number.isInteger(props.tone) && props.tone >= 0 ? props.tone : null;
      const color = tone === null ? null : (ctx.palette?.("categorical")?.colors?.[tone] ?? null);
      return { role, text, parts, color, key: JSON.stringify(parts) };
    };
    /** The text and border colours on screen for a palette colour, or for the theme's own (null). */
    const resolved = (color) => {
      if (color !== null) return inks(color);
      const inline = { text: p.style.color, border: p.style.borderColor };
      p.style.color = "";
      p.style.borderColor = "";
      const cs = doc.defaultView.getComputedStyle(p);
      const own = { text: cs.color, border: cs.borderTopColor };
      p.style.color = inline.text;
      p.style.borderColor = inline.border;
      return own;
    };
    // Always the same two declarations in the same order, so a played badge's markup equals a jumped one's.
    const paint = (color) => {
      shownColor = color;
      const ink = inks(color);
      if (ink === null) {
        p.style.removeProperty("color");
        p.style.removeProperty("border-color");
      } else {
        p.style.color = ink.text;
        p.style.borderColor = ink.border;
      }
    };
    const write = ({ role, text, parts, key }) => {
      p.className = `sd-text sd-role-${role}`;
      shownRole = role;
      shownText = text;
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
    const first = read(props);
    write(first);
    paint(first.color);
    return {
      async update(props, info) {
        const next = read(props);
        // Only a change of `text`, on an element that was already visible, crossfades; `accent` alone swaps at
        // once. Only a badge that stays a badge tweens its colours: a change of `role` swaps them with the class.
        const playing = info.animate && !info.entered && !info.signal?.aborted;
        const crossfade = playing && next.text !== shownText;
        const recolor = playing && next.color !== shownColor && next.role === shownRole;
        try {
          if (crossfade || recolor) {
            // transition.duration is the whole crossfade; without it each half is the theme's fast duration.
            const t = motion(info, ctx, { fast: true });
            const half = info.transition?.duration != null ? t.duration / 2 : t.duration;
            const opts = { ...t, duration: half };
            const fade = async () => {
              await ctx.animate.tween(1, 0, (v) => (p.style.opacity = String(v)), opts);
              write(next);
              if (!recolor) paint(next.color); // colours that are not tweened swap with the text
              await ctx.animate.tween(0, 1, (v) => (p.style.opacity = String(v)), opts);
            };
            // The colours move over the whole crossfade, or over one fast duration when only the colour changes.
            const colour = () => {
              const [from, to] = [resolved(shownColor), resolved(next.color)];
              const o = crossfade ? { ...t, duration: half * 2 } : t;
              return Promise.all([
                tweenColor(ctx, from.text, to.text, (c) => { p.style.color = c; }, o),
                tweenColor(ctx, from.border, to.border, (c) => { p.style.borderColor = c; }, o),
              ]);
            };
            await Promise.all([crossfade ? fade() : null, recolor ? colour() : null]);
          }
        } finally {
          // The final text and colours are written whatever happened, then no inline style is left behind
          // but the badge's own two colours.
          write(next);
          clearInlineStyle(p);
          paint(next.color);
        }
      },
      destroy() {
        p.remove();
      },
    };
  },
};
