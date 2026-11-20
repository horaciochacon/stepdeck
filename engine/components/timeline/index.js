// Built-in `timeline`: a track between stops that fills (slide kit 1, §5.2). It also works as the progress
// connector between two steps of a story ("agent's report -> our study").
//
// Everything on screen is a pure function of the props (stopStates in ./stops.js), drawn as one svg sized
// to the element (no viewBox scaling), positioned with attributes only:
//   - a track line between the first and the last stop, and a fill line over it from the start to
//     `progress` of its length (the track is dashed with `dashed`, the fill stays solid);
//   - a circle per stop on the track: hollow until the fill has passed it, then filled; the `current` stop
//     has a larger radius and a bold label;
//   - the label and sub of each stop as html in a foreignObject under the track, so they wrap. Each stop
//     gets a slot as wide as the closest pair of stops allows, and the track is inset by half a slot on each
//     side, so even the first and last labels stay inside the element. The labels are measured (bold, the
//     tallest state, so nothing moves when `current` changes) and the svg is made that tall.
// Every update first writes that state straight into the DOM (writeState), so the DOM after settled() is
// the same whether a state was jumped to or played. With info.animate the fill then tweens from the
// previous progress to the new one and each stop lights up (or goes hollow) as the fill passes it; a
// changed `current` grows the new stop's circle and fades its label in. All motion is bound to info.signal
// (an abort snaps to the end state) and the inline styles it used are removed afterwards.
//
// Colors and font sizes come from theme tokens through CSS (core/stepdeck.css); radii and gaps are
// multiples of --sd-grid. An unknown `current` id, fewer than two stops, or a bad `progress` is an element
// error naming it.
import { renderInline } from "../../core/inline.js";
import { stopStates, reachedAt } from "./stops.js";
import { clearInlineStyle } from "../../core/animate.js";
import { num, svgEl as svgNode, xhtmlEl, sizeSvg, measureWidth, canAnimate, motion, lerp } from "../../core/kit.js";

