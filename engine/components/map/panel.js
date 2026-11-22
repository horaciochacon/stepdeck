// The corner panel of a map with a time-lapse (index.js): the label of the frame on screen, large, and under it the
// `numbers` the step names, each after its label, in `div.sd-map-panel[data-at]` at the corner `at` (the top-left, or
// the top-right when the inset is at the top-left), on the theme's background like the legend (core/stepdeck.css).
// During a run the label and the numbers change at every frame: the box is kept and only their text is written.
// Anything else that changes (the corner, the rows, an opacity) makes the box afresh, so the markup at rest is the same
// however a step was reached. The panel fades with its time-lapse layer and a number with its row; at rest neither
// carries an opacity. The box goes before the legend's, so the element's children keep one order whichever was made last.

/**
 * The panel of a map element.
 * @param {HTMLElement} el the element's box
 * @returns {{ write(panel: { at: string, alpha: number, label: string, rows: { key: string, label: string, text: string, opacity: number }[] } | null): void, destroy(): void }}
 *   `write(null)` removes the panel; a row's `label` may be empty (the number alone)
 */
export function createPanel(el) {
  const doc = el.ownerDocument;
  let box = null;
  let shape = null; // what the box was made from: the corner, the opacities and the rows' keys and labels
  let texts = []; // the nodes of the label and of each number, in that order

  const node = (tag, className, text = "") => {
    const n = doc.createElement(tag);
    n.className = className;
    n.textContent = text;
    return n;
  };
  const fade = (n, opacity) => {
    if (opacity < 1) n.style.opacity = String(opacity);
  };

  function make({ at, alpha, rows }) {
    box = node("div", "sd-map-panel");
    box.setAttribute("data-at", at);
    fade(box, alpha);
    texts = [node("div", "sd-map-panel-frame")];
    box.append(texts[0]);
    for (const { key, label, opacity } of rows) {
      const row = node("div", "sd-map-panel-number");
      row.setAttribute("data-key", key);
      fade(row, opacity);
      if (label !== "") row.append(node("span", "sd-map-panel-name", label));
      const value = node("span", "sd-map-panel-value");
      row.append(value);
      texts.push(value);
      box.append(row);
    }
    const legend = el.querySelector(":scope > .sd-map-legend");
    if (legend) legend.before(box);
    else el.append(box);
  }

  return {
    write(panel) {
      const next = panel && JSON.stringify([panel.at, panel.alpha, panel.rows.map(({ key, label, opacity }) => [key, label, opacity])]);
      if (next !== shape) {
        box?.remove();
        box = null;
        shape = next;
        if (panel) make(panel);
      }
      if (!panel) return;
      [panel.label, ...panel.rows.map((row) => row.text)].forEach((text, i) => {
        if (texts[i].textContent !== text) texts[i].textContent = text;
      });
    },
    destroy() {
      box?.remove();
      box = null;
      shape = null;
      texts = [];
    },
  };
}
