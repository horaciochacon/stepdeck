// Built-in `list`: numbered, lettered, bulleted or checklist items revealed one by one (slide kit 1, §5.2).
//
// Everything on screen is a pure function of the props (deriveList in ./derive.js):
//   - hidden items (index >= `shown`) keep their space; CSS hides them with visibility, never with reflow;
//   - a checklist draws a box with a check mark; the mark is shown when the item is done;
//   - `active` mutes the text of the other items (a theme color), so one item is emphasised.
// Every update first writes that state straight into the DOM (renderState), so the DOM after settled() is
// the same whether a state was jumped to or played. With info.animate the component then plays the change
// from the previous state: items that just became visible rise and fade in, staggered; items whose
// emphasis changed fade between the two text colors; a check mark that just became done is drawn with
// ctx.animate.drawPath. All motion is bound to info.signal, so an aborted step snaps to its end state, and
// the inline styles it used are removed afterwards: no inline style survives an update.
// `text` and `sub` are inline Markdown through the shared sanitizing renderer (core/inline.js).
// Sizes and colors come from theme tokens via CSS (core/stepdeck.css); no color or size is set here.
import { renderInline } from "../../core/inline.js";
import { deriveList } from "./derive.js";
import { clearInlineStyle, rise } from "../../core/animate.js";
import { el as make, svgEl, canAnimate, motion, inkMix } from "../../core/kit.js";

export default {
  mount(el, props, ctx) {
    const doc = el.ownerDocument;
    const root = make(doc, "ul", "sd-list", el);
    root.setAttribute("role", "list");
    let signature = null; // what the current <li> were built from: marker, ids, text, sub
    let rows = []; // [{ li, text, tick }] in item order

    function build(derived, marker) {
      rows = derived.items.map((item) => {
        const li = make(doc, "li", "sd-list-item");
        li.dataset.index = String(item.index);
        li.dataset.id = item.id;
        li.dataset.visible = "true";
        li.dataset.done = "false";
        li.dataset.active = "false";
        const mark = make(doc, "span", "sd-list-marker", li);
        mark.setAttribute("aria-hidden", "true");
        let tick = null;
        if (marker === "check") {
          mark.classList.add("sd-list-box");
          const svg = svgEl(doc, "svg", { viewBox: "0 0 24 24" }, mark);
          svgEl(doc, "rect", { class: "sd-list-box-frame", x: 2, y: 2, width: 20, height: 20, rx: 4 }, svg);
          tick = svgEl(doc, "path", { class: "sd-list-tick", d: "M6.5 12.5l4 4 7.5-9" }, svg);
        } else {
          mark.textContent = item.marker;
        }
        const body = make(doc, "div", "sd-list-body", li);
        const text = make(doc, "div", "sd-list-text", body);
        text.innerHTML = renderInline(item.text);
        if (item.sub) make(doc, "div", "sd-list-sub", body).innerHTML = renderInline(item.sub);
        return { li, text, tick };
      });
      root.replaceChildren(...rows.map((r) => r.li));
    }

    /** Writes the state for `props` exactly; returns true when the items themselves were rebuilt. */
    function renderState(props) {
      const derived = deriveList(props);
      const next = JSON.stringify([props.marker, derived.items.map((i) => [i.id, i.text, i.sub ?? null])]);
      const rebuilt = next !== signature;
      if (rebuilt) {
        build(derived, props.marker);
        signature = next;
      }
      root.dataset.marker = props.marker;
      root.dataset.rule = String(props.rule === true);
      root.dataset.active = String(derived.items.some((i) => i.active));
      derived.items.forEach((item, i) => {
        const { li } = rows[i];
        li.dataset.visible = String(item.visible);
        li.dataset.done = String(item.done);
        li.dataset.active = String(item.active);
      });
      return { derived, rebuilt };
    }

    /** No inline style survives an update, so the html is the same however the state was reached. */
    function clearInline() {
      for (const { li, text, tick } of rows) clearInlineStyle(li, text, tick);
    }

    renderState(props);

    return {
      async update(props, info = {}) {
        const animate = canAnimate(info);
        // The previous state, read before it is overwritten (only when there is motion to play).
        const snapshot = () => {
          const anyActive = root.dataset.active === "true";
          return rows.map(({ li }) => ({ visible: li.dataset.visible === "true", done: li.dataset.done === "true", dim: anyActive && li.dataset.active !== "true" }));
        };
        const before = animate ? snapshot() : null;
        const { rebuilt } = renderState(props);
        clearInline();
        if (!animate || rebuilt || before.length !== rows.length) return;

        const opts = motion(info);
        const now = snapshot();
        const risers = []; // items that just became visible: rise and fade in (and draw their tick when done)
        const fades = []; // visible items whose emphasis changed
        const draws = []; // ticks of visible items that just became done
        rows.forEach(({ li, text, tick }, i) => {
          const drawing = tick && now[i].done && !before[i].done;
          if (now[i].visible && !before[i].visible) {
            li.style.opacity = "0";
            // A tick drawn later stays hidden while its row rises in, so it never shows before its draw.
            if (drawing) tick.style.visibility = "hidden";
            risers.push({ li, tick: drawing ? tick : null });
            return;
          }
          if (!now[i].visible) return;
          if (now[i].dim !== before[i].dim) {
            // Between the dimmed (muted) and the full (ink) text color; colors stay theme tokens.
            const paint = (p) => (text.style.color = inkMix(p));
            paint(before[i].dim ? 0 : 1);
            fades.push({ paint, from: before[i].dim ? 0 : 1, to: now[i].dim ? 0 : 1 });
          }
          if (drawing) draws.push(tick);
        });

        try {
          await Promise.all([
            ctx.animate.stagger(risers, async ({ li, tick }, _i, o) => {
              await rise(ctx.animate, li, o);
              if (!tick) return;
              // Unhide and start the draw in one synchronous block: drawPath writes the dash styles at once.
              tick.style.visibility = "";
              await ctx.animate.drawPath(tick, o);
            }, opts),
            ...fades.map(({ paint, from, to }) => ctx.animate.tween(from, to, paint, opts)),
            ...draws.map((tick) => ctx.animate.drawPath(tick, opts)),
          ]);
        } finally {
          clearInline();
        }
      },
      destroy() {
        root.remove();
      },
    };
  },
};
