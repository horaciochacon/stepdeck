// demo.story: a custom component that draws its own SVG and reuses the built-in `text` through
// ctx.mount (spec §6.2 "Escape hatch", §6.3). A renderer of props: everything on screen is a pure
// function of `stage`, so a jumped state equals a played one. The slide drives `stage` with `advance`.
//
// Colors come from ctx.palette and theme tokens (CSS variables), sizes from theme tokens; no literal
// color or size beyond the geometry of the strip.
const STAGES = ["Collect", "Clean", "Model", "Share"];
const CAPTIONS = [
  "Study sites send raw case forms.",
  "Forms are cleaned and checked.",
  "A model estimates the response at each dose.",
  "The result goes to the study team.",
];
const LAST = STAGES.length - 1;
const NS = "http://www.w3.org/2000/svg";

const clampStage = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error("demo.story: `stage` must be a number from 0 to 3");
  return Math.max(0, Math.min(LAST, Math.round(n)));
};

export default {
  async mount(el, props, ctx) {
    const doc = el.ownerDocument;
    const colors = ctx.palette?.("categorical")?.colors ?? [];
    const accent = colors[0] ?? "currentColor";
    const marker = colors[1] ?? accent;
    const labelSize = parseFloat(ctx.tokens?.["--sd-font-size-note"]) || 32;

    const width = ctx.size.w > 0 ? ctx.size.w : 1200;
    const height = ctx.size.h > 0 ? Math.round(ctx.size.h * 0.4) : 300; // the strip takes 40% of the box
    const margin = 140;
    const xAt = (i) => margin + (i * (width - 2 * margin)) / LAST;
    const y = Math.round(height * 0.4);
    const labelY = y + 110;
    const nodeR = 34;

    const make = (tag, attrs, parent) => {
      const node = doc.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      parent.appendChild(node);
      return node;
    };

    // One wrapper centers the strip and its caption in the element's box.
    const root = doc.createElement("div");
    root.className = "sd-story";
    Object.assign(root.style, { display: "flex", flexDirection: "column", justifyContent: "center", gap: "24px", height: "100%" });
    el.appendChild(root);

    const svg = make("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", height: String(height), role: "img", "aria-label": "Pipeline stages" }, root);
    make("line", { x1: xAt(0), y1: y, x2: xAt(LAST), y2: y, "stroke-width": 8, "stroke-linecap": "round" }, svg).style.stroke = "var(--sd-color-rule)";
    const progress = make("line", { class: "sd-story-progress", x1: xAt(0), y1: y, x2: xAt(0), y2: y, "stroke-width": 8, "stroke-linecap": "round" }, svg);
    progress.style.stroke = accent;
    const nodes = STAGES.map((name, i) => {
      const node = make("circle", { class: "sd-story-node", cx: xAt(i), cy: y, r: nodeR, "stroke-width": 4 }, svg);
      const label = make("text", { x: xAt(i), y: labelY, "text-anchor": "middle" }, svg);
      label.textContent = name;
      label.style.fontSize = `${labelSize}px`;
      label.style.fill = "var(--sd-color-ink)";
      return { node, label };
    });
    const ring = make("circle", { class: "sd-story-marker", cx: xAt(0), cy: y, r: nodeR + 16, fill: "none", "stroke-width": 6 }, svg);
    ring.style.stroke = marker;
    svg.dataset.stage = "0";

    const caption = doc.createElement("div");
    caption.className = "sd-story-caption";
    caption.style.textAlign = "center";
    root.appendChild(caption);
    // The built-in `text` is mounted into our own div; the component owns when and what it shows.
    const text = await ctx.mount("text", caption, { text: CAPTIONS[clampStage(props.stage)], role: "body" });

    let shownX = xAt(0); // where the marker is drawn now (an animation may be mid-way)

    /** Writes the whole drawing for `stage` (and the marker at x): the single source of truth. */
    function render(stage, x = xAt(stage)) {
      shownX = x;
      ring.setAttribute("cx", String(x));
      progress.setAttribute("x2", String(x));
      svg.dataset.stage = String(stage);
      nodes.forEach(({ node, label }, i) => {
        const on = i <= stage;
        node.dataset.on = String(on);
        node.style.fill = on ? accent : "var(--sd-color-background)";
        node.style.stroke = on ? accent : "var(--sd-color-rule)";
        label.style.fontWeight = i === stage ? "700" : "400";
      });
    }
    render(clampStage(props.stage));

    return {
      async update(props, info) {
        const stage = clampStage(props.stage);
        const target = xAt(stage);
        const from = shownX;
        // The strip and the nested text update together; one Promise.all so a rejection from either
        // reaches the engine (and no promise is left unhandled while the other branch is awaited).
        const strip = async () => {
          if (info.animate && from !== target) {
            await ctx.animate.tween(from, target, (x) => render(stage, x), { signal: info.signal, duration: info.transition?.duration });
          }
          render(stage); // end state, whether the tween ran, was aborted or never started
        };
        await Promise.all([strip(), text.update({ text: CAPTIONS[stage], role: "body" }, info)]);
      },
      pause() {},
      destroy() {
        root.remove();
      },
    };
  },
};
