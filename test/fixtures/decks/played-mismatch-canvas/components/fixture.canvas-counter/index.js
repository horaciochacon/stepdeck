// Deliberately broken: the canvas layer's `data-n` counts the updates that ran, so it depends on the path taken
// to a step. Text and box stay the same, so only the canvas state differs between a jump and an arrival.
export default {
  mount(el, props, ctx) {
    // A fixed box, so nothing else moves.
    Object.assign(el.style, { height: "300px" });
    let n = 0;
    return {
      update() {
        n += 1;
        ctx.chart.canvasLayer(el, { left: 0, top: 0, pw: 200, ph: 100 }).dataset.n = String(n);
      },
      destroy() {
        el.querySelector(".sd-canvas-layer")?.remove();
      },
    };
  },
};
