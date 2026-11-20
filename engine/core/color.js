// WCAG 2 color math shared by the runtime (chart.line's series labels, text badges) and the CLI (palette and
// contrast checks). No imports, no DOM: Node loads it too. Channels are 0..1 unless a name says otherwise.

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

/** The contrast `check` requires of text (WCAG AA for normal text). */
export const TEXT_CONTRAST = 4.5;

const toHex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const rgb255 = (color) => {
  try {
    return parseHex(color).map((v) => Math.round(v * 255));
  } catch {
    return null;
  }
};

/**
 * A colour that reads as text on `background`: `color` itself when it reaches `min` (4.5:1) there, else `color`
 * mixed toward black (toward white on a dark background) in steps of 2% until it does, as "#rrggbb". A palette
 * colour only promises 3:1 (enough for a line or a border); its text uses this. A `color` that is not hex comes
 * back as it is; a `background` that is not hex counts as white.
 */
export function textColor(color, background, min = TEXT_CONTRAST) {
  const c = rgb255(color);
  if (!c) return color;
  const bg = rgb255(background) ?? [255, 255, 255];
  const lum = (rgb) => luminance(rgb.map((v) => v / 255));
  const target = lum(bg) > 0.18 ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0; t <= 1; t += 0.02) {
    const mixed = c.map((v, i) => Math.round(v + (target[i] - v) * t));
    if (contrast(lum(mixed), lum(bg)) >= min) return toHex(mixed);
  }
  return toHex(target);
}
