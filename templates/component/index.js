// __NAME__: a deck component, scaffolded by `stepdeck new-component`.
//
// A renderer of props: everything on screen is a pure function of the props, so a step reached by
// jumping looks exactly like the same step reached by playing (`stepdeck check --played` tests it).
// This starter draws a list of items and marks every item up to `stage`; replace the drawing with
// your own and keep the shape: build once in mount, render(props) writes the whole state, update
// renders and only then animates, and leaves no animation residue.
//
// Motion: when the element appears, the engine moves its box (the theme's entrance, or the slide's
// `enter`), so update never fades the element itself in. It animates only changes while the element
// stays visible, with ctx.motion: the shared named motions, timed by the theme and the step.
//
// Colors and sizes come from theme tokens (CSS variables) and ctx.palette, never literals, so the
// component follows the deck's theme. Props are described in schema.json (read by validate and the
// catalog; this file is never imported by either).

export default {
  mount(el, props, ctx) {
    const doc = el.ownerDocument;
    const accent = ctx.palette?.("categorical")?.roles?.accent ?? "var(--sd-color-accent)";

    const list = doc.createElement("ol");
    Object.assign(list.style, {
      listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column",
      gap: "var(--sd-region-gap)", fontFamily: "var(--sd-font-body)", fontSize: "var(--sd-font-size-body)",
      lineHeight: "var(--sd-line-height)",
    });
    el.appendChild(list);

    let rows = []; // [{ li, dot, label }], rebuilt only when the items change

    function build(items) {
      list.replaceChildren();
      rows = items.map((text) => {
        const li = doc.createElement("li");
        Object.assign(li.style, { display: "flex", alignItems: "center", gap: "var(--sd-space)" });
        const dot = doc.createElement("span");
        Object.assign(dot.style, { flex: "0 0 auto", width: "28px", height: "28px", borderRadius: "50%", boxSizing: "border-box", borderStyle: "solid", borderWidth: "var(--sd-rule-width)" });
        const label = doc.createElement("span");
        label.textContent = text;
        li.append(dot, label);
        list.appendChild(li);
        return { li, dot, label };
      });
    }

    /** Writes the whole drawing for these props: the single source of truth. */
    function render(props) {
      const items = Array.isArray(props.items) ? props.items.map(String) : [];
      if (items.length !== rows.length || items.some((t, i) => rows[i].label.textContent !== t)) build(items);
      const stage = Math.max(-1, Math.min(items.length - 1, Math.round(Number(props.stage ?? 0))));
      rows.forEach(({ dot, label }, i) => {
        const on = i <= stage;
        dot.style.background = on ? accent : "transparent";
        dot.style.borderColor = on ? accent : "var(--sd-color-rule)";
        label.style.color = on ? "var(--sd-color-ink)" : "var(--sd-color-muted)";
        label.style.fontWeight = i === stage ? "var(--sd-font-weight-strong)" : "var(--sd-font-weight-body)";
      });
      return stage;
    }

    let shown = render(props);

    return {
      async update(props, info) {
        const before = shown;
        shown = render(props);
        // Animate only when the engine says so (forward by one step, not in capture), and only a change:
        // on the step where the element appears (info.entered) its box already moves. The items that were
        // just reached fade in one after another, with the theme's duration, easing and stagger (or the
        // step's transition). Awaited, so settled() waits and an abort snaps to the end.
        try {
          if (info.animate && !info.entered && !info.signal?.aborted && shown > before) {
            const reached = rows.slice(before + 1, shown + 1).map((r) => r.li);
            // The start state, written now, before any await: no reached item paints before its turn.
            for (const li of reached) li.style.opacity = "0";
            const timing = ctx.motion.timing(info);
            await ctx.animate.stagger(reached, (li, i, o) => {
              // Clear the start state and start the motion in one synchronous block: ctx.motion.in saves the
              // (now empty) inline style, writes its own start state and puts the saved one back at the end.
              li.style.opacity = "";
              return ctx.motion.in(li, "fade", { ...timing, signal: o.signal });
            }, timing);
          }
        } finally {
          // Idempotent end state: no inline opacity left behind, whether the motion ran, was aborted or
          // never started.
          for (const r of rows) r.li.style.opacity = "";
        }
      },
      destroy() {
        list.remove();
      },
    };
  },
};
