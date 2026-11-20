// WCAG 2 color math shared by the runtime (chart.line's label colors) and the CLI (palette and contrast
// checks). No imports, no DOM: Node loads it too. Channels are 0..1 unless a name says otherwise.

/** "#rgb" or "#rrggbb" (the "#" is optional) -> [r, g, b] in 0..1. Throws on anything else. */
export function parseHex(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) throw new Error(`not a hex color: ${hex}`);
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

/** sRGB channel (0..1) -> linear light. */
export const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** WCAG 2 relative luminance of [r, g, b] in 0..1. */
export const luminance = ([r, g, b]) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

/** WCAG 2 contrast ratio (1–21, unrounded) of two relative luminances. */
export function contrast(la, lb) {
  const [hi, lo] = [la, lb].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
