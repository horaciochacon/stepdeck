// Bare shell (spec §9): shows one slide canvas, scaled to fit the viewport and letterboxed.
// No navigation of its own; STEPDECK.goTo drives it. All CLI commands render through it.
//
// createBareShell({ document }) -> { stage, show(canvasRoot), scale(): number, destroy() }
import { CANVAS } from "../constants.js";

export { CANVAS };

export function createBareShell({ document: doc = globalThis.document } = {}) {
  const win = doc.defaultView;
  const stage = doc.createElement("div");
  stage.className = "sd-stage";
  doc.body.appendChild(stage);
  let canvas = null;
  let scale = 1;

  const fit = () => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    scale = Math.min(w / CANVAS.w, h / CANVAS.h) || 1;
    if (!canvas) return;
    const x = (w - CANVAS.w * scale) / 2;
    const y = (h - CANVAS.h * scale) / 2;
    canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  };
  win?.addEventListener("resize", fit);

  return {
    stage,
    show(root) {
      stage.replaceChildren(root);
      canvas = root;
      fit();
    },
    scale: () => scale,
    destroy() {
      win?.removeEventListener("resize", fit);
      stage.remove();
    },
  };
}
