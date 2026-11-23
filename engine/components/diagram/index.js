// Built-in `diagram`: nodes, arrows and nested groups on an explicit grid, appearing by step.
//
// Geometry is a pure function of the props, the element's size and the measured label sizes (placeDiagram
// in ./place.js). The grid cell is only a node's placement slot: the drawn shape is sized to its label
// (plus the group padding), centred in its cell and capped at it. Everything is one svg sized to the
// element (no viewBox scaling), positioned with attributes only:
//   - groups: a rect around all their members' drawn shapes (shown or not, so a box never resizes between
//     steps); the label is html in a foreignObject inside the group's top padding;
//   - edges: an svg line between the drawn shapes' borders with an arrowhead <marker> (one per element, its
//     id derived from the element id so the markup is the same however a state was reached); an optional
//     label in a top layer above the nodes, beside the midpoint (above a mostly horizontal edge, right of a
//     mostly vertical one), over a background-colored backing;
//   - nodes: the label and sub as html in a foreignObject spanning the cell, so they wrap there; the label
//     is measured (offsetWidth/offsetHeight, deterministic once the theme's fonts are loaded, which happens
//     before mount) and the shape (box, pill, circle, or none for text) is drawn around it. A label too long
//     for its cell is never shrunk: the foreignObject does not clip, so `check` sees text that leaves the
//     region. A `card` is not measured: its rounded rect is its cell, with a stripe (--sd-diagram-stripe
//     wide) on the left edge, clipped to the card's corners, and the label left- and top-aligned beside it.
//   - kinds: a node with a `kind` (a text node ignores it) takes the next colour of ctx.palette("categorical")
//     in order of first appearance in `nodes` (kindOrder), shown or not. Its g gets data-kind and an inner
//     g.sd-diagram-paint holding the shape, the stripe and the label, with the colour as --sd-kind in its style
//     attribute, written at build time; CSS paints the stripe, or a box, pill or circle's outline, from it. The
//     motion never touches the paint group (it fades the node's g and tweens the shape and the stripe), so
//     clearing the motion's inline styles never wipes the colour. A node without a kind has no such group.
// `shown` hides the parts it does not list (visibility, so nothing moves) and `highlight` dims the parts it
// does not list: their outlines and lines turn the theme's --sd-color-dim (a node or group is filled with the
// background color, opacity stays 1) and their text turns muted, so contrast holds. The focused parts are drawn
// after (above) the dimmed ones in each layer, in an order that depends on the state alone.
//
// Compact (`compact: true`, a second view): the same definition drawn small, shapes only. No label, legend or
// edge label is created (no foreignObject but the caption's); placeDiagram's compact placement makes every shape
// fill its cell and leaves out `text` nodes and the edges that touch them. The svg gets data-compact="true"; its
// first child is rect.sd-second-view-frame at the element's edge (inset by half the frame's stroke, so the stroke
// stays inside the element); the drawing sits in a g.sd-diagram-body translated into the frame's content box (the
// element inset by the compact pad) below the caption's band. The band (one label line plus the compact pad) is
// reserved when this step or any step of the slide (ctx.stepProps; the current props alone without it) has a
// compact caption, so a caption that comes or goes moves nothing; the caption is html (div.sd-second-view-caption,
// inline Markdown) in a foreignObject over the band. With a highlight, a lit node takes its kind's colour (the
// accent without one) as a double-width outline over a tint of it, every other part dims as above. Chrome reports
// a CSS color-mix() as color(srgb ...), which tweenColor cannot read, so the tint is computed here at build time
// (the colour mixed into --sd-color-background by --sd-compact-tint, 20% when a theme lacks it) and written as
// --sd-kind-tint beside --sd-kind on the paint group; the accent's tint, for a node without a kind, is
// --sd-accent-tint on the body group. Neither group is ever touched by the motion.
//
// Gap and group padding come from the theme tokens --sd-diagram-gap and --sd-diagram-pad, read through
// ctx.tokens (diagramSpacing: 3 x and 1 x --sd-space when a theme lacks them); a compact diagram uses
// --sd-diagram-compact-gap and --sd-diagram-compact-pad (1 x and 0.25 x --sd-space). A labelled group's top
// padding grows by one label line (--sd-font-size-label x --sd-line-height-tight). Colors and font sizes
// are set by CSS (core/stepdeck.css) from tokens; nothing here sets a color or a font size but the tints above.
//
// Every update first writes the state straight into the DOM (data attributes), so the DOM after settled()
// is the same whether a state was jumped to or played. With info.animate it then plays the change from the
// previous state: newly shown groups fade in (ctx.motion.in "fade") and newly shown nodes pop in ("pop",
// staggered by --sd-stagger), then newly shown edges draw from source to target (dashed ones fade); a
// highlight change tweens the outline, fill, stripe and text colors over --sd-duration-fast (in compact, a node
// that becomes lit or stops being lit tweens too; its outline's width does not move); a caption change fades the
// old caption out and the new one in, each over half of --sd-duration. All the rest takes the theme's timing. All
// motion is bound to info.signal (an abort snaps to the end state) and the inline styles it used are removed
// afterwards.
//
// The diagram owns its entrance (`"x-enter": "own"` in schema.json). With info.entrance.motion "draw" it plays
// the same build from an empty "before" (nothing shown) to this step's state, while its box stays still, in
// order: the groups fade in, then the nodes pop in one after another, then the edges draw. The parts' start
// state (opacity 0) is written before the first await, in the same task as the engine shows the element, so
// nothing paints built first. Any other update of a freshly shown element (an entrance of "none", or a box
// that moves instead) snaps to the end state.
//
// An id that names nothing (an edge end, a group member, `shown`, `highlight`) is an element error naming
// it, and so are more distinct kinds than the theme's categorical palette has colours. Overlapping sibling
// groups still render; `validate` reports them.
import { renderInline } from "../../core/inline.js";
import { placeDiagram, diagramProblems, diagramSpacing, edgeId, kindOrder } from "./place.js";
import { clearInlineStyle } from "../../core/animate.js";
import { num, svgEl as svgNode, xhtmlEl, sizeSvg, measureWidth, measureHeight, canAnimate, motion, motionMs, tweenColor } from "../../core/kit.js";