export default {
  mount(el, props, ctx) {
    const doc = el.ownerDocument;
    const svgEl = (tag, attrs, parent) => svgNode(doc, tag, attrs, parent);
    const htmlEl = (tag, cls, parent) => xhtmlEl(doc, tag, cls, parent);

    const T = ctx.tokens ?? {};
    const grid = num(T["--sd-grid"], 8);
    const R = grid * 1.5; // a stop
    const R_CURRENT = grid * 2.25; // the current stop
    const radius = (current) => String(current ? R_CURRENT : R);
    const rule = num(T["--sd-rule-width"], 2);

    const svg = svgEl("svg", { class: "sd-timeline" }, el);
    let signature = null; // what the current svg was built from: stops and width
    let parts = []; // [{ stop: circle, label: div, at }] in stop order
    let fill = null;
    let geometry = null; // { x0, length } the track
    let shown = { progress: 0, current: -1 }; // what the DOM currently shows

    function build(states, w) {
      svg.replaceChildren();
      // Slot width: the closest pair of stops gets one slot between them; the track is inset by half a slot.
      const gap = Math.min(...states.slice(1).map((s, i) => s.at - states[i].at));
      const slot = (gap * w) / (1 + gap);
      const x0 = slot / 2;
      const length = w - slot;
      const cy = R_CURRENT + rule;
      const labelsTop = cy + R_CURRENT + grid;
      geometry = { x0, length };

      svgEl("line", { class: "sd-timeline-track", x1: x0, y1: cy, x2: x0 + length, y2: cy }, svg);
      fill = svgEl("line", { class: "sd-timeline-fill", x1: x0, y1: cy, x2: x0, y2: cy }, svg);
      const labels = svgEl("g", { class: "sd-timeline-labels" }, svg);
      const stopsLayer = svgEl("g", { class: "sd-timeline-stops" }, svg);
      parts = states.map((s) => {
        const x = x0 + s.at * length;
        const stop = svgEl("circle", { class: "sd-timeline-stop", "data-id": s.id, cx: x, cy, r: R }, stopsLayer);
        const fo = svgEl("foreignObject", { class: "sd-timeline-label-box", x: x - slot / 2 + grid / 2, y: labelsTop, width: Math.max(1, slot - grid), height: 1 }, labels);
        const label = htmlEl("div", "sd-timeline-label", fo);
        label.setAttribute("data-id", s.id);
        label.setAttribute("data-current", "true"); // measured in its tallest (bold) state
        htmlEl("div", "sd-timeline-text", label).innerHTML = renderInline(s.label);
        if (s.sub) htmlEl("div", "sd-timeline-sub", label).innerHTML = renderInline(s.sub);
        return { stop, label, fo, at: s.at, x };
      });
      // The fonts are loaded before mount, so the measured heights are deterministic.
      const tallest = Math.max(1, ...parts.map((p) => p.label.offsetHeight));
      for (const p of parts) p.fo.setAttribute("height", String(tallest));
      sizeSvg(svg, w, labelsTop + tallest);
    }

    /** The fill and the stops for a progress value (also used per frame by the tween). */
    function paint(progress) {
      fill.setAttribute("x2", String(geometry.x0 + progress * geometry.length));
      for (const p of parts) {
        const reached = String(reachedAt(progress, p.at));
        if (p.stop.getAttribute("data-reached") !== reached) p.stop.setAttribute("data-reached", reached);
      }
    }

    /** Writes the state for `props` exactly; returns the derived data and whether the svg was rebuilt. */
    function writeState(props) {
      const states = stopStates(props?.stops, props?.progress);
      let current = -1;
      if (props.current !== undefined && props.current !== null) {
        current = states.findIndex((s) => s.id === props.current);
        if (current < 0) throw new Error(`timeline \`current\` names '${props.current}', which is not a stop id (${states.map((s) => `'${s.id}'`).join(", ")})`);
      }
      const w = measureWidth(el, ctx);
      const next = JSON.stringify([w, states.map((s) => [s.id, s.label, s.sub ?? null, s.at])]);
      const rebuilt = next !== signature;
      if (rebuilt) {
        build(states, w);
        signature = next;
      }
      svg.dataset.dashed = String(props.dashed === true);
      paint(props.progress);
      parts.forEach((p, i) => {
        p.stop.setAttribute("r", radius(i === current));
        p.stop.setAttribute("data-current", String(i === current));
        p.label.setAttribute("data-current", String(i === current));
      });
      const before = shown;
      shown = { progress: props.progress, current };
      return { rebuilt, before };
    }

    /** No inline style survives an update, so the html is the same however the state was reached. */
    function clearInline() {
      clearInlineStyle(...parts.map((p) => p.label));
    }

    writeState(props);

    return {
      async update(props, info = {}) {
        const animate = canAnimate(info);
        const { rebuilt, before } = writeState(props);
        clearInline();
        if (!animate || rebuilt) return;

        const opts = motion(info);
        const now = shown;
        const motions = [];
        if (now.progress !== before.progress) motions.push(ctx.animate.tween(before.progress, now.progress, paint, opts));
        if (now.current !== before.current) {
          const shrink = (t) => parts[before.current].stop.setAttribute("r", String(lerp(R_CURRENT, R, t)));
          if (now.current >= 0) {
            const grow = parts[now.current];
            grow.label.style.opacity = "0";
            motions.push(
              ctx.animate.tween(0, 1, (t) => {
                grow.stop.setAttribute("r", String(lerp(R, R_CURRENT, t)));
                grow.label.style.opacity = String(t);
                if (before.current >= 0) shrink(t);
              }, opts),
            );
          } else if (before.current >= 0) {
            motions.push(ctx.animate.tween(0, 1, shrink, opts));
          }
        }
        try {
          await Promise.all(motions);
        } finally {
          // Back to the exact end state: an abort or a throwing frame leaves nothing half-way.
          paint(now.progress);
          parts.forEach((p, i) => p.stop.setAttribute("r", radius(i === now.current)));
          clearInline();
        }
      },
      destroy() {
        svg.remove();
      },
    };
  },
};
