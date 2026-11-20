// Built-in `chat`: an exchange as bubbles, or quote and prompt cards (slide kit 1, §5.2).
//
// Everything on screen is a pure function of the props (deriveChat in ./derive.js):
//   - hidden messages (index >= `shown`) keep their space; CSS hides them with visibility, never with reflow;
//   - `bubbles` aligns `user` right and `agent`/`note` left; `card` stacks full-width bordered cards with
//     the label on top (the "El encargo" prompt look).
// Every update first writes that state straight into the DOM (renderState), so the DOM after settled() is
// the same whether a state was jumped to or played. With info.animate and `shown` increasing by a forward
// step, the new messages rise and fade in, staggered, and with `typing` the newest one is then typed: its
// text is split into a typed part and an untyped rest that stays in place but hidden, so the bubble keeps
// the size it ends at. All motion is bound to info.signal, so an aborted step snaps to its end state; the
// text is rebuilt whole and the inline styles removed afterwards: nothing from the motion survives.
// `text` is inline Markdown through the shared sanitizing renderer (core/inline.js).
// Sizes and colors come from theme tokens via CSS (core/stepdeck.css); no color or size is set here.
import { renderInline } from "../../core/inline.js";
import { deriveChat } from "./derive.js";
import { clearInlineStyle, rise, typeCount, typingMs } from "../../core/animate.js";
import { el as make, canAnimate, motion } from "../../core/kit.js";

export default {
  mount(el, props, ctx) {
    const doc = el.ownerDocument;
    const root = make(doc, "div", "sd-chat", el);
    let signature = null; // what the current messages were built from: role, label, text
    let rows = []; // [{ msg, text }] in message order
    let typing = null; // the text element currently split for typing, with its full message

    function build(derived) {
      rows = derived.messages.map((m) => {
        const msg = make(doc, "div", "sd-chat-msg");
        msg.dataset.index = String(m.index);
        msg.dataset.role = m.role;
        msg.dataset.visible = "true";
        if (m.label) make(doc, "div", "sd-chat-label", msg, m.label);
        const text = make(doc, "div", "sd-chat-text", msg);
        text.innerHTML = renderInline(m.text);
        return { msg, text };
      });
      root.replaceChildren(...rows.map((r) => r.msg));
    }

    /** Puts a text element split for typing back to its whole, unsplit markup. */
    function restoreTyped() {
      if (!typing) return;
      typing.text.innerHTML = renderInline(typing.source);
      typing = null;
    }

    /** Writes the state for `props` exactly; returns the derived state and whether messages were rebuilt. */
    function renderState(props) {
      restoreTyped();
      const derived = deriveChat(props);
      const next = JSON.stringify(derived.messages.map((m) => [m.role, m.label ?? null, m.text]));
      const rebuilt = next !== signature;
      if (rebuilt) {
        build(derived);
        signature = next;
      }
      root.dataset.style = derived.style;
      derived.messages.forEach((m, i) => {
        rows[i].msg.dataset.visible = String(m.visible);
      });
      return { derived, rebuilt };
    }

    /** No inline style survives an update, so the html is the same however the state was reached. */
    function clearInline() {
      clearInlineStyle(...rows.map((r) => r.msg));
    }

    /**
     * Splits every text node of `row.text` into a typed part and a hidden rest, so the box keeps its final
     * size; returns type(n) to show the first n characters of the message. Empty at first.
     */
    function prepareTyping(row, source) {
      const walker = doc.createTreeWalker(row.text, 4 /* NodeFilter.SHOW_TEXT */);
      const nodes = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
      let total = 0;
      const parts = nodes.map((node) => {
        const full = node.data;
        const typed = doc.createTextNode("");
        const rest = doc.createElement("span");
        rest.className = "sd-chat-ghost";
        rest.textContent = full;
        node.replaceWith(typed, rest);
        const part = { typed, rest, full, start: total };
        total += full.length;
        return part;
      });
      typing = { text: row.text, source };
      return {
        total,
        type(n) {
          for (const p of parts) {
            const k = Math.max(0, Math.min(p.full.length, n - p.start));
            p.typed.data = p.full.slice(0, k);
            p.rest.textContent = p.full.slice(k);
          }
        },
      };
    }

    renderState(props);

    return {
      async update(props, info = {}) {
        const animate = canAnimate(info);
        const before = animate ? rows.map(({ msg }) => msg.dataset.visible === "true") : null;
        const { derived, rebuilt } = renderState(props);
        clearInline();
        if (!animate || rebuilt || before.length !== rows.length) return;
        const fresh = derived.messages.filter((m) => m.visible && !before[m.index]);
        if (fresh.length === 0) return;

        const opts = motion(info);
        for (const m of fresh) rows[m.index].msg.style.opacity = "0";
        // Only the newest message is typed, and only when it just appeared.
        const typed = props.typing === true && fresh.some((m) => m.index === derived.newest) ? prepareTyping(rows[derived.newest], derived.messages[derived.newest].text) : null;

        try {
          await ctx.animate.stagger(fresh, async (m, _i, o) => {
            await rise(ctx.animate, rows[m.index].msg, o);
            if (typed && m.index === derived.newest && typed.total > 0) {
              await typeCount(ctx.animate, typed.total, typed.type, { signal: o.signal, duration: o.duration > 0 ? typingMs(typed.total) : 0 });
            }
          }, opts);
        } finally {
          restoreTyped();
          clearInline();
        }
      },
      destroy() {
        root.remove();
      },
    };
  },
};
