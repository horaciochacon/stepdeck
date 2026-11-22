// The legend of a map: one row per layer on screen that has one (`legendRow`, core/chart-scale.js), in a box at a corner
// of the element, `div.sd-map-legend[data-at]`, where core/stepdeck.css places it and stacks the rows away from the
// corner. A row fades with its layer. The box is made afresh at every write, so the markup is the same however a step
// was reached; a legend with no rows, or `legend: false`, writes nothing.
import { legendRow } from "../../core/chart-scale.js";

/**
 * The legend of a map element.
 * @param {HTMLElement} el the element's box
 * @param {object} ctx the component's ctx (`t` names the "no data" row)
 * @returns {{ write(at: string | false, rows: { id: string, title?: string, legend: object, noData: boolean, opacity: number }[]): void, destroy(): void }}
 */
export function createLegend(el, ctx) {
  const doc = el.ownerDocument;
  const t = ctx.t ?? ((key) => key);
  let box = null;
  return {
    write(at, rows) {
      box?.remove();
      box = null;
      if (at === false || rows.length === 0) return;
      box = doc.createElement("div");
      box.className = "sd-map-legend";
      box.setAttribute("data-at", at);
      for (const { id, title, legend, noData, opacity } of rows) {
        const row = legendRow(doc, legend, { title, noData, t });
        row.setAttribute("data-layer", id);
        if (opacity < 1) row.style.opacity = String(opacity);
        box.append(row);
      }
      el.append(box);
    },
    destroy() {
      box?.remove();
    },
  };
}