const MARKER = { size: 6 }; // arrowhead length and width, in stroke widths (markerUnits="strokeWidth")

/** Throws on what would otherwise draw a blank or wrong diagram: a missing grid or nodes, an unknown id. */
function assertProps(props) {
  for (const key of ["cols", "rows"]) {
    if (!Number.isInteger(props?.[key]) || props[key] < 1) throw new Error(`diagram needs \`${key}\`, an integer >= 1`);
  }
  if (!Array.isArray(props.nodes) || props.nodes.length === 0) throw new Error("diagram needs a non-empty `nodes` array");
  const bad = diagramProblems(props).find((p) => p.rule === "diagram-id");
  if (bad) throw new Error(`diagram: ${bad.message} (${bad.limit})`);
}

export default {
  mount(el, props, ctx) {
    const doc = el.ownerDocument;
    const svgEl = (tag, attrs, parent) => svgNode(doc, tag, attrs, parent);
    const htmlEl = (tag, cls, parent) => xhtmlEl(doc, tag, cls, parent);

    const T = ctx.tokens ?? {};
    const finite = (v) => (Number.isFinite(v) ? v : 0);
    const spacing = diagramSpacing(T);
    const gap = finite(spacing.gap);
    const pad = finite(spacing.pad);
    const compactSpacing = diagramSpacing(T, { compact: true });
    const compactGap = finite(compactSpacing.gap);
    const compactPad = finite(compactSpacing.pad);
    const grid = num(T["--sd-grid"], pad / 2);
    const stripeW = num(T["--sd-diagram-stripe"], grid);
    const rule = num(T["--sd-rule-width"], 1);
    const frameW = num(T["--sd-inset-stroke-width"], rule);
    const tintShare = num(T["--sd-compact-tint"], 20) / 100;
    // One label line: a group's legend, and a compact diagram's caption.
    const legendH = Math.ceil(num(T["--sd-font-size-label"], 0) * num(T["--sd-line-height-tight"], 1));
    const markerId = `sd-diagram-arrow-${String(el.dataset?.el ?? "el").replace(/[^\w-]/g, "_")}`;

    const svg = svgEl("svg", { class: "sd-diagram" }, el);
    let signature = null;
    let parts = []; // [{ id, kind, g, shape, line, text }]
    let layers = null; // the svg groups the parts are drawn in, by kind: { group, node, edge, tag }
    let caption = null; // a compact diagram's caption (a div), when its band is reserved
    let captionText = null; // the caption source the div holds
    const touched = new Set(); // nodes whose inline style the motion wrote

    const measure = () => ({ w: measureWidth(el, ctx), h: measureHeight(el, ctx) });

    /** The label's measured size -> the drawn shape's size (label plus padding; a text node is its text). */
    const shapeSize = (shape, lw, lh) => {
      if (shape === "text") return { w: lw, h: lh };
      if (shape === "circle") {
        const d = Math.hypot(lw, lh) + 2 * pad;
        return { w: d, h: d };
      }
      const hh = lh + 2 * pad;
      return shape === "pill" ? { w: lw + hh, h: hh } : { w: lw + 2 * pad, h: hh };
    };
    /** Where a node's label may lay out inside its cell (it wraps at this width and is centred in it). */
    const labelArea = (shape, cell) => {
      if (shape === "text") return cell;
      if (shape === "card") return { x: cell.x + pad + stripeW, y: cell.y + pad, w: cell.w - 2 * pad - stripeW, h: cell.h - 2 * pad };
      if (shape === "circle") {
        const side = Math.max(1, (Math.min(cell.w, cell.h) - 2 * pad) / Math.SQRT2);
        return { x: cell.x + (cell.w - side) / 2, y: cell.y + (cell.h - side) / 2, w: side, h: side };
      }
      return { x: cell.x + pad, y: cell.y + pad, w: cell.w - 2 * pad, h: cell.h - 2 * pad };
    };

    /** Kind -> colour: each distinct kind takes the next colour of the categorical palette; too few is an error. */
    function kindColors(props) {
      const kinds = kindOrder(props.nodes);
      const colors = ctx.palette?.("categorical")?.colors ?? [];
      if (kinds.length > colors.length) throw new Error(`diagram has ${kinds.length} kinds; the categorical palette has ${colors.length} colours`);
      return new Map(kinds.map((kind, i) => [kind, colors[i]]));
    }

    /** `color` mixed into the theme's background by --sd-compact-tint, as rgb(); null when either is unknown. */
    function tintOf(color) {
      const bg = T["--sd-color-background"];
      const d3 = ctx.d3;
      if (!d3 || !d3.color(bg ?? "") || !d3.color(color ?? "")) return null;
      return d3.interpolateRgb(bg, color)(tintShare);
    }

    /** Whether a compact caption is drawn at these props: compact, with some text. */
    const captioned = (p) => p?.compact === true && typeof p.caption === "string" && p.caption.trim() !== "";

    /** Writes the caption's text (inline Markdown), when the div does not hold it already. */
    function writeCaption(text) {
      if (!caption || text === captionText) return;
      captionText = text;
      caption.innerHTML = renderInline(text);
    }

    /**
     * Draws the diagram afresh. `compact`: the second view (see the header); `band`: the height of its caption's
     * band, 0 for none.
     */
    function build(props, w, h, kindColor, { compact, band }) {
      svg.replaceChildren();
      // The svg's own attributes are written afresh, in one order, so its markup never depends on an earlier build.
      for (const { name } of [...svg.attributes]) if (name !== "class") svg.removeAttribute(name);
      sizeSvg(svg, w, h);
      if (compact) {
        svg.dataset.compact = "true";
        svgEl("rect", { class: "sd-second-view-frame", x: frameW / 2, y: frameW / 2, width: Math.max(0, w - frameW), height: Math.max(0, h - frameW) }, svg);
      }
      const defs = svgEl("defs", {}, svg);
      const marker = svgEl("marker", { id: markerId, viewBox: "0 0 10 10", refX: 5, refY: 5, markerWidth: MARKER.size, markerHeight: MARKER.size, markerUnits: "strokeWidth", orient: "auto-start-reverse" }, defs);
      svgEl("path", { class: "sd-diagram-arrowhead", d: "M0,0 L10,5 L0,10 z" }, marker);
      // A compact drawing sits in the frame's content box, below the caption's band.
      const accentTint = compact ? tintOf(T["--sd-color-accent"]) : null;
      const body = compact
        ? svgEl("g", { class: "sd-diagram-body", transform: `translate(${compactPad} ${compactPad + band})`, ...(accentTint ? { style: `--sd-accent-tint: ${accentTint}` } : {}) }, svg)
        : svg;
      // Edge labels are the top layer, so a node never covers them.
      const drawn = {
        groups: svgEl("g", { class: "sd-diagram-groups" }, body),
        edges: svgEl("g", { class: "sd-diagram-edges" }, body),
        nodes: svgEl("g", { class: "sd-diagram-nodes" }, body),
        tags: svgEl("g", { class: "sd-diagram-edge-labels" }, body),
      };
      layers = { group: drawn.groups, node: drawn.nodes, edge: drawn.edges, tag: drawn.tags };
      parts = [];
      const opts = compact
        ? { width: Math.max(0, w - 2 * compactPad), height: Math.max(0, h - 2 * compactPad - band), gap: compactGap, pad: compactPad, compact: true }
        : { width: w, height: h, gap, pad, legend: legendH };

      // Nodes, in two passes: the labels are laid out in their cells, then all measured at once (deterministic:
      // the theme's fonts are loaded before mount), then the shapes are drawn at that size, centred in the cell.
      // A compact diagram has no labels: its shapes fill their cells.
      const first = placeDiagram(props, opts);
      const nodeParts = [];
      for (const def of props.nodes) {
        const cell = first.cells.get(def.id);
        if (!cell) continue;
        const kind = def.shape !== "text" && kindColor.has(def.kind) ? def.kind : null;
        const g = svgEl("g", { class: "sd-diagram-node", "data-part": "node", "data-id": def.id, "data-shape": def.shape, ...(kind ? { "data-kind": kind } : {}) }, drawn.nodes);
        // A kinded node paints inside its own group, so the colour is not on a node the motion touches.
        const tint = compact && kind ? tintOf(kindColor.get(kind)) : null;
        const paint = kind ? svgEl("g", { class: "sd-diagram-paint", style: `--sd-kind: ${kindColor.get(kind)}${tint ? `; --sd-kind-tint: ${tint}` : ""}` }, g) : g;
        if (compact) {
          nodeParts.push({ def, g, paint, text: null, content: null });
          continue;
        }
        const area = labelArea(def.shape, cell);
        const fo = svgEl("foreignObject", { class: "sd-diagram-label-box", x: area.x, y: area.y, width: Math.max(1, area.w), height: Math.max(1, area.h) }, paint);
        const content = htmlEl("div", "sd-diagram-label-content", htmlEl("div", "sd-diagram-label", fo));
        const text = htmlEl("div", "sd-diagram-text", content);
        text.innerHTML = renderInline(def.label);
        if (def.sub) htmlEl("div", "sd-diagram-sub", content).innerHTML = renderInline(def.sub);
        nodeParts.push({ def, g, paint, text, content });
      }
      const sizes = new Map();
      for (const { def, content } of nodeParts) {
        if (content && def.shape !== "card" && content.offsetWidth > 0) sizes.set(def.id, shapeSize(def.shape, content.offsetWidth, content.offsetHeight));
      }
      const layout = compact ? first : placeDiagram(props, { ...opts, sizes });
      for (const [i, { def, g, paint, text }] of nodeParts.entries()) {
        const box = layout.nodes.get(def.id);
        const r = Math.min(box.w, box.h) / 2;
        const rounded = def.shape === "pill" ? r : def.shape === "box" || def.shape === "card" ? grid : 0;
        const shape =
          def.shape === "circle"
            ? svgEl("circle", { class: "sd-diagram-shape", cx: box.x + box.w / 2, cy: box.y + box.h / 2, r })
            : svgEl("rect", { class: "sd-diagram-shape", x: box.x, y: box.y, width: box.w, height: box.h, rx: rounded });
        paint.prepend(shape);
        let stripe = null;
        if (def.shape === "card") {
          // The stripe is clipped to the card's rounded corners by a copy of the card's rect.
          const clip = `${markerId}-card-${i}`;
          svgEl("rect", { x: box.x, y: box.y, width: box.w, height: box.h, rx: rounded }, svgEl("clipPath", { id: clip }, defs));
          stripe = svgEl("rect", { class: "sd-diagram-stripe", x: box.x, y: box.y, width: Math.min(stripeW, box.w), height: box.h, "clip-path": `url(#${clip})` });
          shape.after(stripe);
        }
        parts.push({ id: def.id, kind: "node", g, shape, stripe, text });
      }

      // Groups, outermost first so inner boxes and labels draw on top. The legend sits inside the group's
      // top padding (placeDiagram reserves one legend line per labelled level), so nested legends never meet.
      const groups = (props.groups ?? []).filter((g) => layout.groups.has(g.id)).sort((a, b) => layout.groups.get(b.id).depth - layout.groups.get(a.id).depth);
      for (const def of groups) {
        const box = layout.groups.get(def.id);
        const g = svgEl("g", { class: "sd-diagram-group", "data-part": "group", "data-id": def.id, "data-depth": box.depth, "data-dashed": String(def.dashed === true) }, drawn.groups);
        const shape = svgEl("rect", { class: "sd-diagram-shape", x: box.x, y: box.y, width: box.w, height: box.h, rx: grid }, g);
        if (box.label) {
          const fo = svgEl("foreignObject", { class: "sd-diagram-legend-box", x: box.label.x, y: box.label.y, width: Math.max(1, box.label.w), height: box.label.h }, g);
          htmlEl("span", "sd-diagram-legend", htmlEl("div", "sd-diagram-legend-row", fo)).innerHTML = renderInline(def.label);
        }
        parts.push({ id: def.id, kind: "group", g, shape });
      }

      // Edges: the line stops half an arrowhead short of the border; the marker's tip reaches it. A label
      // goes in the top layer beside the midpoint (above a mostly horizontal edge, right of a mostly vertical
      // one), as wide as the edge (at least four label lines), over a background-colored backing.
      const back = (MARKER.size * rule) / 2;
      const edgeDefs = new Map((props.edges ?? []).map((e) => [edgeId(e), e]));
      for (const e of layout.edges) {
        const def = edgeDefs.get(e.id);
        const len = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
        const k = len > back ? (len - back) / len : 1;
        const g = svgEl("g", { class: "sd-diagram-edge", "data-part": "edge", "data-id": e.id, "data-dashed": String(def?.dashed === true) }, drawn.edges);
        const line = svgEl("line", { class: "sd-diagram-line", x1: e.x1, y1: e.y1, x2: e.x1 + (e.x2 - e.x1) * k, y2: e.y1 + (e.y2 - e.y1) * k, "marker-end": `url(#${markerId})` }, g);
        let tag = null;
        if (def?.label && !compact) {
          const mx = (e.x1 + e.x2) / 2;
          const my = (e.y1 + e.y2) / 2;
          const horizontal = Math.abs(e.x2 - e.x1) >= Math.abs(e.y2 - e.y1);
          const boxW = Math.min(w, Math.max(len, legendH * 4));
          const boxH = legendH * 3;
          const at = horizontal ? { x: mx - boxW / 2, y: my - grid - boxH } : { x: mx + grid, y: my - boxH / 2 };
          tag = svgEl("g", { class: "sd-diagram-edge-tag", "data-for": e.id }, drawn.tags);
          const fo = svgEl("foreignObject", { class: "sd-diagram-edge-label-box", x: at.x, y: at.y, width: boxW, height: boxH }, tag);
          const row = htmlEl("div", "sd-diagram-edge-label-row", fo);
          row.dataset.side = horizontal ? "above" : "right";
          htmlEl("span", "sd-diagram-edge-label", row).textContent = def.label;
        }
        parts.push({ id: e.id, kind: "edge", g, line, tag, dashed: def?.dashed === true });
      }

      // The caption: one line over its band, inside the frame, above everything. renderState writes its text.
      caption = null;
      captionText = null;
      if (band > 0) {
        const fo = svgEl("foreignObject", { class: "sd-second-view-caption-box", x: compactPad, y: compactPad, width: Math.max(1, w - 2 * compactPad), height: Math.max(1, band - compactPad) }, svg);
        caption = htmlEl("div", "sd-second-view-caption", fo);
      }
    }

    /**
     * Draws the focused parts after (above) the dimmed ones, in each layer: the build order, dimmed first. It
     * depends on the state alone, so a played step and a jump end with the same order.
     */
    function stack() {
      const place = (layer, nodes) => {
        if (!nodes.every((n, i) => layer.children[i] === n)) layer.append(...nodes);
      };
      const dimmed = (g) => g.dataset.dim === "true";
      const first = (list) => [...list.filter((g) => dimmed(g)), ...list.filter((g) => !dimmed(g))];
      for (const kind of ["group", "node", "edge"]) {
        const own = parts.filter((p) => p.kind === kind);
        place(layers[kind], first(own.map((p) => p.g)));
        if (kind === "edge") place(layers.tag, first(own.filter((p) => p.tag).map((p) => p.tag)));
      }
    }

    /** Writes the state for `props` exactly; -> { rebuilt }. */
    function renderState(props) {
      assertProps(props);
      const { w, h } = measure();
      // `compact` is structure (a step that turns it on or off rebuilds); the caption is state, but whether its
      // band is reserved is structure, the same at every step of the slide.
      const compact = props.compact === true;
      const band = compact && [props, ...(ctx.stepProps ?? [])].some(captioned) ? legendH + compactPad : 0;
      const next = JSON.stringify([w, h, props.cols, props.rows, props.nodes, props.edges ?? [], props.groups ?? [], compact, band]);
      const kindColor = kindColors(props);
      const rebuilt = next !== signature;
      if (rebuilt) {
        build(props, w, h, kindColor, { compact, band });
        signature = next;
      }
      writeCaption(captioned(props) ? props.caption : "");
      const shown = Array.isArray(props.shown) ? new Set(props.shown) : null;
      const highlight = Array.isArray(props.highlight) && props.highlight.length ? new Set(props.highlight) : null;
      svg.dataset.highlight = String(highlight !== null);
      for (const p of parts) {
        for (const g of [p.g, p.tag]) {
          if (!g) continue;
          g.dataset.visible = String(!shown || shown.has(p.id));
          g.dataset.dim = String(highlight !== null && !highlight.has(p.id));
        }
      }
      stack();
      return { rebuilt };
    }

    /** No inline style survives an update, so the html is the same however the state was reached. */
    function clearInline() {
      clearInlineStyle(...touched);
      touched.clear();
    }
    const styleOf = (node) => {
      touched.add(node);
      return node.style;
    };

    renderState(props);

    return {
      async update(props, info = {}) {
        const draw = info.entrance?.motion === "draw" && !info.signal?.aborted;
        // An element that just appeared without a drawn entrance (none, or its box moves) snaps.
        const animate = draw || (canAnimate(info) && !info.entered);
        const dimmable = (p) => p.shape ?? p.line;
        // The previous state, read before it is overwritten (only when there is motion to play). A drawn
        // entrance builds from nothing: no part is shown yet.
        const paintOf = (p) => {
          const cs = getComputedStyle(dimmable(p));
          return { stroke: cs.stroke, fill: cs.fill, stripe: p.stripe ? getComputedStyle(p.stripe).fill : null, text: p.text ? getComputedStyle(p.text).color : null };
        };
        // How a part looks: dimmed, plain, or (a node of a highlighted compact diagram) lit.
        const lookOf = (p, dim) => (dim ? "dim" : p.kind === "node" && svg.dataset.compact === "true" && svg.dataset.highlight === "true" ? "lit" : "plain");
        const snapshot = () =>
          new Map(parts.map((p) => {
            const dim = p.g.dataset.dim === "true";
            return [p.id, { visible: p.g.dataset.visible === "true", dim, look: lookOf(p, dim), paint: paintOf(p) }];
          }));
        const before = animate && !draw ? snapshot() : null;
        const captionFrom = captionText;
        let rebuilt;
        try {
          ({ rebuilt } = renderState(props));
        } finally {
          clearInline();
        }
        if (!animate || (!draw && rebuilt)) return;
        const captionTo = captionText;

        const opts = motion(info, ctx);
        const fast = motion(info, ctx, { fast: true }); // a focus change
        if (draw && info.entrance.duration !== undefined) opts.duration = info.entrance.duration;
        const now = snapshot();
        const appearing = { group: [], node: [], edge: [] };
        const fades = []; // highlight changes on parts visible before and after: their colors move
        for (const p of parts) {
          const a = before?.get(p.id) ?? { visible: false, dim: now.get(p.id)?.dim };
          const b = now.get(p.id);
          if (!a || !b) continue;
          if (b.visible && !a.visible) {
            appearing[p.kind].push(p);
            // The start state, written now: nothing of the part paints before its slot.
            styleOf(p.g).opacity = "0";
            if (p.tag) styleOf(p.tag).opacity = "0";
          } else if (b.visible && a.look !== b.look) {
            fades.push({ p, from: a.paint, to: b.paint });
          }
        }
        // A caption change: the old caption fades out, the text swaps, the new one fades in, each over half the
        // step's duration. The old text is put back before the first await, so no frame shows the new one early.
        const recaption = !draw && caption !== null && captionTo !== captionFrom;
        const crossfade = async () => {
          const style = styleOf(caption);
          const half = { ...opts, duration: (opts.duration ?? motionMs(info, ctx)) / 2 };
          await ctx.animate.tween(1, 0, (v) => { style.opacity = String(v); }, half);
          writeCaption(captionTo);
          await ctx.animate.tween(0, 1, (v) => { style.opacity = String(v); }, half);
        };

        // Hand a part's start state to the motion in one synchronous block: it saves the (now empty) inline
        // opacity, writes the start again, and puts the saved state back at the end.
        const play = (node, name, o) => {
          styleOf(node).opacity = "";
          return ctx.motion.in(node, name, { ...opts, signal: o.signal });
        };
        // The outline, the fill and the text color of a part move to those of its new state.
        const fadeDim = ({ p, from, to }) => {
          const shape = styleOf(dimmable(p));
          const text = p.text ? styleOf(p.text) : null;
          const stripe = p.stripe ? styleOf(p.stripe) : null;
          return Promise.all([
            ...["stroke", "fill"].filter((k) => from[k] !== to[k]).map((k) => tweenColor(ctx, from[k], to[k], (c) => { shape[k] = c; }, fast)),
            ...(stripe && from.stripe !== to.stripe ? [tweenColor(ctx, from.stripe, to.stripe, (c) => { stripe.fill = c; }, fast)] : []),
            ...(text && from.text !== to.text ? [tweenColor(ctx, from.text, to.text, (c) => { text.color = c; }, fast)] : []),
          ]);
        };
        const drawEdge = async (p, o) => {
          if (p.dashed) {
            await Promise.all([play(p.g, "fade", o), p.tag ? play(p.tag, "fade", o) : null]);
            return;
          }
          styleOf(p.g).opacity = "";
          const line = styleOf(p.line);
          line.markerEnd = "none"; // the arrowhead lands once the line reaches the target
          await ctx.animate.drawPath(p.line, { ...opts, signal: o.signal });
          line.markerEnd = "";
          if (p.tag) await play(p.tag, "fade", o);
        };

        try {
          if (recaption) writeCaption(captionFrom);
          const groups = Promise.all(appearing.group.map((p) => play(p.g, "fade", opts)));
          // A drawn entrance builds in order, groups before nodes; a later step moves them together.
          if (draw) await groups;
          await Promise.all([
            groups,
            ctx.animate.stagger(appearing.node, (p, _i, o) => play(p.g, "pop", o), opts),
            ...fades.map(fadeDim),
            recaption ? crossfade() : null,
          ]);
          await ctx.animate.stagger(appearing.edge, (p, _i, o) => drawEdge(p, o), opts);
        } finally {
          writeCaption(captionTo);
          clearInline();
        }
      },
      destroy() {
        svg.remove();
      },
    };
  },
};
