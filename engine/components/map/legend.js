// The legend of a map: one row per layer on screen that has one (`legendRow`, core/chart-scale.js), in a box at a corner
// of the element, `div.sd-map-legend[data-at]`, where core/stepdeck.css places it and stacks the rows away from the
// corner. A row fades with its layer. The box is made afresh at every write, so the markup is the same however a step
// was reached; a legend with no rows, or `legend: false`, writes nothing.
//
// A row may carry a size key (`size: { items: [{ r, label }] }`, from a layer of points) after its colours: a circle of
// radius `r` px for each item, `svg.sd-legend-circle` (sized by attributes, outlined by the theme's CSS), and its label.
// A row with a size key and no `legend` is a title and the key.
import { legendRow } from "../../core/chart-scale.js";
import { SVG_NS } from "../../core/kit.js";

/** An item of a size key: a circle of radius `r` px, and its `label`. */
function circleItem(doc, { r, label }) {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "sd-legend-circle");
  svg.setAttribute("width", String(2 * r));
  svg.setAttribute("height", String(2 * r));
  const circle = doc.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", String(r));
  circle.setAttribute("cy", String(r));
  circle.setAttribute("r", String(r - 0.75)); // inside the 1.5 px outline
  svg.append(circle);
  const text = doc.createElement("span");
  text.className = "sd-legend-label";
  text.textContent = label;
  const item = doc.createElement("span");
  item.className = "sd-legend-item";
  item.append(svg, text);
  return item;
}

/**
 * The legend of a map element.
 * @param {HTMLElement} el the element's box
 * @param {object} ctx the component's ctx (`t` names the "no data" row)
 * @returns {{ write(at: string | false, rows: { id: string, title?: string, legend: object | null, noData: boolean, size?: { items: { r: number, label: string }[] } | null, opacity: number }[]): void, destroy(): void }}
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
      for (const { id, title, legend, noData, size, opacity } of rows) {
        const row = legendRow(doc, legend ?? { kind: "categories", items: [] }, { title, noData, t }); // no colours: the title alone
        for (const item of size?.items ?? []) row.append(circleItem(doc, item));
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
